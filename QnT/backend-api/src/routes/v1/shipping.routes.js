const express = require('express');
const router = express.Router();
const shippingController = require('../../controllers/shippingController');

// Public routes — no auth required
router.get('/carriers', shippingController.getCarriers.bind(shippingController));
router.get('/calculate', shippingController.calculateFee.bind(shippingController));
router.get('/shippers', shippingController.getActiveShippers.bind(shippingController));
router.get('/calculate-all', shippingController.calculateAllShippers.bind(shippingController));

module.exports = router;
