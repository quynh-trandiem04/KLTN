// backend-api/src/services/blockchainGuard.js
// Guard: Chặn thao tác trên đơn hàng nếu nó chưa được sync lên blockchain
//
// Logic đơn giản:
//   - SYNCED          → cho phép
//   - PENDING (outbox chưa xử lý CREATE_ORDER) → cho phép (đang chờ sync)
//   - Mọi thứ khác (NULL, NOT_ON_CHAIN, FAILED) → CHẶN
//
// Đơn cũ (NULL) sẽ được startup reconciliation set đúng trạng thái

const pool = require('../config/database');
const axios = require('axios');
const { BLOCKCHAIN_ADAPTER_URL } = require('../config/constants');

/**
 * Kiểm tra đơn hàng đã được sync lên blockchain chưa.
 * Chỉ cho phép nếu sync_status = 'SYNCED' hoặc đang PENDING (chờ outbox xử lý)
 *
 * @param {string} orderId - ID đơn hàng
 * @param {Object} [client] - DB client (nếu đang trong transaction)
 * @returns {Object|null} null nếu OK, { blocked, status, message } nếu bị chặn
 */
async function requireBlockchainSync(orderId, client = null) {
    const db = client || pool;

    try {
        const result = await db.query(
            `SELECT blockchain_sync_status FROM orders WHERE id = $1`,
            [orderId]
        );

        if (result.rows.length === 0) {
            return null; // Order không tồn tại → lỗi sẽ được caller xử lý
        }

        const syncStatus = result.rows[0].blockchain_sync_status;

        // ✅ Đã sync → OK
        if (syncStatus === 'SYNCED') {
            return null;
        }

        // ⏳ Đang chờ outbox xử lý CREATE_ORDER → cho phép tạm
        if (syncStatus === 'PENDING') {
            return null;
        }

        // ❌ Tất cả trạng thái khác → CHẶN
        // Bao gồm: NULL (chưa reconcile), NOT_ON_CHAIN, FAILED
        const statusLabel = syncStatus || 'UNKNOWN';
        return {
            blocked: true,
            status: statusLabel,
            message: `Đơn hàng ${orderId} không tồn tại trên Blockchain (sync_status: ${statusLabel}). Không thể thực hiện thao tác. Vui lòng liên hệ Admin để đối chiếu dữ liệu.`
        };

    } catch (err) {
        console.error(`[BlockchainGuard] Lỗi check sync status cho ${orderId}:`, err.message);
        return null; // fail-open
    }
}

module.exports = { requireBlockchainSync };
