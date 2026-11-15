// blockchain-adapter/src/listeners/blockListener.js
// Block Listener — Lắng nghe block events từ Hyperledger Fabric
// Lưu raw blocks + parse structured events + enrich private data + metadata

const { connectToNetwork } = require('../config/fabric');
const Minio = require('minio');
const { MINIO_CONFIG } = require('../config/constants');
const { extractTransactions, buildBlockMetadata } = require('./blockParser');

const minioClient = new Minio.Client({
    endPoint: MINIO_CONFIG.ENDPOINT,
    port: MINIO_CONFIG.PORT,
    useSSL: false,
    accessKey: MINIO_CONFIG.ACCESS_KEY,
    secretKey: MINIO_CONFIG.SECRET_KEY
});

const BUCKET_NAME = MINIO_CONFIG.BUCKET_NAME;

// Fabric contract reference (reused across blocks)
let fabricContract = null;
let fabricGateway = null;

async function initMinio() {
    try {
        const exists = await minioClient.bucketExists(BUCKET_NAME);
        if (!exists) {
            await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
            console.log(`[MinIO] Created bucket: ${BUCKET_NAME}`);
        } else {
            console.log(`[MinIO] Bucket '${BUCKET_NAME}' found.`);
        }
    } catch (err) {
        console.error('[MinIO] Init Error:', err.message);
    }
}

/**
 * Upload object to MinIO
 */
async function uploadToMinio(objectName, data) {
    return new Promise((resolve, reject) => {
        const buffer = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
        minioClient.putObject(BUCKET_NAME, objectName, buffer, (err, etag) => {
            if (err) {
                console.error(`   MinIO Upload Error [${objectName}]:`, err.message);
                reject(err);
            } else {
                resolve(etag);
            }
        });
    });
}

/**
 * Query order data từ chaincode cho 1 order
 * QueryOrder trả về: { publicData, privateData: { sellerData, shipperData, taxData }, dataVerified }
 * 
 * V2: Extract CẢ publicData (order info) + privateData (financial info)
 * @returns {Object|null} { order_data, private_data }
 */
async function queryOrderData(orderID) {
    if (!fabricContract) return null;

    try {
        const resultBuffer = await fabricContract.evaluateTransaction('QueryOrder', orderID);
        const result = JSON.parse(resultBuffer.toString());

        if (!result) return null;

        const response = {};

        // ── PUBLIC DATA (order info: status, timestamps, company IDs) ──
        if (result.publicData) {
            const pub = result.publicData;
            response.order_data = {
                order_id: pub.orderID || orderID,
                status: pub.status || '',
                payment_method: pub.paymentMethod || '',
                cod_status: pub.codStatus || '',
                seller_company_id: pub.sellerCompanyID || '',
                shipper_company_id: pub.shipperCompanyID || '',
                vat_rate: pub.vatRate || 0,
                created_at: pub.createdAt || '',
                updated_at: pub.updatedAt || '',
                delivery_timestamp: pub.deliveryTimestamp || '',
                paid_at: pub.paidAt || '',
                shipped_at: pub.shippedAt || '',
                settled_at: pub.settledAt || '',
                cancelled_at: pub.cancelledAt || '',
                return_requested_at: pub.returnRequestedAt || '',
                return_completed_at: pub.returnCompletedAt || '',
                history_count: pub.history ? pub.history.length : 0,
                last_action: pub.history && pub.history.length > 0
                    ? pub.history[pub.history.length - 1].action : '',
            };
        }

        // ── PRIVATE DATA (financial: seller, shipper, tax collections) ──
        if (result.privateData) {
            const pd = result.privateData;
            const hasAny = pd.sellerData || pd.shipperData || pd.taxData;
            if (hasAny) {
                response.private_data = {
                    seller_data: pd.sellerData || null,
                    shipper_data: pd.shipperData || null,
                    tax_data: pd.taxData || null,
                    data_verified: result.dataVerified || false
                };
            }
        }

        return Object.keys(response).length > 0 ? response : null;
    } catch (err) {
        // Không phải lỗi nghiêm trọng — order có thể chưa accessible
        console.warn(`  ⚠️ Order data query failed for ${orderID}: ${err.message}`);
        return null;
    }
}

/**
 * Functions mà sau khi thực hiện cần query private data
 */
const FUNCTIONS_WITH_PRIVATE_DATA = [
    'CreateOrder',
    'ConfirmPayment',
    'CancelOrder',
    'ShipOrder',
    'ConfirmDelivery',
    'ConfirmCODDelivery',
    'RemitCOD',
    'PayoutToSeller',
    'RequestReturn',
    'ShipReturn',
    'ConfirmReturnReceived'
];

/**
 * Process 1 block: raw backup + structured parse + private data enrichment + metadata
 */
