// backend-api/src/config/constants.js

/**
 * Role constants
 */
const ROLES = {
    CUSTOMER: 'CUSTOMER',
    STORE_OWNER: 'STORE_OWNER',
    SHIPPER: 'SHIPPER',
    ADMIN: 'ADMIN',
    AUDITOR: 'AUDITOR',
    MARKETING: 'MARKETING',
    SUPPORT: 'SUPPORT',
    TAX_ORG: 'TAX_ORG'
};

/**
 * Role mapping - auto-assign roles based on registration endpoint
 */
const ROLE_MAPPING = {
    [ROLES.CUSTOMER]: [ROLES.CUSTOMER],
    [ROLES.STORE_OWNER]: [ROLES.CUSTOMER, ROLES.STORE_OWNER],
    [ROLES.SHIPPER]: [ROLES.SHIPPER],
    [ROLES.ADMIN]: [ROLES.ADMIN, ROLES.CUSTOMER],
    [ROLES.TAX_ORG]: [ROLES.TAX_ORG]
};

/**
 * Seller application status flow:
 * PENDING → APPROVED → TAX_VERIFYING → VERIFIED (can issue VAT invoices)
 * PENDING → REJECTED
 * TAX_VERIFYING → INVALID
 */
const SELLER_APPLICATION_STATUS = {
    PENDING: 'PENDING',
    REVIEWING: 'REVIEWING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    TAX_VERIFYING: 'TAX_VERIFYING',
    VERIFIED: 'VERIFIED',
    INVALID: 'INVALID'
};

/**
 * Account status
 */
const ACCOUNT_STATUS = {
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
    DELETED: 'DELETED'
};

/**
 * Order status
 */
const ORDER_STATUS = {
    PENDING: 'PENDING',
    CONFIRMED: 'CONFIRMED',
    PROCESSING: 'PROCESSING',
    SHIPPING: 'SHIPPING',
    DELIVERED: 'DELIVERED',
    CANCELLED: 'CANCELLED',
    RETURN: 'RETURN'
};

/**
 * Payment status
 */
const PAYMENT_STATUS = {
    PENDING: 'PENDING',
    PAID: 'PAID',
    FAILED: 'FAILED',
    RETURN: 'RETURN'
};

const BLOCKCHAIN_ADAPTER_URL = process.env.BLOCKCHAIN_ADAPTER_URL || 'http://localhost:3000/api';

module.exports = {
    ROLES,
    ROLE_MAPPING,
    ACCOUNT_STATUS,
    ORDER_STATUS,
    PAYMENT_STATUS,
    BLOCKCHAIN_ADAPTER_URL
};
