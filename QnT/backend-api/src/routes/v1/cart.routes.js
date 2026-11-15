const express = require('express');
const router = express.Router();
const cartController = require('../../controllers/cartController');
const verifyToken = require('../../middlewares/verifyToken');

// Tất cả route cart đều yêu cầu đăng nhập
router.use(verifyToken);

router.get('/', cartController.getCart);
router.get('/count', cartController.getCartCount);
router.post('/', cartController.addToCart);
router.put('/:id', cartController.updateCartItem);
router.delete('/:id', cartController.removeCartItem);

module.exports = router;
