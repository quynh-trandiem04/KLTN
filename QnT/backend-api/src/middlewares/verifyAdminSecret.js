// backend-api/src/middlewares/verifyAdminSecret.js
const authService = require('../services/auth.service');
require('dotenv').config();

const ADMIN_SECRET = process.env.ADMIN_REGISTRATION_SECRET;

/**
 * Middleware: Verify admin registration secret
 */
async function verifyAdminSecret(req, res, next) {
    const adminSecret = req.headers['x-admin-secret'];
    
    // Check if first admin can be created without secret
    const canCreateWithoutSecret = await authService.canCreateAdmin();
    if (canCreateWithoutSecret) {
        console.log('WARNING: First admin registration - bypassing secret check');
        return next();
    }
    
    // Otherwise, require secret
    if (!adminSecret) {
        return res.status(403).json({
            detail: 'Missing X-Admin-Secret header. Admin registration requires authorization.'
        });
    }
    
    if (adminSecret !== ADMIN_SECRET) {
        return res.status(403).json({
            detail: 'Invalid admin secret. Unauthorized to create admin account.'
        });
    }
    
    next();
}

module.exports = verifyAdminSecret;
