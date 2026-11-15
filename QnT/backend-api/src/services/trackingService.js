// backend-api/src/services/trackingService.js
//
// Service chuyên dụng để ghi nhật ký (log) thay đổi trạng thái đơn hàng
// vào bảng shippingtracking.
//
// Cách dùng:
//   const { logTracking } = require('../services/trackingService');
//   await logTracking(client, {
//       orderId       : 'ORD-001',
//       status        : 'SHIPPED',          // status mới của orders
//       codstatus     : 'NOT_COLLECTED',    // codstatus mới (null nếu không phải COD)
//       event         : 'SHIP_ORDER',       // tên hành động
//       carrierId     : 5,                  // ID shipper company (orders.carrier_id)
//       shipperId     : 7,                  // ID người giao hàng (orders.shipper_id)
//       currentLocation: 'Kho HCM',        // vị trí hiện tại (tuỳ chọn)
//       notes         : 'Shipper đã lấy hàng',
//       changedBy     : 'user-uuid-...',    // user_id người thực hiện
//       timestamp     : new Date(),         // mặc định NOW()
//   });

/**
 * Ghi một dòng log vào bảng shippingtracking.
 *
 * @param {import('pg').PoolClient} client - DB client đang trong transaction
 * @param {Object} opts
 * @param {string}   opts.orderId
 * @param {string}   opts.status          - Giá trị status mới của đơn hàng
 * @param {string}   [opts.codstatus]     - Giá trị codstatus mới (null nếu PREPAID)
 * @param {string}   [opts.event]         - Tên sự kiện: SHIP_ORDER, CONFIRM_DELIVERY, v.v.
 * @param {number|string} [opts.carrierId]  - carrier_id (công ty vận chuyển)
 * @param {number|string} [opts.shipperId]  - shipper_id (nhân viên giao hàng)
 * @param {string}   [opts.currentLocation] - Vị trí hiện tại
 * @param {string}   [opts.notes]         - Ghi chú thêm
 * @param {string}   [opts.changedBy]     - user_id người thực hiện thay đổi
 * @param {Date}     [opts.timestamp]     - Thời điểm thay đổi (mặc định: NOW())
 * @returns {Promise<Object>} - Bản ghi vừa insert
 */
async function logTracking(client, {
    orderId,
    status,
    codstatus = null,
    event = null,
    carrierId = null,
    shipperId = null,
    currentLocation = null,
    notes = null,
    changedBy = null,
    timestamp = new Date(),
}) {
    if (!orderId || !status) {
        console.warn('[trackingService] logTracking: thiếu orderId hoặc status — bỏ qua.');
        return null;
    }

    try {
        const result = await client.query(
            `INSERT INTO shippingtracking
                (orderid, status, codstatus, event, carrierid, shipperid,
                 currentlocation, notes, changed_by, createat, updateat)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
             RETURNING *`,
            [
                orderId,
                status,
                codstatus || null,
                event || null,
                carrierId ? parseInt(carrierId) : null,
                shipperId ? parseInt(shipperId) : null,
                currentLocation || null,
                notes || null,
                changedBy ? String(changedBy) : null,
                timestamp instanceof Date ? timestamp.toISOString() : timestamp,
            ]
        );
        console.log(`📦 [Tracking] Đã ghi log: đơn ${orderId} → status=${status}${codstatus ? `, codstatus=${codstatus}` : ''} (event: ${event})`);
        return result.rows[0];
    } catch (err) {
        // Không throw — lỗi tracking không được làm hỏng luồng chính
        console.error(`[trackingService] Lỗi ghi log tracking cho đơn ${orderId}:`, err.message);
        return null;
    }
}

/**
 * Lấy toàn bộ lịch sử tracking của một đơn hàng, sắp xếp theo thời gian tăng dần.
 *
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} orderId
 * @returns {Promise<Array>}
 */
async function getTrackingHistory(db, orderId) {
    const result = await db.query(
        `SELECT id, orderid, status, codstatus, event,
                carrierid, shipperid, currentlocation,
                notes, changed_by, createat
         FROM shippingtracking
         WHERE orderid = $1
         ORDER BY createat ASC`,
        [orderId]
    );
    return result.rows;
}

module.exports = { logTracking, getTrackingHistory };
