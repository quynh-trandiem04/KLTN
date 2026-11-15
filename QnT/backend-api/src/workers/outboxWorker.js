// backend-api/src/workers/outboxWorker.js
// Outbox Pattern Worker — xử lý đồng bộ blockchain bất đồng bộ
// Chạy cùng process backend, dùng setInterval

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const axios = require('axios');
const { BLOCKCHAIN_ADAPTER_URL } = require('../config/constants');

// Lấy VM_IP từ blockchain-adapter/src/config/constants.js
let MY_VM_IP = '127.0.0.1';
try {
    const adapterConstantsPath = path.resolve(__dirname, '../../../blockchain-adapter/src/config/constants.js');
    const adapterContent = fs.readFileSync(adapterConstantsPath, 'utf8');
    const match = adapterContent.match(/const\s+VM_IP\s*=\s*['"]([^'"]+)['"]/);
    if (match) MY_VM_IP = match[1];
} catch (e) {
    console.error('Cannot read VM_IP', e);
}

// Mapping action → blockchain adapter endpoint + HTTP method
const ACTION_ENDPOINT_MAP = {
    'CREATE_ORDER': { method: 'POST', path: '/create-order' },
    'CANCEL_ORDER': { method: 'POST', path: '/cancel-order' },
    'CONFIRM_PAYMENT': { method: 'POST', path: '/confirm-payment' },
    'REQUEST_RETURN': { method: 'POST', path: '/request-return' },
    'SHIP_ORDER': { method: 'POST', path: '/ship-order' },
    'CONFIRM_DELIVERY': { method: 'POST', path: '/confirm-delivery' },
    'CONFIRM_COD_DELIVERY': { method: 'POST', path: '/confirm-cod-delivery' },
    'REMIT_COD': { method: 'POST', path: '/remit-cod' },
    'PAYOUT': { method: 'POST', path: '/payout' },
    'SHIP_RETURN': { method: 'POST', path: '/ship-return' },
    'CONFIRM_RETURN_RECEIVED': { method: 'POST', path: '/confirm-return-received' },
};

// Mapping Outbox Action -> Blockchain History Action
const DB_ACTION_TO_CHAIN_ACTION = {
    'CREATE_ORDER': 'CreateOrder',
    'CANCEL_ORDER': 'CancelOrder',
    'CONFIRM_PAYMENT': 'ConfirmPayment',
    'REQUEST_RETURN': 'RequestReturn',
    'SHIP_ORDER': 'ShipOrder',
    'CONFIRM_DELIVERY': 'ConfirmDelivery',
    'CONFIRM_COD_DELIVERY': 'ConfirmCODDelivery',
    'REMIT_COD': 'RemitCOD',
    'PAYOUT': 'Payout',
    'SHIP_RETURN': 'ShipReturn',
    'CONFIRM_RETURN_RECEIVED': 'ConfirmReturnReceived',
};

// Phân cấp mức độ của trạng thái (để biết trạng thái nào đi sau trạng thái nào)
const STATUS_LEVEL = {
    'CREATED': 0,
    'PAID': 1,
    'CANCELLED': 1.5,
    'SHIPPED': 2,
    'DELIVERED': 3,
    'SETTLED': 4,
    'RETURN_REQUESTED': 5,
    'RETURN_SHIPPED': 6,
    'RETURN_COMPLETED': 7
};

// Mức trạng thái mà action đó ĐẠT ĐƯỢC (post-state)
const ACTION_POST_STATE = {
    'CREATE_ORDER': 0,
    'CONFIRM_PAYMENT': 1,
    'CANCEL_ORDER': 1.5,
    'SHIP_ORDER': 2,
    'CONFIRM_DELIVERY': 3,
    'CONFIRM_COD_DELIVERY': 3,
    'REMIT_COD': 3,
    'PAYOUT': 4,
    'REQUEST_RETURN': 5,
    'SHIP_RETURN': 6,
    'CONFIRM_RETURN_RECEIVED': 7
};

