// backend-api\src\app.js

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const adminController = require('./controllers/adminController');
const { startOutboxWorker, manualProcess } = require('./workers/outboxWorker');

require('dotenv').config();

require('./config/supabase');
require('./config/minio');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'Backend API running', 
        version: '1.1.0',
        endpoints: {
            auth: '/api/v1/auth/*',
            health: '/api/health',
            outbox: '/api/system/outbox/process'
        }
    });
});

// Blockchain adapter health check
app.get('/api/health-check-chain', async (req, res) => {
    try {
        const response = await axios.get(`${process.env.BLOCKCHAIN_ADAPTER_URL}/`);
        res.json({ 
            status: 'OK', 
            backend: 'Running', 
            adapter_connection: response.data
        });
    } catch (error) {
        // Return 200 with warning instead of 500
        res.json({ 
            status: 'WARNING', 
            backend: 'Running',
            adapter_connection: 'Disconnected - Blockchain Adapter not running'
        });
    }
});

// Simple health check (no dependencies)
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', backend: 'Running', timestamp: new Date() });
});

// ─── SYSTEM ENDPOINTS (Outbox & Reconciliation) ─────────────────
// Manual trigger: outbox processing
app.post('/api/system/outbox/process', async (req, res) => {
    try {
        const result = await manualProcess();
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});


// ─── CLEANUP: Xóa đơn mồ côi ──────────────────────────────────────────
// GET  /api/system/cleanup                        → Dry run
// GET  /api/system/cleanup?mode=fast              → Dry run (dùng sync_status)
// POST /api/system/cleanup?confirm=true           → Xóa (check blockchain)
// POST /api/system/cleanup?confirm=true&mode=fast → Xóa (tin sync_status)
// POST /api/system/cleanup?confirm=true&keep=ORD-xxx,ORD-yyy → Giữ lại đơn cụ thể, xóa hết còn lại
// POST /api/system/cleanup?confirm=true&deleteAll=true       → Xóa TẤT CẢ đơn mồ côi/không keep
// POST /api/system/cleanup?confirm=true&truncateAll=true     → NÚT NUCLEAR RESET (Xóa sạch DB liên quan order và reset ID về 1)
app.all('/api/system/cleanup', async (req, res) => {
    const confirm = req.query.confirm === 'true';
    const fastMode = req.query.mode === 'fast';
    const keepIds = req.query.keep ? req.query.keep.split(',').map(s => s.trim()) : null;
    const deleteAll = req.query.deleteAll === 'true';
    const truncateAll = req.query.truncateAll === 'true';
    const pool = require('./config/database');

    const client = await pool.connect();
    try {
        if (confirm && truncateAll) {
            await client.query('BEGIN');
            
            await client.query('TRUNCATE TABLE blockchain_outbox RESTART IDENTITY CASCADE').catch(() => {});
            await client.query('TRUNCATE TABLE orders RESTART IDENTITY CASCADE').catch(() => {});
            
            await client.query('COMMIT');

            // Xóa MinIO lakehouse private data
            let minioCleanup = { private: 'skipped', structured: 'skipped' };
            try {
                const { minioClient } = require('./config/minio');
                const bucket = process.env.MINIO_BUCKET || 'ecommerce-lakehouse';

                const deleteMinioFolder = async (prefix) => {
                    return new Promise((resolve, reject) => {
                        const objects = [];
                        const stream = minioClient.listObjectsV2(bucket, prefix, true);
                        stream.on('data', obj => objects.push(obj.name));
                        stream.on('error', reject);
                        stream.on('end', async () => {
                            if (objects.length > 0) {
                                await minioClient.removeObjects(bucket, objects);
                            }
                            resolve(objects.length);
                        });
                    });
                };

                const privateCount = await deleteMinioFolder('private/');
                const structuredCount = await deleteMinioFolder('structured/');
                minioCleanup = { private: `${privateCount} files deleted`, structured: `${structuredCount} files deleted` };
            } catch (minioErr) {
                minioCleanup = { error: minioErr.message };
            }
            
            console.log(`[Cleanup] ĐÃ CHẠY NUCLEAR RESET: DB + MinIO!`);
            return res.json({ 
                success: true, 
                message: 'Đã dọn sạch DB (orders, outbox) + MinIO (private, structured)',
                minio_cleanup: minioCleanup
            });
        }
        // =====================================================================

        const dbOrders = await client.query(
            `SELECT id, status, blockchain_sync_status, created_at FROM orders ORDER BY created_at DESC`
        );

        if (dbOrders.rows.length === 0) {
            return res.json({ success: true, message: 'Không có đơn hàng nào trong DB' });
        }

        let orphans = [];
        let synced = [];
        let errors = [];

        if (keepIds || deleteAll) {
            // ═══ KEEP/DELETE ALL MODE: Không cần adapter ═══
            for (const order of dbOrders.rows) {
                if (deleteAll || !keepIds.includes(order.id)) {
                    orphans.push({ id: order.id, status: order.status, created_at: order.created_at });
                } else {
                    synced.push(order.id);
                }
            }
        } else if (fastMode) {
            // ═══ FAST MODE: Dùng blockchain_sync_status, không cần adapter ═══
            for (const order of dbOrders.rows) {
                if (order.blockchain_sync_status === 'SYNCED') {
                    synced.push(order.id);
                } else {
                    // NULL, PENDING, NOT_ON_CHAIN, FAILED → orphan
                    orphans.push({ id: order.id, status: order.status, sync_status: order.blockchain_sync_status || 'NULL', created_at: order.created_at });
                }
            }
        } else {
            // ═══ FULL MODE: Check từng đơn với blockchain adapter ═══
            const adapterAxios = require('axios');
            const ADAPTER_URL = process.env.BLOCKCHAIN_ADAPTER_URL || 'http://localhost:3000/api';

            // Check adapter có chạy không
            try {
                await adapterAxios.get(`${ADAPTER_URL}/`, { timeout: 3000 });
            } catch {
                return res.status(503).json({
                    success: false,
                    error: 'Blockchain Adapter không chạy. Dùng ?mode=fast để check bằng sync_status thay vì gọi blockchain.'
                });
            }

            for (const order of dbOrders.rows) {
                try {
                    const chainRes = await adapterAxios.get(`${ADAPTER_URL}/query-order`, {
                        params: { orderID: order.id, requestorOrg: 'platform', requestorUser: 'admin-ca-platform' },
                        timeout: 5000
                    });
                    if (chainRes.data?.success && chainRes.data?.data?.publicData) {
                        synced.push(order.id);
                    } else {
                        orphans.push({ id: order.id, status: order.status, created_at: order.created_at });
                    }
                } catch (err) {
                    const msg = err.response?.data?.error || err.message || '';
                    if (msg.includes('does not exist') || msg.includes('not found')) {
                        orphans.push({ id: order.id, status: order.status, created_at: order.created_at });
                    } else {
                        errors.push({ id: order.id, error: msg });
                    }
                }
            }
        }

        // Xóa nếu confirm
        if (confirm && orphans.length > 0) {
            const orphanIds = orphans.map(o => o.id);
            await client.query('BEGIN');

            // Tự động tìm TẤT CẢ bảng tham chiếu đến orders và xóa
            const fkQuery = await client.query(`
                SELECT tc.table_name, kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'orders'
            `);

            for (const fk of fkQuery.rows) {
                await client.query(`DELETE FROM ${fk.table_name} WHERE ${fk.column_name} = ANY($1)`, [orphanIds])
                    .catch(e => console.warn(`[Cleanup] Skip ${fk.table_name}: ${e.message}`));
            }

            await client.query(`DELETE FROM blockchain_outbox WHERE order_id = ANY($1)`, [orphanIds]).catch(()=>{});

            const orderDel = await client.query(`DELETE FROM orders WHERE id = ANY($1)`, [orphanIds]);
            await client.query('COMMIT');

            console.log(`[Cleanup] ✅ Đã xóa ${orderDel.rowCount} đơn mồ côi và dữ liệu liên quan`);
            return res.json({
                success: true, action: 'DELETED',
                deleted_orders: orderDel.rowCount,
                deleted_ids: orphanIds, remaining_synced: synced.length
            });
        }

        // Dry run
        res.json({
            success: true, action: 'DRY_RUN', mode: fastMode ? 'fast' : 'full',
            message: 'Dùng POST ?confirm=true để xóa đơn mồ côi, hoặc ?confirm=true&truncateAll=true để xóa sạch DB',
            total_in_db: dbOrders.rows.length,
            synced_with_blockchain: synced.length,
            orphans_db_only: orphans,
            errors
        });

    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ success: false, error: e.message });
    } finally {
        client.release();
    }
});

// Mount API routes
const apiRoutes = require('./routes');
app.use('/api', apiRoutes);

app.listen(PORT, async() => {
    console.log(`Backend API running on port ${PORT}`);
    console.log(`API v1 endpoints: http://localhost:${PORT}/api/v1/*`);
    console.log(`Auth: http://localhost:${PORT}/api/v1/auth/*`);
    console.log(`Cleanup tool: http://localhost:${PORT}/api/system/cleanup`);

    try {
        await adminController.autoSyncIdentities();
    } catch (err) {
        console.error(' Lỗi khi chạy tự động đồng bộ Identity:', err.message);
    }

    // Khởi động Outbox Worker (poll mỗi 10s)
    startOutboxWorker();
});

