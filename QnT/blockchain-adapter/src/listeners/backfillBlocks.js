// blockchain-adapter/src/listeners/backfillBlocks.js
// Backfill Script — Reprocess existing raw blocks + enrich private data
// Chạy 1 lần để chuyển đổi raw blocks cũ thành structured data
// Usage: node src/listeners/backfillBlocks.js [--with-private]

const Minio = require('minio');
const { MINIO_CONFIG } = require('../config/constants');
const { connectToNetwork } = require('../config/fabric');
const { extractTransactions, buildBlockMetadata } = require('./blockParser');

const minioClient = new Minio.Client({
    endPoint: MINIO_CONFIG.ENDPOINT,
    port: MINIO_CONFIG.PORT,
    useSSL: false,
    accessKey: MINIO_CONFIG.ACCESS_KEY,
    secretKey: MINIO_CONFIG.SECRET_KEY
});

const BUCKET_NAME = MINIO_CONFIG.BUCKET_NAME;

// Flag: có query private data không (cần Fabric network online)
const WITH_PRIVATE = process.argv.includes('--with-private');

let fabricContract = null;

/**
 * Functions mà cần query private data
 */
const FUNCTIONS_WITH_PRIVATE_DATA = [
    'CreateOrder',
    'PayoutToSeller',
    'ConfirmPayment',
    'CancelOrder',
    'ShipOrder',
    'ConfirmDelivery',
    'ConfirmCODDelivery',
    'RemitCOD',
    'RequestReturn',
    'ShipReturn',
    'ConfirmReturnReceived'
];

/**
 * Read object from MinIO as JSON
 */
function readObject(objectName) {
    return new Promise((resolve, reject) => {
        let data = '';
        minioClient.getObject(BUCKET_NAME, objectName, (err, stream) => {
            if (err) return reject(err);
            stream.on('data', chunk => { data += chunk.toString(); });
            stream.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`JSON parse error for ${objectName}: ${e.message}`)); }
            });
            stream.on('error', reject);
        });
    });
}

/**
 * Upload object to MinIO
 */
function uploadObject(objectName, data) {
    return new Promise((resolve, reject) => {
        const buffer = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
        minioClient.putObject(BUCKET_NAME, objectName, buffer, (err, etag) => {
            if (err) reject(err);
            else resolve(etag);
        });
    });
}

/**
 * List all raw block files in MinIO
 */
function listRawBlocks() {
    return new Promise((resolve, reject) => {
        const objects = [];
        const prefixes = ['blocks/', 'raw/blocks/'];
        let completed = 0;

        for (const prefix of prefixes) {
            const stream = minioClient.listObjects(BUCKET_NAME, prefix, true);
            stream.on('data', obj => {
                if (obj.name && obj.name.endsWith('.json')) {
                    objects.push(obj.name);
                }
            });
            stream.on('end', () => {
                completed++;
                if (completed === prefixes.length) resolve(objects);
            });
            stream.on('error', err => {
                completed++;
                console.warn(`Listing ${prefix} failed:`, err.message);
                if (completed === prefixes.length) resolve(objects);
            });
        }
    });
}

/**
 * Extract block number from filename
 */
function getBlockNumber(objectName) {
    const match = objectName.match(/block_(\d+)\.json/);
    return match ? parseInt(match[1]) : null;
}

/**
 * Query order data từ chaincode — V2 format (giống blockListener)
 * Returns { order_data, private_data } giống cấu trúc JSONL
 */
