require('dotenv').config({ path: './.env' });
const { Pool } = require('pg');

const p = new Pool({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT,
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD
});

(async () => {
  try {
    const r1 = await p.query(`
      SELECT COUNT(DISTINCT order_id) AS synced_orders
      FROM blockchain_outbox
      WHERE status = 'SYNCED'
        AND action = 'CREATE_ORDER'
    `);

    console.log('\nSố đơn đã CREATE_ORDER SYNCED:');
    console.table(r1.rows);

    const r2 = await p.query(`
      SELECT status,
             COUNT(*) AS actions,
             COUNT(DISTINCT order_id) AS orders
      FROM blockchain_outbox
      GROUP BY status
      ORDER BY status
    `);

    console.log('\nTổng hợp outbox:');
    console.table(r2.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await p.end();
  }
})();