// ═══════════════════════════════════════════════════════════════════
// LỖI PERMANENT — không bao giờ thành công dù retry bao nhiêu lần
// ═══════════════════════════════════════════════════════════════════
const PERMANENT_ERROR_PATTERNS = [
    'does not exist',                    // Order không tồn tại trên ledger
    'already exists',                    // Đã tạo rồi (CREATE_ORDER duplicate)
    'không có quyền',                    // Sai quyền MSP
    'LỖI QUYỀN',                        // Sai org
    'phải ở trạng thái',                // Status mismatch — order đã chuyển trạng thái khác
    'chỉ đơn hàng',                     // Sai payment method (VD: COD gọi ConfirmPayment)
    'chỉ có thể',                       // Logic constraint
    'thuế GTGT không khớp',            // Tax mismatch
];

/**
 * Kiểm tra lỗi có phải permanent (không retry được) không
 */
function isPermanentError(errorMsg) {
    if (!errorMsg) return false;
    const lowerMsg = errorMsg.toLowerCase();

    // Ngoại lệ: Nếu lỗi báo trạng thái hiện tại là SETTLED, ta không coi là permanent để cho phép retry
    if (lowerMsg.includes('hiện tại: settled')) {
        return false;
    }

    return PERMANENT_ERROR_PATTERNS.some(pattern => lowerMsg.includes(pattern.toLowerCase()));
}

// ═══════════════════════════════════════════════════════════════════
// CẤU HÌNH
// ═══════════════════════════════════════════════════════════════════
const POLL_INTERVAL_MS = 1_000;        // Poll mỗi 1 giây (để tăng tốc)
const BATCH_SIZE = 200;                // Xử lý 200 task mỗi lần (Tối ưu cho máy 8GB RAM)
const RETRY_DELAY_MS = 5 * 60 * 1000;  // 5 phút giữa mỗi lần retry
const RETRY_DELAY_SECONDS = Math.floor(RETRY_DELAY_MS / 1000);
const DEFAULT_MAX_RETRIES = 5;          // Tối đa 5 lần retry

let isProcessing = false;

/**
 * Xử lý 1 batch outbox tasks
 */
async function processOutbox() {
    // ── Guard: tránh chạy song song ──
    if (isProcessing) return;
    isProcessing = true;

    let client = null;
    try {
        client = await pool.connect();

        // Lấy tasks: Lấy DUY NHẤT task chưa hoàn thành đầu tiên của mỗi order
        //   - PENDING:    task mới, chưa xử lý
        //   - FAILED:     task lỗi transient, đã chờ đủ 5 phút
        //   - PROCESSING: task bị kẹt (server crash giữa chừng, > 2 phút)
        const pendingRes = await client.query(
            `WITH NextTasks AS (
                 SELECT id, order_id, status, retry_count, processed_at,
                        ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY id ASC) as rn
                 FROM blockchain_outbox
                 WHERE status NOT IN ('SYNCED', 'SKIPPED')
             )
             SELECT b.* 
             FROM blockchain_outbox b
             JOIN NextTasks nt ON b.id = nt.id
             WHERE nt.rn = 1
               AND (
                   (b.status = 'PENDING' AND (b.processed_at IS NULL OR b.processed_at < NOW() - INTERVAL '300 seconds'))
                   OR (b.status = 'FAILED' AND b.retry_count < b.max_retries AND b.processed_at < NOW() - INTERVAL '${RETRY_DELAY_SECONDS} seconds')
                   OR (b.status = 'PROCESSING' AND b.processed_at < NOW() - INTERVAL '120 seconds')
               )
               AND (b.ip = $2 OR b.ip IS NULL)
             ORDER BY b.created_at ASC 
             LIMIT $1`,
            [BATCH_SIZE, MY_VM_IP]
        );

        if (pendingRes.rows.length === 0) {
            return; // Không có gì để xử lý
        }

        console.log(`\n[Outbox Worker] Đang xử lý ${pendingRes.rows.length} task(s)...`);

        // Nhóm các task theo order_id để tránh conflict (xử lý tuần tự cho cùng 1 order, nhưng song song các order khác nhau)
        const tasksByOrder = {};
        for (const task of pendingRes.rows) {
            const key = task.order_id || `no_order_${task.id}`;
            if (!tasksByOrder[key]) tasksByOrder[key] = [];
            tasksByOrder[key].push(task);
        }

        // Xử lý song song các nhóm nhưng giới hạn concurrency để tránh sập mạng (DDoS Fabric Node)
        const CONCURRENCY_LIMIT = 20; // Tăng gấp đôi cho máy ảo 8GB RAM
        const taskChains = Object.values(tasksByOrder);

        for (let i = 0; i < taskChains.length; i += CONCURRENCY_LIMIT) {
            const chunk = taskChains.slice(i, i + CONCURRENCY_LIMIT);
            await Promise.all(chunk.map(async (taskChain) => {
                for (const task of taskChain) {
                    const success = await processTask(client, task);
                    // Nếu 1 bước trong chuỗi của order này thất bại, ngừng xử lý các bước tiếp theo trong lần poll này
                    if (!success) break;
                }
            }));
        }

    } catch (err) {
        console.error('[Outbox Worker] Lỗi hệ thống:', err.message);
    } finally {
        // ── LUÔN reset flag + release client ──
        isProcessing = false;
        if (client) {
            try { client.release(); } catch (_) { }
        }
    }
}

