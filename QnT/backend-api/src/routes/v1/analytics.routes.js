// backend-api/src/routes/v1/analytics.routes.js
// ═══════════════════════════════════════════════════════════════
// Analytics Routes V3 — Multi-Org Dashboard Endpoints
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const analyticsController = require('../../controllers/analyticsController');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');

// Tất cả analytics routes yêu cầu đăng nhập
router.use(verifyToken);

// ── Admin / Platform Analytics (chỉ ADMIN) ──
router.get('/admin/overview', checkRole(['ADMIN']), analyticsController.getAdminOverview);
router.get('/admin/revenue-by-month', checkRole(['ADMIN']), analyticsController.getRevenueByMonth);
router.get('/admin/order-status', checkRole(['ADMIN']), analyticsController.getOrderStatusDistribution);
router.get('/admin/payment-methods', checkRole(['ADMIN']), analyticsController.getPaymentMethodStats);

// ── Seller Analytics (ADMIN hoặc STORE_OWNER) ──
router.get('/seller/overview', checkRole(['ADMIN']), analyticsController.getSellerOverview);
router.get('/seller/revenue', checkRole(['ADMIN', 'STORE_OWNER']), analyticsController.getSellerRevenue);

// ── Shipper Analytics (ADMIN hoặc SHIPPER) ──
router.get('/shipper/overview', checkRole(['ADMIN']), analyticsController.getShipperOverview);
router.get('/shipper/delivery', checkRole(['ADMIN', 'SHIPPER']), analyticsController.getShipperDelivery);

// ── Tax Analytics (ADMIN hoặc TAX_OFFICER) ──
router.get('/tax/report', checkRole(['ADMIN', 'TAX_OFFICER']), analyticsController.getTaxReport);

// ── Blockchain Audit (chỉ ADMIN) ──
router.get('/audit/events', checkRole(['ADMIN']), analyticsController.getAuditEvents);
router.get('/audit/order/:orderId', checkRole(['ADMIN']), analyticsController.getOrderLifecycle);

module.exports = router;
