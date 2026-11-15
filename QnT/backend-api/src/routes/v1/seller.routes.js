// backend-api/src/routes/v1/seller.routes.js
const express = require('express');
const router = express.Router();
const sellerController = require('../../controllers/sellerController');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');

const auth = [verifyToken, checkRole(['STORE_OWNER', 'ADMIN'])];

// Dashboard
router.get('/dashboard-stats', ...auth, sellerController.getDashboardStats.bind(sellerController));

// Products
router.get('/products/meta', ...auth, sellerController.getProductMeta.bind(sellerController));
router.get('/products', ...auth, sellerController.getProducts.bind(sellerController));
router.get('/products/:id', ...auth, sellerController.getProduct.bind(sellerController));
router.post('/products', ...auth, sellerController.createProduct.bind(sellerController));
router.put('/products/:id', ...auth, sellerController.updateProduct.bind(sellerController));
router.delete('/products/:id', ...auth, sellerController.deleteProduct.bind(sellerController));

// Orders
router.get('/orders', ...auth, sellerController.getOrders.bind(sellerController));
router.get('/orders/:id/items', ...auth, sellerController.getOrderItems.bind(sellerController));
router.post('/orders/:id/confirm-return-received', ...auth, sellerController.confirmReturnReceived.bind(sellerController));

// Debug: Test sold count
router.get('/debug/sold-count/:productId', ...auth, sellerController.testSoldCount.bind(sellerController));

module.exports = router;
