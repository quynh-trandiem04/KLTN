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

async function getHighestBlock() {
    return new Promise((resolve, reject) => {
        let maxBlock = 0;
        const stream = minioClient.listObjects(BUCKET_NAME, 'structured/ecommercechannel/', true);
        stream.on('data', obj => {
            // events_block_1245.jsonl
            const match = obj.name.match(/events_block_(\d+)/);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxBlock) maxBlock = num;
            }
        });
        stream.on('end', () => resolve(maxBlock));
        stream.on('error', reject);
    });
}

getHighestBlock().then(console.log).catch(console.error);
