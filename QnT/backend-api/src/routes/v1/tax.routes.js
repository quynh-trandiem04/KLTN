// backend-api/src/routes/v1/tax.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const taxController = require('../../controllers/taxController');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const { getGuestTokenForTax } = require('../../controllers/supersetController');

// Multer config: 5MB max, accept PDF/images only
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file PDF, JPG, PNG (tối đa 5MB)'));
        }
    }
});

// ─── PUBLIC ENDPOINTS ──────────────────────────────────────────────────────────

/**
 * Public: Submit tax registration application (multipart/form-data)
 * POST /api/v1/tax/register
 */
router.post('/register', upload.single('business_license_file'), taxController.submitTaxRegistration);

/**
 * Public: Check if tax code exists in registry
 * GET /api/v1/tax/check?tax_code=0309532909
 */
router.get('/check', taxController.checkTaxCode);

/**
 * Public: Lookup tax registration application status
 * GET /api/v1/tax/lookup?tax_code=xxx&business_name=xxx
 */
router.get('/lookup', taxController.lookupRegistration);

// ─── TAX REGISTRATIONS (TaxOrg) ───────────────────────────────────────────────

/**
 * TaxOrg: Get all tax registration applications
 * GET /api/v1/tax/registrations?status=PENDING
 */
router.get(
    '/registrations',
    verifyToken,
    checkRole(['TAX_ORG', 'ADMIN']),
    taxController.getTaxRegistrations
);

/**
 * TaxOrg: Get single tax registration application
 * GET /api/v1/tax/registrations/:id
 */
router.get(
    '/registrations/:id',
    verifyToken,
    checkRole(['TAX_ORG', 'ADMIN']),
    taxController.getRegistration
);

/**
 * TaxOrg: Approve tax registration → adds to tax_registry
 * POST /api/v1/tax/registrations/approve/:id
 */
router.post(
    '/registrations/approve/:id',
    verifyToken,
    checkRole(['TAX_ORG']),
    taxController.approveTaxRegistration
);

/**
 * TaxOrg: Reject tax registration
 * POST /api/v1/tax/registrations/reject/:id
 * Body: { reason: string }
 */
router.post(
    '/registrations/reject/:id',
    verifyToken,
    checkRole(['TAX_ORG']),
    taxController.rejectTaxRegistration
);

// ─── TAX REGISTRY (TaxOrg) ────────────────────────────────────────────────────

/**
 * TaxOrg: Get all tax registry entries
 * GET /api/v1/tax/registry?status=ACTIVE
 */
router.get(
    '/registry',
    verifyToken,
    checkRole(['TAX_ORG', 'ADMIN']),
    taxController.getTaxRegistry
);

/**
 * TaxOrg: Update tax registry entry status
 * PATCH /api/v1/tax/registry/:tax_code
 * Body: { status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' }
 */
router.patch(
    '/registry/:tax_code',
    verifyToken,
    checkRole(['TAX_ORG']),
    taxController.updateRegistryStatus
);

// ─── TAX DECLARATIONS ─────────────────────────────────────────────────────────

/**
 * Seller: Submit a tax declaration for a month
 * POST /api/v1/tax/declarations
 * Body: { seller_tax_code, period_month, declared_revenue, declared_tax_amount, note }
 */
router.post('/declarations', taxController.submitDeclaration);

/**
 * Seller: Get own declarations
 * GET /api/v1/tax/declarations/my?tax_code=xxx
 */
router.get('/declarations/my', taxController.getMyDeclarations);

/**
 * TaxOrg: Get declaration statistics
 * GET /api/v1/tax/declarations/stats?period_month=2026-05
 */
router.get(
    '/declarations/stats',
    verifyToken,
    checkRole(['TAX_ORG', 'ADMIN']),
    taxController.getDeclarationStats
);

/**
 * TaxOrg: Get under-declared declarations
 * GET /api/v1/tax/declarations/under-declared?period_month=2026-05
 */
router.get(
    '/declarations/under-declared',
    verifyToken,
    checkRole(['TAX_ORG', 'ADMIN']),
    taxController.getUnderDeclaredDeclarations
);

/**
 * TaxOrg: Auto-review all SUBMITTED declarations
 * POST /api/v1/tax/declarations/auto-review
 * Body (optional): { period_month: '2026-05' }
 */
router.post(
    '/declarations/auto-review',
    verifyToken,
    checkRole(['TAX_ORG']),
    taxController.autoReviewDeclarations
);

/**
 * TaxOrg: Get all declarations (with filters)
 * GET /api/v1/tax/declarations?status=SUBMITTED&period_month=2026-05
 */
router.get(
    '/declarations',
    verifyToken,
    checkRole(['TAX_ORG', 'ADMIN']),
    taxController.getAllDeclarations
);

/**
 * TaxOrg: Review a single declaration (auto-logic)
 * POST /api/v1/tax/declarations/:id/review
 * Body: { note?: string }
 */
router.post(
    '/declarations/:id/review',
    verifyToken,
    checkRole(['TAX_ORG']),
    taxController.reviewDeclaration
);

/**
 * Seller/TaxOrg: Get single declaration detail
 * GET /api/v1/tax/declarations/:id
 */
router.get(
    '/declarations/:id',
    verifyToken,
    checkRole(['TAX_ORG', 'ADMIN']),
    taxController.getDeclaration
);

// ─── TAX PAYMENTS ─────────────────────────────────────────────────────────────

/**
 * TaxOrg: Record a tax payment
 * POST /api/v1/tax/payments
 * Body: { seller_tax_code, period_month, amount_paid, payment_method, payment_reference }
 */
router.post(
    '/payments',
    verifyToken,
    checkRole(['TAX_ORG']),
    taxController.recordPayment
);

/**
 * TaxOrg: Get all tax payments
 * GET /api/v1/tax/payments?seller_tax_code=xxx&period_month=2026-05
 */
router.get(
    '/payments',
    verifyToken,
    checkRole(['TAX_ORG', 'ADMIN']),
    taxController.getAllPayments
);

// ─── SUPERSET EMBEDDED DASHBOARD ─────────────────────────────────────────────

/**
 * TaxOrg: Get Superset guest token for embedded Tax dashboard
 * GET /api/v1/tax/superset/guest-token
 */
router.get(
    '/superset/guest-token',
    verifyToken,
    checkRole(['TAX_ORG', 'ADMIN']),
    getGuestTokenForTax
);

module.exports = router;
