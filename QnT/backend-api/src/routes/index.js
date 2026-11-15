// backend-api/src/routes/index.js
const express = require('express');
const router = express.Router();

// Import v1 routes
const authRoutes = require('./v1/auth.routes');
const adminRoutes = require('./v1/admin.routes');
const taxRoutes = require('./v1/tax.routes');
const sellerRoutes = require('./v1/seller.routes');
const shopRoutes = require('./v1/shop.routes');
const cartRoutes = require('./v1/cart.routes');
const orderRoutes = require('./v1/order.routes');
const shipperRoutes = require('./v1/shipper.routes');
const shippingRoutes = require('./v1/shipping.routes');
const couponRoutes = require('./v1/coupon.routes');
const wishlistRoutes = require('./v1/wishlist.routes');
const analyticsRoutes = require('./v1/analytics.routes');

// Mount routes
router.use('/v1/auth', authRoutes);
router.use('/v1/admin', adminRoutes);
router.use('/v1/tax', taxRoutes);
router.use('/v1/seller', sellerRoutes);
router.use('/v1/shop', shopRoutes);
router.use('/v1/cart', cartRoutes);
router.use('/v1/orders', orderRoutes);
router.use('/v1/shipper', shipperRoutes);
router.use('/v1/shipping', shippingRoutes);
router.use('/v1/coupons', couponRoutes);
router.use('/v1/wishlist', wishlistRoutes);
router.use('/v1/analytics', analyticsRoutes);

// Health check
router.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Backend API',
        version: '1.0.0'
    });
});

module.exports = router;
