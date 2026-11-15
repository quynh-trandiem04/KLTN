// backend-api/src/config/paymentProofUpload.js
// Multer configuration for payment proof uploads (local storage)

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Disk storage for payment proofs
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename: payment-proof-{orderId}-{timestamp}.ext
        const orderId = req.params.id;
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `payment-proof-${orderId}-${timestamp}${ext}`);
    }
});

// File filter - only allow images
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Chỉ cho phép file ảnh (jpg, png, webp, gif)'));
    }
};

// Multer upload instance for payment proofs
const uploadPaymentProof = multer({
    storage: storage,
    limits: { 
        fileSize: 5 * 1024 * 1024 // 5MB max file size for payment proofs
    },
    fileFilter: fileFilter
});

// Middleware to handle multer errors
const handlePaymentProofUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                detail: 'File quá lớn. Kích thước tối đa: 5MB' 
            });
        }
        return res.status(400).json({ 
            detail: 'Lỗi upload file: ' + err.message 
        });
    } else if (err) {
        return res.status(400).json({ 
            detail: err.message 
        });
    }
    next();
};

module.exports = { uploadPaymentProof, handlePaymentProofUploadError };