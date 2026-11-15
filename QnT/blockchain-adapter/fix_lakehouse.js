const http = require('http');
const Minio = require('minio');
const { MINIO_CONFIG } = require('./src/config/constants.js');
const minioClient = new Minio.Client({
    endPoint: MINIO_CONFIG.ENDPOINT,
    port: MINIO_CONFIG.PORT,
    useSSL: false,
    accessKey: MINIO_CONFIG.ACCESS_KEY,
    secretKey: MINIO_CONFIG.SECRET_KEY
});
const BUCKET_NAME = MINIO_CONFIG.BUCKET_NAME;
const ordersToFix = [
    'ORD-248611-1212-9NBA',
    'ORD-248618-1432-KDRA',
    'ORD-811801-1214-2UAA',
    'ORD-729953-1114-OU5W',
    'ORD-248608-1089-LKJW',
    'ORD-729954-1191-3VEX'
];

function fetchOrder(orderId) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:3000/api/query-order?orderID=${orderId}&requestorOrg=platform&requestorUser=admin-ca-platform`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function getHighestBlock() {
    return new Promise((resolve, reject) => {
        let maxBlock = 0;
        let trashFiles = [];
        const stream = minioClient.listObjects(BUCKET_NAME, 'structured/', true);
        stream.on('data', obj => {
            if (obj.name.endsWith('_fix.jsonl') || obj.name.includes('999999')) {
                trashFiles.push(obj.name);
            } else {
                const match = obj.name.match(/events_block_(\d+)/);
                if (match) {
                    const num = parseInt(match[1]);
                    if (num > maxBlock) {
                        maxBlock = num;
                    }
                }
            }
        });
        stream.on('end', () => resolve({ maxBlock, trashFiles }));
        stream.on('error', reject);
    });
}

async function fix() {
    console.log("Đang tìm Block cao nhất hiện tại trên MinIO...");
    const { maxBlock, trashFiles } = await getHighestBlock();
    console.log(`-> Block gốc cao nhất hiện tại là: ${maxBlock}`);
    
    // Dọn dẹp tất cả các file rác 999999
    if (trashFiles.length > 0) {
        for (const file of trashFiles) {
            try {
                await minioClient.removeObject(BUCKET_NAME, file);
                console.log(`Đã xóa file block rác: ${file}`);
            } catch (e) {
                // Ignore
            }
        }
    }
    
    const targetBlock = maxBlock + 1;
    console.log(`-> Đang tạo synthetic events với block_number = ${targetBlock} để bypass incremental filter...`);
    
    let events = [];
    for (const orderId of ordersToFix) {
        console.log(`Fetching ${orderId} from Blockchain...`);
        try {
            const data = await fetchOrder(orderId);
            if (data && data.success && data.data) {
                const bcData = data.data;
                const latestStatus = bcData.publicData.status;
                const history = bcData.publicData.history || [];
                
                if (history.length > 0) {
                    const latestTx = history[history.length - 1];
                    const pub = bcData.publicData;
                    const pd = bcData.privateData || {};
                    
                    const syntheticEvent = {
                        block_number: targetBlock,
                        tx_index: 9999,
                        tx_id: latestTx.txID,
                        timestamp: latestTx.timestamp,
                        channel_id: "ecommercechannel",
                        chaincode_id: "ecommerce",
                        function_name: latestTx.action,
                        args: [orderId],
                        is_valid: true,
                        order_data: {
                            order_id: pub.orderID || orderId,
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
                            last_action: latestTx.action || ''
                        },
                        private_data: {
                            seller_data: pd.sellerData || null,
                            shipper_data: pd.shipperData || null,
                            tax_data: pd.taxData || null,
                            data_verified: bcData.dataVerified || false
                        }
                    };
                    events.push(syntheticEvent);
                    console.log(` -> Found latest status: ${latestStatus}`);
                }
            }
        } catch (e) {
            console.log(`Failed for ${orderId}:`, e.message);
        }
    }
    
    if (events.length > 0) {
        const jsonl = events.map(e => JSON.stringify(e)).join('\n') + '\n';
        
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const partitionPath = `structured/${year}/${month}/${day}`;
        
        const objectName = `${partitionPath}/events_block_${targetBlock}_fix.jsonl`;
        await minioClient.putObject(BUCKET_NAME, objectName, Buffer.from(jsonl));
        console.log(`\nUploaded synthetic block to MinIO: ${objectName}`);
        console.log('Done! Now run the Lakehouse ETL pipeline again.');
    }
}
fix();
