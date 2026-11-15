// blockchain-adapter/src/routes/api.js

const express = require('express');
const router = express.Router();

const orderController = require('../controllers/orderController');
const identityController = require('../controllers/identityController');
const configController = require('../controllers/configController');

// --- NHÓM TẠO & QUẢN LÝ ---
router.post('/create-order', orderController.createOrder);
router.post('/cancel-order', orderController.cancelOrder);

// --- NHÓM THANH TOÁN (SÀN) ---
router.post('/confirm-payment', orderController.confirmPayment);
router.post('/remit-cod', orderController.remitCOD);
router.post('/payout', orderController.payoutToSeller);

// --- NHÓM GIAO VẬN (SHIPPER) ---
router.post('/ship-order', orderController.shipOrder);
router.post('/confirm-delivery', orderController.confirmDelivery);
router.post('/confirm-cod-delivery', orderController.confirmCODDelivery);

// --- 4. NHÓM HOÀN TRẢ (RETURN FLOW) ---
router.post('/request-return', orderController.requestReturn);
router.post('/ship-return', orderController.shipReturn);
router.post('/confirm-return-received', orderController.confirmReturnReceived);

// --- NHÓM TRUY VẤN ---
router.get('/query-order', orderController.getOrder);
router.post('/query-orders', orderController.queryOrders);

// --- 6. NHÓM CẤU HÌNH (TAX & BUSINESS) ---
router.get('/config/:type', configController.getConfig);
router.post('/config/:type', configController.setConfig);

// --- 7. NHÓM ĐỊNH DANH ---
router.post('/register-user', identityController.registerUser);

module.exports = router;