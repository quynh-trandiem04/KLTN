// backend-api/src/routes/v1/admin.routes.js
const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/adminController');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const { getTrackingHistory } = require('../../services/trackingService');
const pool = require('../../config/database');
const { getGuestToken, getGuestTokenForCustomerBehavior } = require('../../controllers/supersetController');

// Helper inline — admin/shipper đọc tracking bất kỳ đơn nào
async function getOrderTrackingAdmin(req, res) {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        const orderCheck = await client.query(
            `SELECT id, status, codstatus, paymentmethod FROM orders WHERE id = $1`,
            [id]
        );
        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
        }
        const history = await getTrackingHistory(client, id);
        res.json({
            order_id: id,
            current_status: orderCheck.rows[0].status,
            current_codstatus: orderCheck.rows[0].codstatus,
            tracking: history
        });
    } catch (e) {
        console.error('getOrderTracking (admin):', e.message);
        res.status(500).json({ detail: 'Lỗi server: ' + e.message });
    } finally {
        client.release();
    }
}

/**
 * Admin Routes - Require ADMIN role
 * All routes protected by verifyToken and checkRole(['ADMIN'])
 */

/**
 * @route GET /api/v1/admin/seller-applications
 * @desc Get seller applications (with optional status filter)
 * @query status - PENDING | REVIEWING | APPROVED | REJECTED
 * @access Admin only
 */
router.get(
    '/seller-applications',
    verifyToken,
    checkRole(['ADMIN']),
    adminController.getSellerApplications.bind(adminController)
);

/**
 * @route POST /api/v1/admin/approve-seller/:id
 * @desc Approve seller application and grant STORE_OWNER role
 * @access Admin only
 */
router.post(
    '/approve-seller/:id',
    verifyToken,
    checkRole(['ADMIN']),
    adminController.approveSeller.bind(adminController)
);

/**
 * @route POST /api/v1/admin/reject-seller/:id
 * @desc Reject seller application
 * @body { reason: string }
 * @access Admin only
 */
router.post(
    '/reject-seller/:id',
    verifyToken,
    checkRole(['ADMIN']),
    adminController.rejectSeller.bind(adminController)
);

/**
 * @route GET /api/v1/admin/dashboard-stats
 * @desc Get aggregate stats for admin dashboard
 * @access Admin only
 */
router.get(
    '/dashboard-stats',
    verifyToken,
    checkRole(['ADMIN']),
    adminController.getDashboardStats.bind(adminController)
);

// Order management
router.get('/orders', verifyToken, checkRole(['ADMIN']), adminController.getOrders.bind(adminController));
router.get('/orders/:id/items', verifyToken, checkRole(['ADMIN']), adminController.getOrderItems.bind(adminController));
router.get('/orders/:id', verifyToken, checkRole(['ADMIN']), adminController.getOrder.bind(adminController));
router.post('/orders/:id/confirm-payment', verifyToken, checkRole(['ADMIN']), adminController.confirmPayment.bind(adminController));
router.post('/orders/:id/cancel', verifyToken, checkRole(['ADMIN']), adminController.cancelOrder.bind(adminController));
router.post('/orders/:id/request-return', verifyToken, checkRole(['ADMIN']), adminController.requestReturn.bind(adminController));
router.post('/orders/:id/remit-cod', verifyToken, checkRole(['ADMIN']), adminController.remitCOD.bind(adminController));
router.post('/orders/:id/payout', verifyToken, checkRole(['ADMIN']), adminController.payoutToSeller.bind(adminController));
router.get('/orders/:id/tracking', verifyToken, checkRole(['ADMIN', 'SHIPPER']), getOrderTrackingAdmin); // Lịch sử tracking


// Shipper management
router.get('/shippers', verifyToken, checkRole(['ADMIN']), adminController.getShippers.bind(adminController));
router.post('/shippers', verifyToken, checkRole(['ADMIN']), adminController.createShipper.bind(adminController));
router.patch('/shippers/:id/toggle', verifyToken, checkRole(['ADMIN']), adminController.toggleShipper.bind(adminController));
router.put('/shippers/:id/profile', verifyToken, checkRole(['ADMIN']), adminController.updateShipperProfile.bind(adminController));

// User management
router.get('/users', verifyToken, checkRole(['ADMIN']), adminController.getUsers.bind(adminController));
router.get('/users/:id', verifyToken, checkRole(['ADMIN']), adminController.getUserById.bind(adminController));
router.post('/users', verifyToken, checkRole(['ADMIN']), adminController.createUser.bind(adminController));
router.put('/users/:id', verifyToken, checkRole(['ADMIN']), adminController.updateUser.bind(adminController));
router.delete('/users/:id', verifyToken, checkRole(['ADMIN']), adminController.deleteUser.bind(adminController));
router.patch('/users/:id/toggle', verifyToken, checkRole(['ADMIN']), adminController.toggleUser.bind(adminController));

// Blockchain config routes
router.get('/config', verifyToken, checkRole(['ADMIN']), adminController.getBlockchainConfig.bind(adminController));
router.post('/config/tax', verifyToken, checkRole(['ADMIN']), adminController.setTaxConfig.bind(adminController));
router.post('/config/business', verifyToken, checkRole(['ADMIN']), adminController.setBusinessConfig.bind(adminController));

// Payouts / Đối soát
router.get('/payouts', verifyToken, checkRole(['ADMIN']), adminController.getPayouts.bind(adminController));

// Superset embedded dashboard — guest token
// GET /api/v1/admin/superset/guest-token
router.get('/superset/guest-token', verifyToken, checkRole(['ADMIN']), getGuestToken);
// GET /api/v1/admin/superset/customer-behavior-token
router.get('/superset/customer-behavior-token', verifyToken, checkRole(['ADMIN']), getGuestTokenForCustomerBehavior);

module.exports = router;
