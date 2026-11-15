// backend-api/src/routes/v1/auth.routes.js
const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const verifyAdminSecret = require('../../middlewares/verifyAdminSecret');

/**
 * @route POST /api/v1/auth/register
 * @desc Register new customer
 * @access Public
 */
router.post('/register', authController.registerCustomer.bind(authController));
router.post('/customer/register', authController.registerCustomer.bind(authController));

/**
 * @route POST /api/v1/auth/store/register
 * @desc Register new store owner
 * @access Public (should add approval workflow in production)
 */
router.post('/store/register', authController.registerStoreOwner.bind(authController));
router.post('/seller/register', authController.registerStoreOwner.bind(authController));



/**
 * @route POST /api/v1/auth/admin/register
 * @desc Register new admin (PROTECTED)
 * @access Protected (requires X-Admin-Secret header)
 */
router.post('/shipper/register', authController.registerShipper.bind(authController));
router.post('/shipper/login', authController.shipperLogin.bind(authController));


/**
 * @route POST /api/v1/auth/admin/login
 * @desc Login for admin users (verifies ADMIN role after authentication)
 * @access Public
 */
router.post('/admin/login', authController.adminLogin.bind(authController));

/**
 * @route POST /api/v1/auth/seller/login
 * @desc Login for seller users (verifies STORE_OWNER role)
 * @access Public
 */
router.post('/seller/login', authController.sellerLogin.bind(authController));

/**
 * @route POST /api/v1/auth/tax/login
 * @desc Login for TaxOrg users (verifies TAX_ORG role)
 * @access Public
 */
router.post('/tax/login', authController.taxOrgLogin.bind(authController));

/**
 * @route POST /api/v1/auth/login
 * @desc Login for all user types
 * @access Public
 */
router.post('/login', authController.login.bind(authController));

/**
 * @route POST /api/v1/auth/logout
 * @desc Logout user - delete session
 * @access Public
 */
router.post('/logout', authController.logout.bind(authController));

/**
 * @route GET /api/v1/auth/seller/check-rejection
 * @desc Check if seller application was rejected
 * @query email - seller email
 * @access Public
 */
router.get('/seller/check-rejection', authController.checkSellerRejection.bind(authController));

module.exports = router;
