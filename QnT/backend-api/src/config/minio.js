// backend-api\src\config\minio.js

const Minio = require('minio');
require('dotenv').config();

let minioClient = null;
let minioAvailable = false;

// Only initialize MinIO if endpoint is configured
if (process.env.MINIO_ENDPOINT) {
    try {
        minioClient = new Minio.Client({
            endPoint: process.env.MINIO_ENDPOINT,
            port: parseInt(process.env.MINIO_PORT) || 9000,
            useSSL: false,
            accessKey: process.env.MINIO_ACCESS_KEY,
            secretKey: process.env.MINIO_SECRET_KEY
        });

        // Test connection with timeout
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 5000)
        );

        Promise.race([
            minioClient.bucketExists(process.env.MINIO_BUCKET),
            timeoutPromise
        ]).then(exists => {
            minioAvailable = true;
            if (!exists) {
                return minioClient.makeBucket(process.env.MINIO_BUCKET, 'us-east-1');
            }
            console.log('MinIO Connection Ready.');
        }).then(() => {
            if (minioAvailable) console.log('MinIO Bucket ready.');
        }).catch(err => {
            console.log('MinIO Warning:', err.message, '- File uploads will be disabled');
            minioAvailable = false;
        });
    } catch (err) {
        console.log('MinIO Init Error:', err.message);
    }
} else {
    console.log('MinIO not configured - File uploads disabled');
}

module.exports = { minioClient, isAvailable: () => minioAvailable };

