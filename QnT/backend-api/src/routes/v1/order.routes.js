const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/orderController');
const verifyToken = require('../../middlewares/verifyToken');
const { uploadPaymentProof, handlePaymentProofUploadError } = require('../../config/paymentProofUpload');

router.use(verifyToken);

router.get('/addresses', orderController.getAddresses.bind(orderController));
router.post('/addresses', orderController.createAddress.bind(orderController));
router.put('/addresses/:id', orderController.updateAddress.bind(orderController));
router.delete('/addresses/:id', orderController.deleteAddress.bind(orderController));

router.post('/', orderController.createOrder.bind(orderController));
router.get('/', orderController.getOrders.bind(orderController));
router.get('/:id', orderController.getOrder.bind(orderController));
router.post('/:id/cancel', orderController.cancelOrder.bind(orderController));
router.post('/:id/request-return', orderController.requestReturn.bind(orderController));
router.post('/:id/reviews', orderController.createOrderReview.bind(orderController));
router.get('/:id/tracking', orderController.getOrderTracking.bind(orderController)); // Lịch sử tracking

// Upload payment proof for PREPAID orders
router.post('/:id/upload-payment-proof', 
    uploadPaymentProof.single('payment_proof'), 
    handlePaymentProofUploadError, 
    orderController.uploadPaymentProof.bind(orderController)
);

module.exports = router;
