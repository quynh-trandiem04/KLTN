const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');
const p = new Pool({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
});

async function check() {
    const r = await p.query(`
        SELECT id, order_id, action, status, retry_count, ip,
               SUBSTRING(last_error, 1, 60) AS error_preview,
               created_at, synced_at
        FROM blockchain_outbox 
        ORDER BY id DESC LIMIT 15
    `);
    console.table(r.rows);

    const summary = await p.query(`
        SELECT status, COUNT(*) AS count 
        FROM blockchain_outbox 
        GROUP BY status
    `);
    console.log('\nTổng hợp:');
    console.table(summary.rows);

    await p.end();
}
check().catch(e => { console.error(e.message); p.end(); });