async function processBlock(event) {
    const blockNumber = event.blockNumber.toString();
    const blockData = event.blockData;

    console.log(`\n Block #${blockNumber} received!`);

    try {
        // ═══════════════════════════════════════════════════════
        // 1. RAW BACKUP — Lưu nguyên block gốc
        // ═══════════════════════════════════════════════════════
        const rawObjectName = `raw/blocks/block_${blockNumber}.json`;
        await uploadToMinio(rawObjectName, blockData);
        console.log(`   Raw: ${rawObjectName}`);

        // ═══════════════════════════════════════════════════════
        // 2. STRUCTURED EVENTS — Parse transactions
        // ═══════════════════════════════════════════════════════
        const transactions = extractTransactions(blockData, blockNumber);

        if (transactions.length > 0) {
            // ═══════════════════════════════════════════════════
            // 3. DATA ENRICHMENT — Query chaincode for public + private data
            // ═══════════════════════════════════════════════════
            for (const tx of transactions) {
                if (!tx.is_valid) continue;

                // Xác định order ID từ args hoặc order_data
                const orderID = tx.order_data?.order_id
                    || (tx.args?.length > 0 && tx.args[0].startsWith('ORD-') ? tx.args[0] : null);

                if (orderID && FUNCTIONS_WITH_PRIVATE_DATA.includes(tx.function_name)) {
                    console.log(`   Querying order data cho ${orderID}...`);
                    const enriched = await queryOrderData(orderID);
                    if (enriched) {
                        // Ghi đè order_data từ QueryOrder (đầy đủ hơn extractOrderDataFromWrites)
                        if (enriched.order_data) {
                            tx.order_data = enriched.order_data;
                        }
                        if (enriched.private_data) {
                            tx.private_data = enriched.private_data;
                        }
                        console.log(`      ✅ Public: ${!!enriched.order_data} | Private: seller=${!!enriched.private_data?.seller_data}, shipper=${!!enriched.private_data?.shipper_data}, tax=${!!enriched.private_data?.tax_data}`);
                    }
                }
            }

            // Xác định partition path
            const txDate = new Date(transactions[0].timestamp);
            const year = txDate.getFullYear();
            const month = String(txDate.getMonth() + 1).padStart(2, '0');
            const day = String(txDate.getDate()).padStart(2, '0');
            const partitionPath = `structured/${year}/${month}/${day}`;

            // Lưu dạng JSON Lines
            const jsonLines = transactions.map(tx => JSON.stringify(tx)).join('\n') + '\n';
            const structuredObjectName = `${partitionPath}/events_block_${blockNumber}.jsonl`;
            await uploadToMinio(structuredObjectName, jsonLines);
            console.log(`   Structured: ${structuredObjectName} (${transactions.length} tx)`);

            // Log chi tiết
            for (const tx of transactions) {
                if (tx.chaincode_id !== 'unknown') {
                    const hasPrivate = tx.private_data ? ' 🔐' : '';
                    console.log(`     → ${tx.function_name}(${tx.args.join(', ')}) by ${tx.creator_msp} [${tx.is_valid ? '✅' : '❌'}]${hasPrivate}`);
                }
            }

            // ═══════════════════════════════════════════════════
            // 4. PRIVATE DATA LAYER — Lưu riêng cho analytics
            //    Tách ra để dễ query mà không cần parse JSONL
            // ═══════════════════════════════════════════════════
            for (const tx of transactions) {
                if (!tx.private_data) continue;

                // Lấy order ID từ order_data HOẶC args (fallback)
                const orderId = tx.order_data?.order_id
                    || (tx.args?.length > 0 && tx.args[0].startsWith('ORD-') ? tx.args[0] : null);
                if (!orderId) continue;

                const privateObjectName = `private/${orderId}/block_${blockNumber}_${tx.function_name}.json`;

                await uploadToMinio(privateObjectName, {
                    order_id: orderId,
                    block_number: parseInt(blockNumber),
                    tx_id: tx.tx_id,
                    function_name: tx.function_name,
                    timestamp: tx.timestamp,
                    ...tx.private_data
                });
                console.log(`   Private Snapshot: ${privateObjectName}`);
            }

        } else {
            console.log(`  ℹ  No endorser transactions (config/system block)`);
        }

        // ═══════════════════════════════════════════════════════
        // 5. BLOCK METADATA
        // ═══════════════════════════════════════════════════════
        const metadata = buildBlockMetadata(blockData, blockNumber, transactions);
        const metaObjectName = `metadata/block_${blockNumber}.json`;
        await uploadToMinio(metaObjectName, metadata);
        console.log(`   Metadata: ${metaObjectName}`);

    } catch (err) {
        console.error(`   Block #${blockNumber} processing error:`, err.message);

        try {
            const fallbackName = `raw/blocks/block_${blockNumber}.json`;
            await uploadToMinio(fallbackName, blockData);
            console.log(`   Fallback raw saved: ${fallbackName}`);
        } catch (fallbackErr) {
            console.error(`   Fallback save also failed:`, fallbackErr.message);
        }
    }
}

async function startBlockListener() {
    await initMinio();

    try {
        const { network, contract, gateway } = await connectToNetwork('platform', 'admin');

        // Lưu contract reference để dùng cho private data queries
        fabricContract = contract;
        fabricGateway = gateway;

        console.log('\n Đang lắng nghe Block Events...');
        console.log(' Lakehouse structure:');
        console.log('   raw/blocks/              — Raw block backup');
        console.log('   structured/YYYY/MM/DD/   — Parsed transaction events (JSONL)');
        console.log('   private/{orderID}/        — Private data (seller, shipper, tax)');
        console.log('   metadata/                — Block summaries\n');

        const startBlock = 1;
const options = { startBlock };

console.log(` ⏪ Replaying blocks starting from Block #${startBlock}...`);

        await network.addBlockListener(async (event) => {
            await processBlock(event);
        }, options);
    } catch (error) {
        console.error(" Listener Error:", error);
    }
}

startBlockListener();