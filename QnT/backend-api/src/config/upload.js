// backend-api/src/config/upload.js
// Multer configuration for file uploads

const multer = require('multer');
const path = require('path');

// Use memory storage to handle file in memory before uploading to cloud
const storage = multer.memoryStorage();

// File filter - only allow images
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed (jpg, png, webp, gif)'));
    }
};

// Multer upload instance
const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 2 * 1024 * 1024 // 2MB max file size
    },
    fileFilter: fileFilter
});

// Middleware to handle multer errors
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                detail: 'File quá lớn. Kích thước tối đa: 2MB' 
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

module.exports = { upload, handleMulterError };
