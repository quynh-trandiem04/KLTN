// backend-api/src/routes/v1/shipper.routes.js
const express = require('express');
const router = express.Router();
const shipperController = require('../../controllers/shipperController');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const { upload, handleMulterError } = require('../../config/upload');

const auth = [verifyToken, checkRole(['SHIPPER', 'ADMIN'])];

router.get('/dashboard-stats', ...auth, shipperController.getDashboardStats.bind(shipperController));
router.get('/orders', ...auth, shipperController.getOrders.bind(shipperController));
router.post('/orders/:id/ship', ...auth, shipperController.shipOrder.bind(shipperController));
router.post('/orders/:id/deliver', ...auth, shipperController.confirmDelivery.bind(shipperController));
router.post('/orders/:id/deliver-cod', ...auth, shipperController.confirmCODDelivery.bind(shipperController));
router.post('/orders/:id/ship-return', ...auth, shipperController.shipReturn.bind(shipperController));
router.get('/profile', ...auth, shipperController.getProfile.bind(shipperController));
router.put('/profile', ...auth, shipperController.upsertProfile.bind(shipperController));
router.post('/profile/upload-logo', ...auth, upload.single('logo'), handleMulterError, shipperController.uploadLogo.bind(shipperController));
router.get('/rates', ...auth, shipperController.getRates.bind(shipperController));
router.put('/rates', ...auth, shipperController.replaceRates.bind(shipperController));
router.get('/services', ...auth, shipperController.getServices.bind(shipperController));
router.put('/services', ...auth, shipperController.replaceServices.bind(shipperController));
router.get('/surcharges', ...auth, shipperController.getSurcharges.bind(shipperController));
router.put('/surcharges', ...auth, shipperController.upsertSurcharges.bind(shipperController));

module.exports = router;
