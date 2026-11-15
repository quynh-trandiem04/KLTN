// backend-api/src/services/storage.service.js
// Storage service for uploading files to Supabase or MinIO

const supabase = require('../config/supabase');
const { minioClient, isAvailable: isMinioAvailable } = require('../config/minio');
const path = require('path');

class StorageService {
    
    /**
     * Upload shipper logo to cloud storage
     * @param {Buffer} fileBuffer - File buffer from multer
     * @param {String} originalName - Original filename
     * @param {String} mimeType - File MIME type
     * @param {String} userId - User ID for unique filename
     * @returns {Promise<String>} - Public URL of uploaded file
     */
    async uploadShipperLogo(fileBuffer, originalName, mimeType, userId) {
        try {
            // Generate unique filename
            const fileExt = path.extname(originalName).toLowerCase();
            const fileName = `shipper-logos/${userId}-${Date.now()}${fileExt}`;
            
            // Try Supabase Storage first
            if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
                return await this.uploadToSupabase(fileBuffer, fileName, mimeType);
            }
            
            // Fallback to MinIO if configured
            if (isMinioAvailable()) {
                return await this.uploadToMinIO(fileBuffer, fileName, mimeType);
            }
            
            throw new Error('No storage service configured');
            
        } catch (error) {
            console.error('Storage upload error:', error.message);
            throw error;
        }
    }
    
    /**
     * Upload to Supabase Storage
     */
    async uploadToSupabase(fileBuffer, fileName, mimeType) {
        const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'shipper-assets';
        
        try {
            // Check if bucket exists, create if not
            const { data: buckets } = await supabase.storage.listBuckets();
            const bucketExists = buckets.some(b => b.name === bucketName);
            
            if (!bucketExists) {
                await supabase.storage.createBucket(bucketName, {
                    public: true, // Make bucket public for easy access
                    fileSizeLimit: 2 * 1024 * 1024 // 2MB
                });
                console.log(`Created Supabase bucket: ${bucketName}`);
            }
            
            // Upload file
            const { data, error } = await supabase.storage
                .from(bucketName)
                .upload(fileName, fileBuffer, {
                    contentType: mimeType,
                    upsert: true, // Overwrite if exists
                    cacheControl: '3600' // Cache for 1 hour
                });
            
            if (error) {
                throw new Error(`Supabase upload error: ${error.message}`);
            }
            
            // Get public URL
            const { data: urlData } = supabase.storage
                .from(bucketName)
                .getPublicUrl(fileName);
            
            console.log('- Uploaded to Supabase:', urlData.publicUrl);
            return urlData.publicUrl;
            
        } catch (error) {
            console.error('Supabase upload failed:', error.message);
            throw error;
        }
    }
    
    /**
     * Upload to MinIO
     */
    async uploadToMinIO(fileBuffer, fileName, mimeType) {
        const bucketName = process.env.MINIO_BUCKET || 'shipper-assets';
        
        try {
            // Check if bucket exists
            const exists = await minioClient.bucketExists(bucketName);
            if (!exists) {
                await minioClient.makeBucket(bucketName, 'us-east-1');
                console.log(`Created MinIO bucket: ${bucketName}`);
            }
            
            // Upload file
            await minioClient.putObject(
                bucketName,
                fileName,
                fileBuffer,
                fileBuffer.length,
                { 'Content-Type': mimeType }
            );
            
            // Generate public URL (assumes MinIO is accessible)
            const endpoint = process.env.MINIO_ENDPOINT;
            const port = process.env.MINIO_PORT || 9000;
            const publicUrl = `http://${endpoint}:${port}/${bucketName}/${fileName}`;
            
            console.log('- Uploaded to MinIO:', publicUrl);
            return publicUrl;
            
        } catch (error) {
            console.error('MinIO upload failed:', error.message);
            throw error;
        }
    }
    
    /**
     * Delete file from storage
     * @param {String} fileUrl - Full URL of the file to delete
     */
    async deleteFile(fileUrl) {
        try {
            // Extract filename from URL
            const urlParts = fileUrl.split('/');
            const fileName = urlParts.slice(-2).join('/'); // e.g., "shipper-logos/123-456.png"
            
            if (fileUrl.includes('supabase')) {
                const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'shipper-assets';
                const { error } = await supabase.storage
                    .from(bucketName)
                    .remove([fileName]);
                
                if (error) throw error;
                console.log('- Deleted from Supabase:', fileName);
            } else if (isMinioAvailable()) {
                const bucketName = process.env.MINIO_BUCKET || 'shipper-assets';
                await minioClient.removeObject(bucketName, fileName);
                console.log('- Deleted from MinIO:', fileName);
            }
        } catch (error) {
            console.warn('Delete file error:', error.message);
            // Don't throw - file might already be deleted
        }
    }
}

module.exports = new StorageService();
