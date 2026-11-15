// backend-api\src\config\postgres.js

const { Pool } = require('pg');
require('dotenv').config();

const fs = require('fs');
const path = require('path');

let MY_VM_IP = '127.0.0.1';
try {
    const adapterConstantsPath = path.resolve(__dirname, '../../../blockchain-adapter/src/config/constants.js');
    const adapterContent = fs.readFileSync(adapterConstantsPath, 'utf8');
    const match = adapterContent.match(/const\s+VM_IP\s*=\s*['"]([^'"]+)['"]/);
    if (match) MY_VM_IP = match[1];
} catch (e) {
    console.error('Cannot read VM_IP', e);
}

const pool = new Pool({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    ssl: { rejectUnauthorized: false },
});

// Intercept queries to automatically add the `ip` column for blockchain_outbox inserts
const originalQuery = pool.query;
pool.query = async function(text, params, ...args) {
    if (typeof text === 'string' && text.includes('INSERT INTO blockchain_outbox')) {
        // Handle pattern: (order_id, action, payload) VALUES ($1, $2, $3)
        if (text.includes('(order_id, action, payload)') && text.includes('VALUES ($1, $2, $3)')) {
            text = text.replace('(order_id, action, payload)', '(order_id, action, payload, ip)');
            text = text.replace('VALUES ($1, $2, $3)', 'VALUES ($1, $2, $3, $4)');
            params = [...params, MY_VM_IP];
        } 
        // Handle pattern: (order_id, action, payload, status) VALUES ($1, $2, $3, 'PENDING')
        else if (text.includes('(order_id, action, payload, status)') && text.includes("VALUES ($1, $2, $3, 'PENDING')")) {
            text = text.replace('(order_id, action, payload, status)', '(order_id, action, payload, status, ip)');
            text = text.replace("VALUES ($1, $2, $3, 'PENDING')", "VALUES ($1, $2, $3, 'PENDING', $4)");
            params = [...params, MY_VM_IP];
        }
    }
    return originalQuery.apply(this, [text, params, ...args]);
};

// Test connection
pool.on('connect', () => {
    console.log(' Connected to PostgreSQL database:', process.env.DATABASE_NAME);
});

pool.on('error', (err) => {
    console.error(' Unexpected error on idle client', err);
});

module.exports = pool;
