// backend-api\src\config\postgres.js

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT,
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    max: 20,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DATABASE_HOST?.includes('supabase') || process.env.DATABASE_HOST?.includes('pooler') 
        ? { rejectUnauthorized: false } 
        : false,
});

// Test connection
pool.on('connect', () => {
    console.log(' Connected to PostgreSQL database:', process.env.DATABASE_NAME);
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

module.exports = pool;
