// backend-api/src/routes/v1/wishlist.routes.js
const express = require('express');
const router = express.Router();
const wishlistController = require('../../controllers/wishlistController');
const verifyToken = require('../../middlewares/verifyToken');

// All wishlist routes require authentication
const auth = [verifyToken];

// Get wishlist with pagination
router.get('/', ...auth, wishlistController.getWishlist.bind(wishlistController));

// Get wishlist count
router.get('/count', ...auth, wishlistController.getWishlistCount.bind(wishlistController));

// Check if product is favorited
router.get('/check/:productId', ...auth, wishlistController.checkFavorited.bind(wishlistController));

// Add to wishlist
router.post('/', ...auth, wishlistController.addToWishlist.bind(wishlistController));

// Toggle wishlist (add/remove)
router.post('/toggle/:productId', ...auth, wishlistController.toggleWishlist.bind(wishlistController));

// Remove from wishlist by wishlist ID
router.delete('/:id', ...auth, wishlistController.removeFromWishlist.bind(wishlistController));

// Remove from wishlist by product ID
router.delete('/product/:productId', ...auth, wishlistController.removeByProductId.bind(wishlistController));

module.exports = router;
