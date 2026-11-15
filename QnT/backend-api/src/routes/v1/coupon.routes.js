const express = require('express');
const router = express.Router();
const couponController = require('../../controllers/couponController');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');

const adminOrSeller = [verifyToken, checkRole(['ADMIN', 'STORE_OWNER'])];

// Public: validate coupon (need auth for user context)
router.post('/validate', verifyToken, couponController.validateCoupon.bind(couponController));

// CRUD — admin or seller
router.get('/', verifyToken, couponController.getCoupons.bind(couponController));
router.post('/', ...adminOrSeller, couponController.createCoupon.bind(couponController));
router.put('/:id', ...adminOrSeller, couponController.updateCoupon.bind(couponController));
router.delete('/:id', ...adminOrSeller, couponController.deleteCoupon.bind(couponController));

module.exports = router;