async function queryOrderData(orderID) {
    if (!fabricContract) return null;

    try {
        const resultBuffer = await fabricContract.evaluateTransaction('QueryOrder', orderID);
        const result = JSON.parse(resultBuffer.toString());
        if (!result) return null;

        const response = {};

        // ── PUBLIC DATA → order_data ──
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

        // ── PRIVATE DATA → private_data ──
        if (result.privateData) {
            const pd = result.privateData;
            if (pd.sellerData || pd.shipperData || pd.taxData) {
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
        console.warn(`     ⚠️ Query failed for ${orderID}: ${err.message}`);
        return null;
    }
}

/**
 * Main backfill process
 */
async function backfill() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  BACKFILL: Reprocessing Raw Blocks → Structured Data');
    console.log(`  Private data enrichment: ${WITH_PRIVATE ? '✅ ENABLED' : '❌ DISABLED (use --with-private)'}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Kết nối Fabric nếu cần private data
    if (WITH_PRIVATE) {
        try {
            console.log('🔗 Đang kết nối Fabric network...');
            const { contract } = await connectToNetwork('platform', 'admin');
            fabricContract = contract;
            console.log('✅ Đã kết nối Fabric!\n');
        } catch (err) {
            console.error(`❌ Không kết nối được Fabric: ${err.message}`);
            console.log('   Tiếp tục backfill KHÔNG có private data...\n');
        }
    }

    // 1. List all raw blocks
    const rawFiles = await listRawBlocks();
    
    // Deduplicate (nếu block tồn tại ở cả blocks/ và raw/blocks/)
    const blockMap = new Map();
    for (const file of rawFiles) {
        const num = getBlockNumber(file);
        if (num !== null && !blockMap.has(num)) {
            blockMap.set(num, file);
        }
    }

    const uniqueBlocks = [...blockMap.entries()].sort((a, b) => a[0] - b[0]);
    console.log(`📦 Tìm thấy ${uniqueBlocks.length} block(s) duy nhất\n`);

    if (uniqueBlocks.length === 0) {
        console.log('Không có block nào để xử lý.');
        return;
    }

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    let totalTx = 0;
    let privateDataCount = 0;
    const allOrderIds = new Set();

    for (const [blockNumber, rawFile] of uniqueBlocks) {
        try {
            const blockData = await readObject(rawFile);
            const transactions = extractTransactions(blockData, blockNumber);

            // Migrate old path to raw/blocks/
            if (rawFile.startsWith('blocks/') && !rawFile.startsWith('raw/')) {
                await uploadObject(`raw/blocks/block_${blockNumber}.json`, blockData);
            }

            // Write structured events
            if (transactions.length > 0) {
                // Collect order IDs
                for (const tx of transactions) {
                    const orderId = tx.order_data?.order_id
                        || (tx.args?.length > 0 && tx.args[0].startsWith('ORD-') ? tx.args[0] : null);
                    if (orderId) allOrderIds.add(orderId);
                }

                // Enrich with private data
                if (fabricContract) {
                    for (const tx of transactions) {
                        if (!tx.is_valid) continue;
                        const orderID = tx.order_data?.order_id
                            || (tx.args?.length > 0 && tx.args[0].startsWith('ORD-') ? tx.args[0] : null);

                        if (orderID && FUNCTIONS_WITH_PRIVATE_DATA.includes(tx.function_name)) {
                            const enriched = await queryOrderData(orderID);
                            if (enriched) {
                                if (enriched.order_data) tx.order_data = enriched.order_data;
                                if (enriched.private_data) tx.private_data = enriched.private_data;
                                privateDataCount++;
                            }
                        }
                    }
                }

                // Write JSONL
                const txDate = new Date(transactions[0].timestamp);
                const year = txDate.getFullYear();
                const month = String(txDate.getMonth() + 1).padStart(2, '0');
                const day = String(txDate.getDate()).padStart(2, '0');
                const partitionPath = `structured/${year}/${month}/${day}`;

                const jsonLines = transactions.map(tx => JSON.stringify(tx)).join('\n') + '\n';
                await uploadObject(`${partitionPath}/events_block_${blockNumber}.jsonl`, jsonLines);

                // Write private data files riêng
                for (const tx of transactions) {
                    if (!tx.private_data || !tx.order_data?.order_id) continue;
                    const orderId = tx.order_data.order_id;
                    await uploadObject(
                        `private/${orderId}/block_${blockNumber}_${tx.function_name}.json`,
                        {
                            order_id: orderId,
                            block_number: blockNumber,
                            tx_id: tx.tx_id,
                            function_name: tx.function_name,
                            timestamp: tx.timestamp,
                            ...tx.private_data
                        }
                    );
                }

                totalTx += transactions.length;
                const pvtNote = transactions.some(t => t.private_data) ? ' 🔐' : '';
                console.log(`  ✅ Block #${blockNumber}: ${transactions.length} tx → ${partitionPath}/${pvtNote}`);
            } else {
                console.log(`  ℹ️  Block #${blockNumber}: 0 endorser tx`);
            }

            // Write metadata
            const metadata = buildBlockMetadata(blockData, blockNumber, transactions);
            await uploadObject(`metadata/block_${blockNumber}.json`, metadata);

            processed++;

        } catch (err) {
            console.error(`  ❌ Block #${blockNumber}: ${err.message}`);
            errors++;
        }
    }

    // ═══════════════════════════════════════════════════════
    // BONUS: Query private data cho TẤT CẢ orders (bao gồm orders
    // mà block gốc không có trong MinIO nhưng vẫn tồn tại trên chain)
    // ═══════════════════════════════════════════════════════
    if (fabricContract && allOrderIds.size > 0) {
        console.log(`\n🔐 Querying current state cho ${allOrderIds.size} order(s)...`);
        
        let snapshotCount = 0;
        for (const orderId of allOrderIds) {
            try {
                const enriched = await queryOrderData(orderId);
                if (enriched) {
                    await uploadObject(`private/${orderId}/current_state.json`, {
                        order_id: orderId,
                        snapshot_at: new Date().toISOString(),
                        ...enriched
                    });
                    snapshotCount++;

                    const status = enriched.order_data?.status || '?';
                    const hasSeller = !!enriched.private_data?.seller_data;
                    const hasShipper = !!enriched.private_data?.shipper_data;
                    const hasTax = !!enriched.private_data?.tax_data;
                    console.log(`  📸 ${orderId} [${status}] seller=${hasSeller} shipper=${hasShipper} tax=${hasTax}`);
                }
            } catch (err) {
                console.warn(`  ⚠️ ${orderId}: ${err.message}`);
            }
        }
        console.log(`  → ${snapshotCount}/${allOrderIds.size} order snapshots saved`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`  BACKFILL COMPLETE`);
    console.log(`  Blocks: ${processed} processed | ${skipped} skipped | ${errors} errors`);
    console.log(`  Transactions: ${totalTx} extracted`);
    console.log(`  Private data: ${privateDataCount} enriched`);
    console.log(`  Unique orders: ${allOrderIds.size}`);
    console.log('═══════════════════════════════════════════════════════════\n');
}

// Run
backfill()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Backfill critical error:', err);
        process.exit(1);
    });
