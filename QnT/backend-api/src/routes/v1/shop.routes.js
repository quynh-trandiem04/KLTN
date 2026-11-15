const express = require('express');
const router = express.Router();
const shopController = require('../../controllers/shopController');

router.get('/categories', (req, res) => shopController.getCategories(req, res));
router.get('/brands', (req, res) => shopController.getBrands(req, res));
router.get('/colors', (req, res) => shopController.getColors(req, res));
router.get('/products', (req, res) => shopController.getProducts(req, res));
router.get('/products/:id', (req, res) => shopController.getProduct(req, res));

module.exports = router;
