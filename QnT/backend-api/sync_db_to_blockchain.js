/**
 * sync_db_to_blockchain.js
 * 
 * Đọc orders ĐÃ CÓ trong PostgreSQL → tạo outbox entries → outbox worker
 * tự động đẩy lên Blockchain → blockListener → MinIO → pipeline → Lakehouse
 *
 * KHÔNG tạo order mới. KHÔNG gọi API. Chỉ INSERT vào blockchain_outbox.
 *
 * Cách chạy:
 *   cd d:\TAI_LIEU\KLTN\QnT\backend-api
 *   node sync_db_to_blockchain.js
 *
 * Yêu cầu: Backend + Blockchain Adapter + blockListener đang chạy.
 * Sau khi outbox worker xử lý xong → chạy pipeline trên VM.
 *
 * Options:
 *   node sync_db_to_blockchain.js             Chế độ bình thường (tin outbox table)
 *   node sync_db_to_blockchain.js --verify    Kiểm tra thực tế trên blockchain, fix ghost entries
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const pool = new Pool({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '6543'),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
});

pool.on('error', (err, client) => {
    console.error('⚠️ Lỗi bất ngờ ở idle client của pg Pool:', err.message);
});

const ADAPTER_URL = process.env.BLOCKCHAIN_ADAPTER_URL || 'http://localhost:3000/api';
const VERIFY_MODE = process.argv.includes('--verify');

// Lấy VM_IP từ blockchain-adapter/src/config/constants.js
let MY_VM_IP = '127.0.0.1';
try {
    const adapterConstantsPath = path.resolve(__dirname, '../blockchain-adapter/src/config/constants.js');
    const adapterContent = require('fs').readFileSync(adapterConstantsPath, 'utf8');
    const match = adapterContent.match(/const\s+VM_IP\s*=\s*['"]([^'"]+)['"]/);
    if (match) MY_VM_IP = match[1];
} catch (e) {
    console.error('Cannot read VM_IP', e);
}

// VAT rate mặc định (chaincode default)
const DEFAULT_VAT_RATE = 10;

// ═══════════════════════════════════════════
// Lifecycle mỗi status cần những action nào
// ═══════════════════════════════════════════
// Blockchain ghi nhận MỌI sự kiện, nên để data trên Lakehouse đầy đủ,
// ta phải replay toàn bộ lifecycle cho mỗi đơn.
const STATUS_ACTIONS = {
    'CREATED':   ['CREATE_ORDER'],
    'PAID':      ['CREATE_ORDER', 'CONFIRM_PAYMENT'],
    'SHIPPED':   ['CREATE_ORDER', 'CONFIRM_PAYMENT', 'SHIP_ORDER'],  // COD không cần CONFIRM_PAYMENT
    'DELIVERED': ['CREATE_ORDER', 'CONFIRM_PAYMENT', 'SHIP_ORDER', 'DELIVER'],
    'SETTLED':   ['CREATE_ORDER', 'CONFIRM_PAYMENT', 'SHIP_ORDER', 'DELIVER', 'PAYOUT'],
    'CANCELLED': ['CREATE_ORDER', 'CANCEL_ORDER'],
    'RETURN_REQUESTED': ['CREATE_ORDER', 'CONFIRM_PAYMENT', 'SHIP_ORDER', 'DELIVER', 'REQUEST_RETURN'],
    'RETURN_IN_TRANSIT': ['CREATE_ORDER', 'CONFIRM_PAYMENT', 'SHIP_ORDER', 'DELIVER', 'REQUEST_RETURN', 'SHIP_RETURN'],
    'RETURNED': ['CREATE_ORDER', 'CONFIRM_PAYMENT', 'SHIP_ORDER', 'DELIVER', 'REQUEST_RETURN', 'SHIP_RETURN', 'CONFIRM_RETURN_RECEIVED'],
};

// Query blockchain thực tế
async function queryBlockchainOrder(orderId) {
    try {
        const url = `${ADAPTER_URL}/query-order?orderID=${encodeURIComponent(orderId)}&requestorOrg=platform&requestorUser=admin-ca-platform`;
        const res = await fetch(url, { timeout: 10000 });
        const data = await res.json();
        if (data.success && data.data) {
            return data.data.publicData || data.data;
        }
        return null;
    } catch {
        return null;
    }
}

async function main() {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log(`║ 📤 SYNC DB → Blockchain ${VERIFY_MODE ? '(VERIFY mode)' : ''}`.padEnd(53) + '║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    const client = await pool.connect();

    try {
        // 1. Lấy TẤT CẢ orders
        const orderFilter = process.env.ORDER_IDS 
            ? `WHERE o.id = ANY($1::text[])`
            : '';
            
        const queryParams = process.env.ORDER_IDS ? [process.env.ORDER_IDS.split(',').map(id => id.trim())] : [];

        const ordersRes = await client.query(`
            SELECT o.*, 
                   s.name AS store_name, s.taxid AS store_tax_code,
                   u.email AS seller_email,
                   o.carrier_id,
                   o.created_at AS order_created_at
            FROM orders o
            LEFT JOIN store s ON o.storeid::text = s.id::text
            LEFT JOIN users u ON u.id = s.ownerid
            ${orderFilter}
            ORDER BY o.created_at ASC
        `, queryParams);

        // 2. Xây dựng syncedMap
        const syncedMap = {};

        if (VERIFY_MODE) {
            // ── VERIFY: Kiểm tra THỰC TẾ trên blockchain ──
            console.log('🔍 VERIFY: Kiểm tra từng đơn trên blockchain thực tế...\n');
            
            for (const o of ordersRes.rows) {
                const chain = await queryBlockchainOrder(o.id);
                if (chain && chain.status) {
                    // Order tồn tại trên blockchain → xây syncedMap từ chain status
                    const chainStatus = chain.status.toUpperCase();
                    const pm = (o.paymentmethod || '').toUpperCase();
                    
                    // Map chain status → actions đã hoàn thành
                    const completedActions = new Set();
                    if (chain.orderID) completedActions.add('CREATE_ORDER');
                    if (chain.paidAt) completedActions.add('CONFIRM_PAYMENT');
                    if (chain.shippedAt) completedActions.add('SHIP_ORDER');
                    if (chain.deliveryTimestamp) {
                        completedActions.add(pm === 'COD' ? 'CONFIRM_COD_DELIVERY' : 'CONFIRM_DELIVERY');
                    }
                    if (chain.settledAt) {
                        completedActions.add('PAYOUT');
                        if (pm === 'COD') completedActions.add('REMIT_COD');
                    }
                    if (chain.cancelledAt) completedActions.add('CANCEL_ORDER');
                    if (chain.returnRequestedAt) completedActions.add('REQUEST_RETURN');
                    
                    syncedMap[o.id] = completedActions;
                    console.log(`  ✅ ${o.id} → chain: ${chainStatus} (${completedActions.size} actions)`);
                } else {
                    // KHÔNG có trên blockchain → xóa outbox SYNCED cũ (ghost)
                    const delRes = await client.query(
                        `DELETE FROM blockchain_outbox WHERE order_id = $1 AND status = 'SYNCED' RETURNING action`,
                        [o.id]
                    );
                    if (delRes.rowCount > 0) {
                        console.log(`  🗑️ ${o.id} → ghost! Xóa ${delRes.rowCount} outbox SYNCED cũ`);
                    } else {
                        console.log(`  ⚠️ ${o.id} → chưa có trên blockchain`);
                    }
                    syncedMap[o.id] = new Set(); // Rỗng → sẽ tạo mới
                }
            }
            console.log();
        } else {
            // 👉 Bình thường: Tin outbox table (chỉ tin những dòng do máy này xử lý)
            const syncedRes = await client.query(`
                SELECT order_id, action 
                FROM blockchain_outbox 
                WHERE status = 'SYNCED'
                  AND (ip = $1 OR ip IS NULL)
            `, [MY_VM_IP]);
            for (const row of syncedRes.rows) {
                if (!syncedMap[row.order_id]) syncedMap[row.order_id] = new Set();
                syncedMap[row.order_id].add(row.action);
            }
        }

        // 3. Xóa các PENDING/FAILED entries cũ (chỉ xóa của VM này hoặc legacy)
        const cleanRes = await client.query(`
            DELETE FROM blockchain_outbox 
            WHERE status IN ('PENDING', 'FAILED', 'SKIPPED')
              AND (ip = $1 OR ip IS NULL)
            RETURNING order_id, action
        `, [MY_VM_IP]);
        if (cleanRes.rowCount > 0) {
            console.log(`  🧹 Đã dọn ${cleanRes.rowCount} entries cũ (PENDING/FAILED/SKIPPED)\n`);
        }

        const orders = ordersRes.rows;
        if (orders.length === 0) {
            console.log('✅ Không có orders nào trong DB.');
            return;
        }

        console.log(`📋 Kiểm tra ${orders.length} đơn hàng...\n`);

        let totalActions = 0;
        let skippedOrders = 0;

        for (let idx = 0; idx < orders.length; idx++) {
            const o = orders[idx];
            const status = (o.status || '').toUpperCase();
            const pm = (o.paymentmethod || '').toUpperCase();
            const orderId = o.id;
            const createdAt = new Date(o.order_created_at || o.created_at);
            const synced = syncedMap[orderId] || new Set();

            // Xác định actions cần có dựa theo status
            let requiredActions = STATUS_ACTIONS[status] || ['CREATE_ORDER'];
            if (pm === 'COD') {
                requiredActions = requiredActions.filter(a => a !== 'CONFIRM_PAYMENT');
            }

            // Resolve action names (DELIVER → CONFIRM_DELIVERY / CONFIRM_COD_DELIVERY)
            const resolvedRequired = requiredActions.map(a => {
                if (a === 'DELIVER') return pm === 'COD' ? 'CONFIRM_COD_DELIVERY' : 'CONFIRM_DELIVERY';
                return a;
            });

            // Tính actions CÒN THIẾU
            const missingActions = requiredActions.filter((a, i) => !synced.has(resolvedRequired[i]));

            if (missingActions.length === 0) {
                skippedOrders++;
                continue; // Đã đủ trên blockchain
            }

            console.log(`  [${idx + 1}/${orders.length}] ${orderId}  ${status.padEnd(18)} ${pm.padEnd(8)} ${createdAt.toISOString().slice(0, 10)}  → +${missingActions.length} actions`);

            // Lấy order items
            const itemsRes = await client.query(`SELECT * FROM orderitem WHERE orderid = $1`, [orderId]);
            const items = itemsRes.rows;

            // Lấy shipper info
            let shipperUsername = 'Check';
            let shipperDisplayName = 'Check';
            if (o.shipper_id || o.carrier_id) {
                const shipperRes = await client.query(
                    `SELECT u.email, sp.display_name 
                     FROM users u 
                     LEFT JOIN shipper_profiles sp ON u.id::text = sp.user_id::text
                     WHERE u.id::text = $1::text`, 
                    [o.shipper_id || o.carrier_id]
                );
                if (shipperRes.rows.length > 0) {
                    shipperUsername = shipperRes.rows[0].email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
                    shipperDisplayName = shipperRes.rows[0].display_name || shipperUsername;
                }
            }
            const sellerChainUser = (o.seller_email || 'seller').split('@')[0].replace(/[^a-zA-Z0-9]/g, '');

            // ═══ CHỈNH CÁC MỐC THỜI GIAN Ở ĐÂY ═══
            // Đơn vị: giờ (h). [min, max] → random trong khoảng
            // Ví dụ: confirm [1, 4] nghĩa là 1-4 giờ sau khi tạo đơn
            const OFFSETS = {
                confirm: [1, 4],        // Xác nhận thanh toán: 1-4h sau tạo đơn
                ship:    [4, 12],       // Shipper lấy hàng: 4-12h sau confirm
                deliver: [12, 72],      // Giao hàng: 12-72h (0.5-3 ngày) sau ship
                remit:   [2, 24],       // Nộp tiền COD: 2-24h sau deliver
                payout:  [24, 120],     // Thanh toán seller: 24-120h (1-5 ngày) sau deliver
                cancel:  [0.5, 6],      // Hủy đơn: 0.5-6h sau tạo
            };

            function randH(range) {
                return range[0] + Math.random() * (range[1] - range[0]);
            }

            const confirmH = randH(OFFSETS.confirm);
            const shipH    = confirmH + randH(OFFSETS.ship);
            const deliverH = shipH + randH(OFFSETS.deliver);
            const remitH   = deliverH + randH(OFFSETS.remit);
            const payoutH  = deliverH + randH(OFFSETS.payout);
            const cancelH  = randH(OFFSETS.cancel);

            const t = {
                create:  createdAt,
                confirm: new Date(createdAt.getTime() + confirmH * 3600000),
                ship:    new Date(createdAt.getTime() + shipH * 3600000),
                deliver: new Date(createdAt.getTime() + deliverH * 3600000),
                remit:   new Date(createdAt.getTime() + remitH * 3600000),
                payout:  new Date(createdAt.getTime() + payoutH * 3600000),
                cancel:  new Date(createdAt.getTime() + cancelH * 3600000),
            };

            // Dùng missingActions đã tính ở trên (chỉ tạo actions còn thiếu)
            const actions = missingActions;

            // Tính actualSubTotal từ items
            let actualSubTotal = 0;
            const blockchainItems = items.map(item => {
                const unitPrice = item.promotionalprice !== null && item.promotionalprice !== undefined
                    ? Number(item.promotionalprice) : Number(item.price);
                actualSubTotal += unitPrice * Number(item.count);
                return {
                    productID: String(item.productid),
                    variantID: item.variantid ? String(item.variantid) : "",
                    productName: item.productname,
                    unitPrice: unitPrice,
                    quantity: Number(item.count)
                };
            });

            const shopDiscount = Number(o.shop_discount || 0);
            const platformDiscount = Number(o.platform_discount || 0);
            const sellerNetIncome = actualSubTotal - shopDiscount;
            const validTaxableRevenue = sellerNetIncome > 0 ? sellerNetIncome : 0;
            const vatAmount = Math.round(validTaxableRevenue * DEFAULT_VAT_RATE / 100);
            const shippingAddress = `${o.shippingaddressline1 || ''} ${o.shippingaddressline2 || ''} ${o.shippingdistrict || ''} ${o.shippingcity || ''}`.trim();

            // INSERT outbox entries cho mỗi action
            for (const action of actions) {
                let dbAction, payload;

                switch (action) {
                    case 'CREATE_ORDER':
                        dbAction = 'CREATE_ORDER';
                        payload = {
                            orderID: orderId,
                            sellerData: {
                                storeId: String(o.storeid || ''),
                                storeName: sellerChainUser,
                                customerID: String(o.user_id),
                                items: blockchainItems,
                                taxCode: o.store_tax_code || '',
                                FinalPrice: Number(o.finalprice || 0),
                                TotalAmount: actualSubTotal,
                                TaxAmount: vatAmount,
                                sellerNetIncome: validTaxableRevenue,
                                platformDiscountAmount: platformDiscount,
                                shopDiscountAmount: shopDiscount
                            },
                            shipperData: {
                                carrierId: String(o.carrier_id || ''),
                                carrierName: shipperDisplayName,
                                method: 'standard',
                                shippingAddress: shippingAddress,
                                phone: o.shippingphone || '',
                                shippingFee: Number(o.deliveryprice || 0)
                            },
                            metadata: {
                                paymentMethod: pm,
                                finalPrice: Number(o.finalprice || 0)
                            },
                            simulatedTime: t.create.toISOString(),
                            requestorOrg: 'platform',
                            requestorUser: 'admin-ca-platform'
                        };
                        break;

                    case 'CONFIRM_PAYMENT':
                        dbAction = 'CONFIRM_PAYMENT';
                        payload = {
                            orderID: orderId,
                            simulatedTime: t.confirm.toISOString(),
                            requestorOrg: 'platform',
                            requestorUser: 'admin-ca-platform'
                        };
                        break;

                    case 'CANCEL_ORDER':
                        dbAction = 'CANCEL_ORDER';
                        payload = {
                            orderID: orderId,
                            simulatedTime: t.cancel.toISOString(),
                            requestorOrg: 'platform',
                            requestorUser: 'admin-ca-platform'
                        };
                        break;

                    case 'SHIP_ORDER':
                        dbAction = 'SHIP_ORDER';
                        payload = {
                            orderID: orderId,
                            simulatedTime: t.ship.toISOString(),
                            requestorOrg: 'shipper',
                            requestorUser: shipperUsername
                        };
                        break;

                    case 'DELIVER':
                        dbAction = pm === 'COD' ? 'CONFIRM_COD_DELIVERY' : 'CONFIRM_DELIVERY';
                        payload = {
                            orderID: orderId,
                            simulatedTime: t.deliver.toISOString(),
                            requestorOrg: 'shipper',
                            requestorUser: shipperUsername
                        };
                        break;

                    case 'REQUEST_RETURN':
                        dbAction = 'REQUEST_RETURN';
                        payload = {
                            orderID: orderId,
                            simulatedTime: t.deliver.toISOString(),
                            requestorOrg: 'platform',
                            requestorUser: 'admin-ca-platform'
                        };
                        break;

                    case 'SHIP_RETURN':
                        dbAction = 'SHIP_RETURN';
                        payload = {
                            orderID: orderId,
                            simulatedTime: t.deliver.toISOString(),
                            requestorOrg: 'shipper',
                            requestorUser: shipperUsername
                        };
                        break;
                        
                    case 'CONFIRM_RETURN_RECEIVED':
                        dbAction = 'CONFIRM_RETURN_RECEIVED';
                        payload = {
                            orderID: orderId,
                            simulatedTime: t.deliver.toISOString(),
                            requestorOrg: 'seller',
                            requestorUser: sellerChainUser
                        };
                        break;

                    case 'PAYOUT':
                        dbAction = 'PAYOUT';
                        // COD cần REMIT_COD trước PAYOUT
                        if (pm === 'COD') {
                            await client.query(
                                `INSERT INTO blockchain_outbox (order_id, action, payload, status, ip) VALUES ($1, $2, $3, 'PENDING', $4)`,
                                [orderId, 'REMIT_COD', JSON.stringify({
                                    orderID: orderId,
                                    simulatedTime: t.remit.toISOString(),
                                    requestorOrg: 'platform',
                                    requestorUser: 'admin-ca-platform'
                                }), MY_VM_IP]
                            );
                            totalActions++;
                        }

                        payload = {
                            orderID: orderId,
                            taxData: {
                                orderID: orderId,
                                sellerID: "SellerOrgMSP",
                                sellerCompanyID: String(o.storeid || ''),
                                sellerTaxCode: o.store_tax_code || '',
                                taxableRevenue: validTaxableRevenue,
                                vatAmount: vatAmount,
                                transactionDate: t.payout.toISOString(),
                                note: `Trích lập ${DEFAULT_VAT_RATE}% VAT tự động`
                            },
                            sellerSettlementData: {
                                orderID: orderId,
                                customerID: String(o.user_id),
                                items: blockchainItems,
                                sellerTaxCode: o.store_tax_code || '',
                                FinalPrice: Number(o.finalprice || 0),
                                TotalAmount: actualSubTotal,
                                vatAmount: vatAmount,
                                sellerNetIncome: validTaxableRevenue,
                                platformDiscountAmount: platformDiscount,
                                shopDiscountAmount: shopDiscount
                            },
                            simulatedTime: t.payout.toISOString(),
                            requestorOrg: 'platform',
                            requestorUser: 'admin-ca-platform'
                        };
                        break;

                    default:
                        continue;
                }

                await client.query(
                    `INSERT INTO blockchain_outbox (order_id, action, payload, status, ip) VALUES ($1, $2, $3, 'PENDING', $4)`,
                    [orderId, dbAction, JSON.stringify(payload), MY_VM_IP]
                );
                totalActions++;
            }

            // Update blockchain_sync_status
            await client.query(
                `UPDATE orders SET blockchain_sync_status = 'PENDING' WHERE id = $1`,
                [orderId]
            );
        }

        const syncedOrders = orders.length - skippedOrders;
        console.log(`\n╔════════════════════════════════════════════════════╗`);
        console.log(`║ ✅ Tạo ${String(totalActions).padStart(4)} outbox entries cho ${String(syncedOrders).padStart(3)} đơn          ║`);
        console.log(`║ ⏭️  Bỏ qua ${String(skippedOrders).padStart(3)} đơn (đã đủ trên blockchain)        ║`);
        console.log(`╚════════════════════════════════════════════════════╝`);

        if (totalActions > 0) {
            console.log('\n📋 TIẾP THEO:');
            console.log('  1. Outbox worker (backend) tự xử lý → Blockchain → blockListener → MinIO');
            console.log('  2. Kiểm tra: node check_outbox.js');
            console.log('  3. Sau khi SYNCED hết → SSH VM: cd ~/lakehouse && ./scripts/run_pipeline.sh');
            console.log(`\n⏱️  Ước tính: ~${Math.ceil(totalActions * 10 / 60)} phút`);
        } else {
            console.log('\n✅ Tất cả đã đồng bộ. Không cần làm gì thêm.');
        }

    } catch (e) {
        console.error('\n❌ Error:', e.message);
        console.error(e.stack);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
