/**
 * reconcile.js — So khớp data giữa 3 hệ thống: DB ↔ Blockchain ↔ Lakehouse
 *
 * Kiểm tra:
 *  1. DB vs Blockchain: mỗi order trong DB có tồn tại trên blockchain không? Status khớp không?
 *  2. DB vs Lakehouse:  mỗi order trong DB có trên Trino gold layer không?
 *  3. Blockchain vs Lakehouse: mỗi order trên blockchain có trên Lakehouse không?
 *
 * Cách chạy:
 *   cd d:\TAI_LIEU\KLTN\QnT\backend-api
 *   node reconcile.js
 *   
 *   # Hoặc từ bất kỳ thư mục nào:
 *   node backend-api\reconcile.js
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

const ADAPTER_URL = process.env.BLOCKCHAIN_ADAPTER_URL || 'http://localhost:3000/api';
const TRINO_URL = `http://${process.env.TRINO_HOST || '192.168.40.11'}:${process.env.TRINO_PORT || '8090'}/v1/statement`;

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

// Normalize status cho so sánh
function normalizeStatus(s) {
    if (!s) return '';
    return s.toUpperCase().replace(/[^A-Z_]/g, '');
}

// Query Trino (pagination-aware)
async function queryTrino(sql) {
    try {
        const response = await fetch(TRINO_URL, {
            method: 'POST',
            headers: {
                'X-Trino-User': 'reconcile-script',
                'X-Trino-Catalog': 'delta',
                'X-Trino-Schema': 'gold',
                'Content-Type': 'text/plain',
            },
            body: sql,
        });

        if (!response.ok) {
            throw new Error(`Trino HTTP ${response.status}`);
        }

        let result = await response.json();
        const allData = [];
        let columns = [];

        if (result.columns) columns = result.columns;
        while (result.nextUri) {
            if (result.data) allData.push(...result.data);
            const nextResp = await fetch(result.nextUri, {
                headers: { 'X-Trino-User': 'reconcile-script' },
            });
            result = await nextResp.json();
            if (result.columns && result.columns.length > 0) columns = result.columns;
        }
        if (result.data) allData.push(...result.data);

        if (result.error) throw new Error(result.error.message);

        const colNames = columns.map(c => c.name);
        return allData.map(row => {
            const obj = {};
            colNames.forEach((n, i) => { obj[n] = row[i]; });
            return obj;
        });
    } catch (e) {
        console.log('  ⚠️ Lỗi kết nối Trino chi tiết:', e.message);
        return null; // Trino không available
    }
}

// Query blockchain adapter — trả { data, error }
async function queryBlockchainOrder(orderId) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const url = `${ADAPTER_URL}/query-order?orderID=${encodeURIComponent(orderId)}&requestorOrg=platform&requestorUser=admin-ca-platform`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();
        // Adapter trả { success, data: { publicData: {...}, privateData: {...} } }
        if (data.success && data.data) {
            return { data: data.data.publicData || data.data };
        }
        return { data: null, error: data.error || 'not found' };
    } catch (e) {
        return { data: null, error: e.name === 'AbortError' ? 'Timeout 15s' : e.message };
    }
}

// Batch query tất cả orders từ blockchain (1 request duy nhất)
async function queryAllBlockchainOrders() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 phút cho batch

        const res = await fetch(`${ADAPTER_URL}/query-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                queryString: '{"selector":{}}',
                requestorOrg: 'platform',
                requestorUser: 'admin-ca-platform'
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data = await res.json();
        if (data.success && data.data) {
            return { data: data.data };
        }
        return { data: null, error: data.error || 'Empty response' };
    } catch (e) {
        return { data: null, error: e.name === 'AbortError' ? 'Timeout 120s' : e.message };
    }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║ 🔍 RECONCILE — So khớp DB ↔ Blockchain ↔ Lakehouse    ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    const client = await pool.connect();

    try {
        // ─── 1. LẤY DATA TỪ DB ───
        console.log('[1/4] Đọc PostgreSQL...');
        const orderFilter = process.env.ORDER_IDS 
            ? `WHERE id = ANY($1::text[])`
            : '';
        const queryParams = process.env.ORDER_IDS ? [process.env.ORDER_IDS.split(',').map(id => id.trim())] : [];

        const dbRes = await client.query(`
            SELECT id, status, paymentmethod, finalprice, created_at, updated_at,
                   blockchain_sync_status, storeid, carrier_id
            FROM orders 
            ${orderFilter}
            ORDER BY created_at ASC
        `, queryParams);
        const dbOrders = dbRes.rows;
        console.log(`  📊 ${dbOrders.length} orders trong DB\n`);

        // ─── 2. LẤY DATA TỪ BLOCKCHAIN (BATCH) ───
        console.log('[2/4] Query Blockchain (qua Adapter — batch mode)...');
        const chainMap = {};
        let chainOk = 0, chainFail = 0, chainMissing = 0;
        let firstError = null;
        let adapterDown = false;

        const batchResult = await queryAllBlockchainOrders();

        if (batchResult.error) {
            firstError = batchResult.error;
            if (firstError.includes('ECONNREFUSED') || firstError.includes('ETIMEDOUT') || firstError.includes('fetch failed') || firstError.includes('Timeout') || firstError.includes('reason:')) {
                adapterDown = true;
                console.log(`  ❌ Adapter không phản hồi: ${firstError}`);
                console.log('  💡 Kiểm tra: pm2 status | pm2 logs 1-ADAPTER --lines 10');
                console.log('  💡 Hoặc blockchain network (VM) chưa bật\n');
            } else {
                console.log(`  ⚠️ Lỗi batch query: ${firstError}`);
            }
            chainMissing = dbOrders.length;
        } else if (batchResult.data) {
            // Parse response — hỗ trợ cả [{Key, Record}] và [order] format
            const items = Array.isArray(batchResult.data) ? batchResult.data : [];
            for (const item of items) {
                const record = item.Record || item.record || item;
                const id = record.orderID || record.id || item.Key || item.key;
                if (id) {
                    // Lấy publicData nếu có, hoặc dùng record trực tiếp
                    chainMap[id] = record.publicData || record;
                    chainOk++;
                }
            }
            chainMissing = Math.max(0, dbOrders.length - chainOk);
            console.log(`  📦 Batch query trả về ${items.length} records`);
        } else {
            chainMissing = dbOrders.length;
            console.log('  ⚠️ Batch query trả về rỗng');
        }

        console.log(`  ✅ Found: ${chainOk}  ❌ Missing: ${chainMissing}`);
        if (firstError && !adapterDown) console.log(`  ⚠️ Lỗi mẫu: ${firstError}`);
        console.log();

        // ─── 3. LẤY DATA TỪ LAKEHOUSE ───
        console.log('[3/4] Query Lakehouse (Trino)...');
        let lakeOrders = null;
        let lakeMap = {};

        const lakeData = await queryTrino(`
            SELECT order_id, order_status AS status, payment_method, seller_final_price AS final_price, 
                   order_created_at AS created_at, settled_at, shipped_at, delivery_timestamp AS delivered_at
            FROM delta.gold.fact_orders
        `);

        if (lakeData) {
            lakeOrders = lakeData;
            for (const row of lakeOrders) {
                lakeMap[row.order_id] = row;
            }
            console.log(`  📊 ${lakeOrders.length} orders trên Lakehouse\n`);
        } else {
            console.log('  ⚠️ Không kết nối được Trino. Bỏ qua Lakehouse check.\n');
        }

        // ─── 4. SO KHỚP ───
        console.log('[4/4] So khớp...\n');

        const issues = [];
        const summary = { matched: 0, statusMismatch: 0, chainMissing: 0, lakeMissing: 0, lakeStatusMismatch: 0 };

        for (const db of dbOrders) {
            const chain = chainMap[db.id];
            const lake = lakeMap[db.id];

            const dbStatus = normalizeStatus(db.status);
            const row = {
                orderId: db.id,
                db: dbStatus,
                chain: chain ? normalizeStatus(chain.status) : '❌ MISSING',
                lake: lake ? normalizeStatus(lake.status) : (lakeOrders ? '❌ MISSING' : 'N/A'),
                issues: [],
            };

            // DB vs Blockchain
            if (!chain) {
                row.issues.push('Không có trên Blockchain');
                summary.chainMissing++;
            } else if (dbStatus !== normalizeStatus(chain.status)) {
                // Map blockchain status names to DB status names
                const chainStatus = normalizeStatus(chain.status);
                // Blockchain dùng "SHIPPING" thay vì "SHIPPED"
                const mappedChainStatus = chainStatus === 'SHIPPING' ? 'SHIPPED' : chainStatus;
                if (dbStatus !== mappedChainStatus) {
                    row.issues.push(`DB=${dbStatus} ≠ Chain=${chainStatus}`);
                    summary.statusMismatch++;
                } else {
                    summary.matched++;
                }
            } else {
                summary.matched++;
            }

            // DB vs Lakehouse
            if (lakeOrders) {
                if (!lake) {
                    row.issues.push('Không có trên Lakehouse');
                    summary.lakeMissing++;
                } else {
                    const lakeStatus = normalizeStatus(lake.status);
                    const mappedLakeStatus = lakeStatus === 'SHIPPING' ? 'SHIPPED' : lakeStatus;
                    if (dbStatus !== mappedLakeStatus) {
                        row.issues.push(`DB=${dbStatus} ≠ Lake=${lakeStatus}`);
                        summary.lakeStatusMismatch++;
                    }
                }
            }

            if (row.issues.length > 0) {
                issues.push(row);
            }
        }

        // ─── KẾT QUẢ ───
        console.log('┌──────────────────────────────┬──────────────┬──────────────┬──────────────┐');
        console.log('│ Order ID                     │ DB Status    │ Blockchain   │ Lakehouse    │');
        console.log('├──────────────────────────────┼──────────────┼──────────────┼──────────────┤');

        for (const db of dbOrders) {
            const chain = chainMap[db.id];
            const lake = lakeMap[db.id];
            const dbS = normalizeStatus(db.status).padEnd(12);
            const chS = (chain ? normalizeStatus(chain.status) : '❌ MISSING').padEnd(12);
            const lkS = (lake ? normalizeStatus(lake.status) : (lakeOrders ? '❌ MISSING' : 'N/A')).padEnd(12);

            // Emoji for match
            const chainMatch = chain && (normalizeStatus(db.status) === normalizeStatus(chain.status) || 
                               (normalizeStatus(chain.status) === 'SHIPPING' && normalizeStatus(db.status) === 'SHIPPED'));
            const lakeMatch = lake && (normalizeStatus(db.status) === normalizeStatus(lake.status) ||
                              (normalizeStatus(lake.status) === 'SHIPPING' && normalizeStatus(db.status) === 'SHIPPED'));

            const icon = (!chain || !chainMatch) ? '⚠️' : (lakeOrders && (!lake || !lakeMatch)) ? '📊' : '✅';

            console.log(`│ ${icon} ${db.id.padEnd(26)} │ ${dbS} │ ${chS} │ ${lkS} │`);
        }

        console.log('└──────────────────────────────┴──────────────┴──────────────┴──────────────┘');

        // Summary
        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log(`║  DB ↔ Blockchain                                        ║`);
        console.log(`║    ✅ Matched:          ${String(summary.matched).padStart(4)}                              ║`);
        console.log(`║    ⚠️ Status mismatch:  ${String(summary.statusMismatch).padStart(4)}                              ║`);
        console.log(`║    ❌ Chain missing:     ${String(summary.chainMissing).padStart(4)}                              ║`);
        if (lakeOrders) {
            console.log(`║                                                          ║`);
            console.log(`║  DB ↔ Lakehouse                                          ║`);
            console.log(`║    ✅ On Lakehouse:     ${String(Object.keys(lakeMap).length).padStart(4)}                              ║`);
            console.log(`║    ❌ Lake missing:     ${String(summary.lakeMissing).padStart(4)}                              ║`);
            console.log(`║    ⚠️ Lake status ≠:   ${String(summary.lakeStatusMismatch).padStart(4)}                              ║`);
        }
        console.log('╚══════════════════════════════════════════════════════════╝');

        // Timestamp details for blockchain orders
        if (chainOk > 0) {
            console.log('\n📅 Timestamps trên Blockchain:');
            console.log('┌──────────────────────────────┬──────────────────────┬──────────────────────┬──────────────────────┬──────────────────────┬──────────────────────┐');
            console.log('│ Order ID                     │ CreatedAt            │ PaidAt               │ ShippedAt            │ DeliveryTimestamp     │ SettledAt            │');
            console.log('├──────────────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤');

            for (const db of dbOrders) {
                const c = chainMap[db.id];
                if (!c) continue;
                const fmt = (s) => (s || '—').substring(0, 19).padEnd(20);
                console.log(`│ ${db.id.padEnd(28)} │ ${fmt(c.createdAt)} │ ${fmt(c.paidAt)} │ ${fmt(c.shippedAt)} │ ${fmt(c.deliveryTimestamp)} │ ${fmt(c.settledAt)} │`);
            }
            console.log('└──────────────────────────────┴──────────────────────┴──────────────────────┴──────────────────────┴──────────────────────┴──────────────────────┘');
        }

        // Issues
        if (issues.length > 0) {
            console.log('\n⚠️ CHI TIẾT VẤN ĐỀ:');
            for (const r of issues) {
                console.log(`  ${r.orderId}: ${r.issues.join(' | ')}`);
            }
        }

        if (summary.chainMissing > 0) {
            console.log(`\n💡 Để fix ${summary.chainMissing} đơn thiếu trên Blockchain:`);
            console.log('   node sync_db_to_blockchain.js');
        }
        if (lakeOrders && summary.lakeMissing > 0) {
            console.log(`\n💡 Để fix ${summary.lakeMissing} đơn thiếu trên Lakehouse:`);
            console.log('   SSH vào VM → cd ~/lakehouse && ./scripts/run_pipeline.sh');
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