/**
 * Xử lý 1 task outbox
 */
async function processTask(client, task) {
    const { id, order_id, action, payload, status } = task;
    const endpoint = ACTION_ENDPOINT_MAP[action];

    if (!endpoint) {
        console.error(`[Outbox Worker] Action không hợp lệ: ${action} (task #${id})`);
        await client.query(
            `UPDATE blockchain_outbox SET status = 'FAILED', last_error = $2, processed_at = NOW() WHERE id = $1`,
            [id, `Unknown action: ${action}`]
        );
        return false;
    }

    // Mark as PROCESSING
    await client.query(
        `UPDATE blockchain_outbox SET status = 'PROCESSING', processed_at = NOW() WHERE id = $1`,
        [id]
    );

    const url = `${BLOCKCHAIN_ADAPTER_URL}${endpoint.path}`;
    const payloadData = typeof payload === 'string' ? JSON.parse(payload) : payload;

    try {


        console.log(`  [Outbox #${id}] ${action} → ${endpoint.path} (Order: ${order_id})`);

        // --- BƯỚC MỚI: KIỂM TRA TRẠNG THÁI TRÊN BLOCKCHAIN TRƯỚC ---
        // (Chỉ kiểm tra nếu task đang retry - FAILED/PROCESSING - để tiết kiệm 50% thời gian cho task mới)
        if (status !== 'PENDING') {
            try {
                const queryUrl = `${BLOCKCHAIN_ADAPTER_URL}/query-order?orderID=${order_id}&requestorOrg=platform&requestorUser=admin-ca-platform`;
                const checkRes = await axios.get(queryUrl, { timeout: 30000 });
                if (checkRes.data.success && checkRes.data.data) {
                    const bcOrder = checkRes.data.data;
                    const chainAction = DB_ACTION_TO_CHAIN_ACTION[action];

                    // 1. Nếu lịch sử blockchain đã có action này -> Chắc chắn đã xong
                    let isAlreadyDone = bcOrder.history && bcOrder.history.some(h => h.action === chainAction);

                    // 2. Kiểm tra logic vượt cấp (Status nằm sau status cần update)
                    if (!isAlreadyDone) {
                        const currentLevel = STATUS_LEVEL[bcOrder.status] ?? -1;
                        const actionLevel = ACTION_POST_STATE[action] ?? 99;

                        // Nếu trạng thái hiện tại vượt qua đích đến của action này
                        if (currentLevel > actionLevel) {
                            isAlreadyDone = true;
                        }
                        // Nếu đơn đang bị hoàn trả (Return >= 5), các action thuộc luồng giao hàng (< 5) đều lỗi thời
                        if (currentLevel >= 5 && actionLevel < 5) {
                            isAlreadyDone = true;
                        }
                    }

                    if (isAlreadyDone) {
                        console.log(`  ✅ [Outbox #${id}] Tự động SYNCED (Action '${action}' đã bị vượt qua hoặc đã tồn tại trên Blockchain)`);
                        await client.query(
                            `UPDATE blockchain_outbox SET status = 'SYNCED', synced_at = NOW(), last_error = '[AUTO-RESOLVED] Obsolete or already on chain' WHERE id = $1`,
                            [id]
                        );
                        await client.query(
                            `UPDATE orders SET blockchain_sync_status = 'SYNCED' WHERE id = $1`,
                            [order_id]
                        ).catch(() => { });
                        return true;
                    }
                }
            } catch (checkErr) {
                if (checkErr.response?.status !== 404 && !checkErr.response?.data?.error?.includes('does not exist')) {
                    console.warn(`  ⚠️ [Outbox #${id}] Pre-check query warning: ${checkErr.message}`);
                }
            }
        }
        // -------------------------------------------------------------

        const response = await axios({
            method: endpoint.method,
            url: url,
            data: payloadData,
            timeout: 30_000
        });

        if (response.data.success) {
            // ✅ Đồng bộ thành công
            await client.query(
                `UPDATE blockchain_outbox 
                 SET status = 'SYNCED', synced_at = NOW(), last_error = NULL 
                 WHERE id = $1`,
                [id]
            );

            await client.query(
                `UPDATE orders SET blockchain_sync_status = 'SYNCED' WHERE id = $1`,
                [order_id]
            );

            if (response.data.txId) {
                await client.query(
                    `UPDATE orders SET tx_id = $1 WHERE id = $2`,
                    [response.data.txId, order_id]
                ).catch(() => { });
            }

            console.log(`  ✅ [Outbox #${id}] SYNCED! id: ${order_id || 'N/A'}`);
            return true;
        } else {
            throw new Error(response.data.error || response.data.message || 'Adapter trả về success=false');
        }

    } catch (err) {
        const errorMsg = err.response?.data?.error || err.message || 'Unknown error';

        // ═══════════════════════════════════════════════════════
        // PSEUDO-SUCCESS (Mục tiêu đã đạt được hoặc bị vượt qua) -> SYNCED
        // ═══════════════════════════════════════════════════════════════════
        const lowerMsg = errorMsg.toLowerCase();
        if (
            lowerMsg.includes('already exists') ||
            lowerMsg.includes('phải ở trạng thái') ||
            lowerMsg.includes('chỉ có thể hủy đơn khi') ||
            lowerMsg.includes('đã được giao') ||
            lowerMsg.includes('hiện tại: remitted')
        ) {
            await client.query(
                `UPDATE blockchain_outbox 
                 SET status = 'SYNCED', synced_at = NOW(), last_error = $2 
                 WHERE id = $1`,
                [id, `[AUTO-RESOLVED] ${errorMsg}`]
            );
            await client.query(
                `UPDATE orders SET blockchain_sync_status = 'SYNCED' WHERE id = $1`,
                [order_id]
            ).catch(() => { });
            console.log(`  ✅ [Outbox #${id}] Tự động SYNCED (đã tồn tại trên chain)`);
            return true; // Cho phép đi tiếp chuỗi
        }

        // ═══════════════════════════════════════════════════════
        // PERMANENT ERROR → SKIPPED
        // ═══════════════════════════════════════════════════════
        if (isPermanentError(errorMsg)) {
            await client.query(
                `UPDATE blockchain_outbox 
                 SET status = 'SKIPPED', last_error = $2, processed_at = NOW() 
                 WHERE id = $1`,
                [id, `[PERMANENT] ${errorMsg}`]
            );

            await client.query(
                `UPDATE orders SET blockchain_sync_status = 'NOT_ON_CHAIN' WHERE id = $1`,
                [order_id]
            ).catch(() => { });

            console.warn(`  ⏭️  [Outbox #${id}] SKIPPED (permanent): ${errorMsg}`);
            return false;
        }

        // ═══════════════════════════════════════════════════════
        // DELAYED (Chưa đến hạn, ví dụ Hold Period) -> Không tính lượt retry
        // ═══════════════════════════════════════════════════════
        if (lowerMsg.includes('chưa đủ thời gian giữ tiền')) {
            console.log(`2|3-BACKEND  |   ⏳ [Outbox #${task.id}] DELAYED (Chưa đến hạn mở khóa): No valid responses from any peers. Errors:`);
            const errorDetail = err.response?.data?.error;
            if (errorDetail) console.log(`2|3-BACKEND  |     ${errorDetail}`);

            // Update processed_at to delay it for 5 minutes without consuming retries
            // Also update simulatedTime so it advances with real time
            const updatedPayload = { ...payloadData, simulatedTime: new Date().toISOString() };
            await client.query(
                `UPDATE blockchain_outbox SET processed_at = NOW(), payload = $1 WHERE id = $2`,
                [JSON.stringify(updatedPayload), task.id]
            );
            return false; // Delay, leave in PENDING
        }

        // ═══════════════════════════════════════════════════════
        // TRANSIENT ERROR → FAILED (chờ 5 phút rồi retry)
        // ═══════════════════════════════════════════════════════
        const newRetryCount = task.retry_count + 1;
        const isExhausted = newRetryCount >= task.max_retries;

        await client.query(
            `UPDATE blockchain_outbox 
             SET status = 'FAILED', retry_count = $2, last_error = $3, processed_at = NOW() 
             WHERE id = $1`,
            [id, newRetryCount, errorMsg]
        );

        if (isExhausted) {
            await client.query(
                `UPDATE orders SET blockchain_sync_status = 'FAILED' WHERE id = $1`,
                [order_id]
            );
            console.error(`  ❌ [Outbox #${id}] FAILED sau ${newRetryCount}/${task.max_retries} lần: ${errorMsg}`);
        } else {
            console.warn(`  ⚠️ [Outbox #${id}] Retry ${newRetryCount}/${task.max_retries} — next in ${RETRY_DELAY_SECONDS / 60}min: ${errorMsg}`);
        }
        return false;
    }
}

