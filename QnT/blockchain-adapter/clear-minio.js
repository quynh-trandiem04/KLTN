// blockchain-adapter/clear-minio.js
const Minio = require('minio');
require('dotenv').config();

// Lấy config từ file constants của bạn (giống cách view-order.js làm)
const { MINIO_CONFIG } = require('./src/config/constants');

const minioClient = new Minio.Client({
    endPoint: MINIO_CONFIG.ENDPOINT,
    port: MINIO_CONFIG.PORT,
    useSSL: false,
    accessKey: MINIO_CONFIG.ACCESS_KEY,
    secretKey: MINIO_CONFIG.SECRET_KEY
});

const BUCKET = MINIO_CONFIG.BUCKET_NAME;

async function clearBucket() {
    console.log(`\n🧹 Đang quét toàn bộ file trong bucket: [${BUCKET}]...`);
    
    const objectsList = [];
    const stream = minioClient.listObjects(BUCKET, '', true);

    stream.on('data', function(obj) {
        objectsList.push(obj.name);
    });

    stream.on('error', function(err) {
        console.error('❌ Lỗi khi đọc bucket:', err);
    });

    stream.on('end', async function() {
        if (objectsList.length === 0) {
            console.log('✅ Bucket đã trống tinh tươm, không cần xóa gì thêm!\n');
            return;
        }

        console.log(`🗑️ Tìm thấy ${objectsList.length} files. Đang tiến hành xóa sạch...`);
        
        try {
            await minioClient.removeObjects(BUCKET, objectsList);
            console.log(`✅ Đã xóa thành công toàn bộ ${objectsList.length} files và "thư mục"!`);
            console.log(`🚀 Bây giờ bạn có thể chạy lại script Backfill với mạng Fabric mới.\n`);
        } catch (e) {
            console.error('❌ Lỗi khi xóa file:', e);
        }
    });
}

clearBucket();