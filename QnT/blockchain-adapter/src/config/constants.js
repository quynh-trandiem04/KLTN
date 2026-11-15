// blockchain-adapter/src/config/constants.js

require('dotenv').config();

const VM_IP = '192.168.147.11';

const VAULT_CONFIG = {
    ENDPOINT: `http://${VM_IP}:8200`,
    TOKEN: process.env.VAULT_TOKEN || 'YOUR_VAULT_TOKEN'
};
console.log('>>> VM_IP đang dùng:', VM_IP);
const MINIO_CONFIG = {
    ENDPOINT: VM_IP,
    PORT: 9000,
    ACCESS_KEY: 'admin',
    SECRET_KEY: 'password123',
    BUCKET_NAME: 'ecommerce-lakehouse'
};

const ORG_CONSTANTS = {
    SELLER: {
        ROLE: 'SELLER',
        MSP_ID: 'SellerOrgMSP',
        CA_PORT: 8054,
        CA_NAME: 'ca-org2',
        ADMIN_NAME: 'admin-ca-seller',
        VAULT_ORG: 'seller'
    },
    SHIPPER: {
        ROLE: 'SHIPPER',
        MSP_ID: 'ShipperOrgMSP',
        CA_PORT: 11054,
        CA_NAME: 'ca-org3',
        ADMIN_NAME: 'admin-ca-shipper',
        VAULT_ORG: 'shipper'
    },
    ADMIN: {
        ROLE: 'ADMIN',
        MSP_ID: 'ECommercePlatformOrgMSP',
        CA_PORT: 7054,
        CA_NAME: 'ca-org1',
        ADMIN_NAME: 'admin-ca-platform',
        VAULT_ORG: 'platform'
    },
    CUSTOMER: {
        ROLE: 'CUSTOMER',
        MSP_ID: 'ECommercePlatformOrgMSP',
        CA_PORT: 7054,
        CA_NAME: 'ca-org1',
        ADMIN_NAME: 'admin-ca-platform',
        VAULT_ORG: 'platform'
    },
    TAX: {
        ROLE: 'TAX',
        MSP_ID: 'TaxOrgMSP',
        CA_PORT: 13054,
        CA_NAME: 'ca-tax',
        ADMIN_NAME: 'admin-ca-tax',
        VAULT_ORG: 'tax'
    }
};

module.exports = {
    VM_IP,
    VAULT_CONFIG,
    MINIO_CONFIG,
    ORG_CONSTANTS
};