/**
 * Khởi động Outbox Worker
 */
function startOutboxWorker() {
    console.log(`[Outbox Worker] Đã khởi động (poll: ${POLL_INTERVAL_MS / 1000}s, retry delay: ${RETRY_DELAY_MS / 60000} phút, max retries: ${DEFAULT_MAX_RETRIES})`);

    // Chạy ngay lập tức khi startup (xử lý tasks tồn đọng)
    processOutbox().catch(err => {
        console.error('[Outbox Worker] Lỗi chạy lần đầu:', err.message);
    });

    // Poll liên tục
    setInterval(() => {
        processOutbox().catch(err => {
            console.error('[Outbox Worker] Poll error:', err.message);
        });
    }, POLL_INTERVAL_MS);
}

/**
 * Manual trigger — dùng cho API endpoint
 */
async function manualProcess() {
    await processOutbox();
    const client = await pool.connect();
    try {
        const stats = await client.query(`
            SELECT status, COUNT(*)::int as count 
            FROM blockchain_outbox 
            GROUP BY status
        `);
        return {
            processed: true,
            stats: stats.rows.reduce((acc, r) => { acc[r.status] = r.count; return acc; }, {})
        };
    } finally {
        client.release();
    }
}

module.exports = { startOutboxWorker, manualProcess, processOutbox };
