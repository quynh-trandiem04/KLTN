// backend-api/src/controllers/adminController.js
const pool = require('../config/database');
const authService = require('../services/auth.service');
const axios = require('axios');
const { BLOCKCHAIN_ADAPTER_URL } = require('../config/constants');
const { hashPassword } = require('../config/security');
const { requireBlockchainSync } = require('../services/blockchainGuard');
const { logTracking } = require('../services/trackingService');



/**
 * Admin controller - Seller approval and shipper management
 */
class AdminController {
    /**
     * Tự động đồng bộ Identity (Không dùng req, res)
     */
    async autoSyncIdentities() {
        const client = await pool.connect();
        try {
            console.log(`\n [Auto-Sync] Kiểm tra và đồng bộ Identity Blockchain cho các tài khoản cũ...`);

            const result = await client.query(`
                SELECT u.id, u.email, u.role, u.org_msp, u.firstname, u.lastname,
                       u.username as store_name
                FROM users u
                WHERE u.isactive = true 
                  AND (
                      (u.role IN ('STORE', 'SELLER') AND u.org_msp IN ('Org2MSP', 'SellerOrgMSP')) 
                      OR 
                      (u.role = 'SHIPPER' AND u.org_msp IN ('Org3MSP', 'ShipperOrgMSP'))
                  )
            `);

            const users = result.rows;
            if (users.length === 0) {
                console.log(` [Auto-Sync] Không có tài khoản nào cần đồng bộ.`);
                return;
            }

            let successCount = 0;
            let skipCount = 0;
            let errorCount = 0;

            for (const user of users) {
                const chainUsername = user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
                let chainRole = '';
                let storeNameAttr = '';

                if (user.role === 'STORE' || user.role === 'SELLER') {
                    chainRole = 'SELLER';
                    storeNameAttr = chainUsername;
                } else if (user.role === 'SHIPPER') {
                    chainRole = 'SHIPPER';
                    storeNameAttr = `${user.firstname || ''} ${user.lastname || ''}`.trim() || chainUsername;
                }

                try {
                    const adapterRes = await axios.post(`${BLOCKCHAIN_ADAPTER_URL}/register-user`, {
                        username: chainUsername,
                        role: chainRole,
                        storeName: storeNameAttr
                    });

                    if (adapterRes.data.success) {
                        if (adapterRes.data.message?.includes('tồn tại')) {
                            skipCount++;
                        } else {
                            successCount++;
                            console.log(`    Đã cấp mới Identity cho: ${chainUsername}`);
                        }
                    }
                } catch (err) {
                    errorCount++;
                    console.error(`    Lỗi đồng bộ ${chainUsername}:`, err.response?.data?.error || err.message);
                }
            }

            console.log(` [Auto-Sync] Hoàn tất! Cấp mới: ${successCount} | Đã có sẵn: ${skipCount} | Lỗi: ${errorCount}\n`);

        } catch (error) {
            console.error(' [Auto-Sync] Lỗi hệ thống:', error.message);
        } finally {
            client.release();
        }
    }

    async syncBlockchainIdentities(req, res) {
        try {
            await this.autoSyncIdentities(); // Tái sử dụng logic
            res.status(200).json({ success: true, message: 'Lệnh đồng bộ đã được thực thi. Vui lòng xem log backend.' });
        } catch (error) {
            res.status(500).json({ success: false, detail: error.message });
        }
    }

    /**
     * Get all seller applications with optional status filter
     * GET /admin/seller-applications?status=PENDING
     */
    async getSellerApplications(req, res) {
        try {
            const { status, search } = req.query;

            let query = `
                SELECT 
                    sa.id, sa.user_id, sa.business_name, sa.business_license,
                    sa.business_address, sa.tax_code, sa.status,
                    sa.submitted_at, sa.reviewed_at, sa.reviewed_by, sa.reject_reason,
                    u.email, u.firstname, u.lastname, u.phone,
                    reviewer.email as reviewer_email
                FROM seller_applications sa
                JOIN users u ON sa.user_id = u.id
                LEFT JOIN users reviewer ON sa.reviewed_by = reviewer.id
                WHERE 1=1
            `;

            const params = [];
            if (status && ['PENDING', 'REVIEWING', 'APPROVED', 'REJECTED'].includes(status)) {
                params.push(status);
                query += ` AND sa.status = $${params.length}`;
            }

            if (search) {
                const s = `%${search}%`;
                params.push(s);
                query += ` AND (sa.business_name ILIKE $${params.length} OR sa.tax_code ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.firstname ILIKE $${params.length} OR u.lastname ILIKE $${params.length})`;
            }

            query += ' ORDER BY sa.submitted_at DESC';

            const result = await pool.query(query, params);

            res.status(200).json({
                total: result.rows.length,
                applications: result.rows.map(app => ({
                    id: app.id,
                    user: {
                        id: app.user_id,
                        email: app.email,
                        full_name: `${app.firstname} ${app.lastname}`.trim(),
                        phone: app.phone
                    },
                    business_name: app.business_name,
                    business_license: app.business_license,
                    business_address: app.business_address,
                    tax_code: app.tax_code,
                    status: app.status,
                    submitted_at: app.submitted_at,
                    reviewed_at: app.reviewed_at,
                    reviewed_by: app.reviewer_email,
                    reject_reason: app.reject_reason
                }))
            });
        } catch (error) {
            console.error('Get seller applications error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    /**
     * Approve seller application
     * PENDING → APPROVED, grant STORE_OWNER role
     * POST /admin/approve-seller/:id
     */
    async approveSeller(req, res) {
        const client = await pool.connect();
        try {
            const applicationId = parseInt(req.params.id);
            const adminId = req.user.user_id;

            await client.query('BEGIN');

            // 1. Lấy thông tin
            const appResult = await client.query(`
                SELECT sa.*, u.email 
                FROM seller_applications sa
                JOIN users u ON sa.user_id = u.id
                WHERE sa.id = $1
            `, [applicationId]);

            if (appResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy đơn đăng ký' });
            }

            const application = appResult.rows[0];

            // 2. Validate
            if (application.status === 'APPROVED') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: 'Đơn đăng ký đã được duyệt trước đó' });
            }

            if (application.status !== 'PENDING') {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    detail: `Chỉ có thể duyệt đơn có trạng thái PENDING. Trạng thái hiện tại: ${application.status}`
                });
            }

            // Update to APPROVED
            await client.query(
                `UPDATE seller_applications 
                 SET status = 'APPROVED', reviewed_at = NOW(), reviewed_by = $1
                 WHERE id = $2`,
                [adminId, applicationId]
            );

            // Cập nhật role và org_msp trong bảng users
            await client.query(
                `UPDATE users 
                 SET role = 'SELLER', org_msp = 'Org2MSP' 
                 WHERE id = $1`,
                [application.user_id]
            );

            // 4. Grant Role (vào bảng userroles)
            if (typeof this._grantStoreOwnerRole === 'function') {
                await this._grantStoreOwnerRole(client, application.user_id, application);
            }

            // create identity
            const chainUsername = application.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');

            let blockchainNote = '';
            try {
                console.log(`\n [Admin] Đang yêu cầu cấp Identity Blockchain cho Seller: ${chainUsername}...`);

                const adapterRes = await axios.post(`${BLOCKCHAIN_ADAPTER_URL}/register-user`, {
                    username: chainUsername,
                    role: 'SELLER',
                    storeName: chainUsername
                });

                if (!adapterRes.data.success) {
                    const errMsg = adapterRes.data.error || adapterRes.data.message || 'Lỗi từ Adapter';
                    console.warn(` [Blockchain] Cảnh báo CA: ${errMsg}`);
                    blockchainNote = ` (Chưa đồng bộ Blockchain: ${errMsg})`;
                } else {
                    console.log(` [Blockchain] Đã cấp Identity thành công cho Seller: ${chainUsername}`);
                }
            } catch (chainErr) {
                const errorMsg = chainErr.response?.data?.error
                    || chainErr.response?.data?.message
                    || chainErr.message
                    || chainErr.code
                    || 'Mất kết nối Adapter';
                console.warn(` [Blockchain] Cảnh báo lỗi cấp CA Identity: ${errorMsg}`);
                blockchainNote = ` (Chưa đồng bộ Blockchain: ${errorMsg})`;
                // Không throw error để thực hiện COMMIT cho csdl
            }

            await client.query('COMMIT');

            res.status(200).json({
                message: `Đã duyệt đơn đăng ký. Seller đã hoạt động.${blockchainNote}`,
                application_id: applicationId,
                user_id: application.user_id,
                business_name: application.business_name,
                blockchain_id: chainUsername,
                tax_code: application.tax_code,
                status: 'APPROVED'
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Approve seller error:', error.message);
            res.status(500).json({ detail: `Lỗi Duyệt Đơn: ${error.message}` });
        } finally {
            client.release();
        }
    }

    /**
     * Helper: Grant STORE_OWNER role to user and create store
     */
    async _grantStoreOwnerRole(client, userId, application) {
        const roleResult = await client.query(
            "SELECT id FROM roles WHERE name = 'STORE_OWNER'"
        );

        if (roleResult.rows.length > 0) {
            const roleId = roleResult.rows[0].id;

            const existingRole = await client.query(
                'SELECT * FROM userroles WHERE userid = $1 AND roleid = $2',
                [userId, roleId]
            );

            if (existingRole.rows.length === 0) {
                await client.query(
                    'INSERT INTO userroles (userid, roleid, assignedat) VALUES ($1, $2, NOW())',
                    [userId, roleId]
                );
            }
        }

        // Create store if not exists
        const existingStore = await client.query(
            'SELECT id FROM store WHERE ownerid = $1', [userId]
        );
        if (existingStore.rows.length === 0) {
            await client.query(
                `INSERT INTO store (ownerid, name, isactive, rating, waitingproductcount, createat, taxid, registeredbusinessname, taxaddress)
                 VALUES ($1, $2, true, 0, 0, NOW(), $3, $4, $5)`,
                [
                    userId,
                    application.business_name,
                    application.tax_code || null,
                    application.business_name,
                    application.business_address || null
                ]
            );
        }
    }

    /**
     * Reject seller application
     * POST /admin/reject-seller/:id
     * Body: { reason: "Lý do từ chối" }
     */
    async rejectSeller(req, res) {
        const client = await pool.connect();
        try {
            const applicationId = parseInt(req.params.id);
            const adminId = req.user.user_id;
            const { reason } = req.body;

            if (!reason || reason.trim().length < 10) {
                return res.status(400).json({
                    detail: 'Lý do từ chối phải có ít nhất 10 ký tự'
                });
            }

            await client.query('BEGIN');

            const appResult = await client.query(
                'SELECT * FROM seller_applications WHERE id = $1',
                [applicationId]
            );

            if (appResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy đơn đăng ký' });
            }

            const application = appResult.rows[0];

            if (application.status === 'REJECTED') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: 'Đơn đăng ký đã bị từ chối trước đó' });
            }

            // Get user email before deleting user
            const userResult = await client.query(
                'SELECT email FROM users WHERE id = $1',
                [application.user_id]
            );
            const userEmail = userResult.rows[0]?.email;

            await client.query(
                `UPDATE seller_applications
                 SET status = 'REJECTED', reviewed_at = NOW(), reviewed_by = $1, reject_reason = $2
                 WHERE id = $3`,
                [adminId, reason.trim(), applicationId]
            );

            // Delete user and related data to allow re-registration with same email
            // Only delete if status was PENDING (not yet approved)
            if (application.status === 'PENDING') {
                // Delete userroles first (foreign key constraint)
                await client.query(
                    'DELETE FROM userroles WHERE userid = $1',
                    [application.user_id]
                );

                // Delete user
                await client.query(
                    'DELETE FROM users WHERE id = $1',
                    [application.user_id]
                );
            }

            await client.query('COMMIT');

            // Send rejection email notification (async, don't block response)
            if (userEmail) {
                try {
                    const nodemailer = require('nodemailer');
                    const transporter = nodemailer.createTransport({
                        host: process.env.SMTP_HOST || 'localhost',
                        port: process.env.SMTP_PORT || 1025,
                        secure: false
                    });

                    await transporter.sendMail({
                        from: process.env.SMTP_FROM || 'noreply@ecommerce.com',
                        to: userEmail,
                        subject: 'Kết quả xét duyệt đơn đăng ký bán hàng',
                        html: `
                            <h2>Kết quả xét duyệt đơn đăng ký bán hàng</h2>
                            <p>Xin lỗi, đơn đăng ký bán hàng cho cửa hàng <strong>${application.business_name}</strong> đã bị từ chối.</p>
                            <p><strong>Lý do từ chối:</strong></p>
                            <p>${reason.trim()}</p>
                            <p>Bạn có thể điều chỉnh hồ sơ và nộp lại bất cứ lúc nào bằng cách đăng ký lại với email này.</p>
                            <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/seller/register">Đăng ký lại</a></p>
                        `
                    }).catch(err => console.log('Email send failed (non-blocking):', err.message));
                } catch (emailErr) {
                    console.log('Email notification skipped:', emailErr.message);
                }
            }

            res.status(200).json({
                message: 'Đã từ chối đơn đăng ký',
                application_id: applicationId,
                user_id: application.user_id,
                status: 'REJECTED',
                reason: reason.trim(),
                note: 'Email thông báo đã được gửi đến ' + userEmail
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Reject seller error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        } finally {
            client.release();
        }
    }

    /**
     * GET /admin/dashboard-stats
     * Aggregate stats for admin dashboard
     */
    async getDashboardStats(req, res) {
        try {
            const [usersResult, sellerResult, ordersResult, revenueResult, trendResult] = await Promise.all([
                pool.query(`
                    SELECT 
                        COUNT(*) AS total,
                        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_this_month
                    FROM users
                `),
                pool.query(`
                    SELECT 
                        COUNT(*) AS total,
                        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
                        COUNT(*) FILTER (WHERE status = 'APPROVED') AS approved,
                        COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected
                    FROM seller_applications
                `),
                pool.query(`
                    SELECT 
                        COUNT(*) AS total,
                        COUNT(*) FILTER (WHERE status = 'CREATED') AS pending,
                        COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
                        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS this_month
                    FROM orders
                `).catch(() => ({ rows: [{ total: 0, pending: 0, delivered: 0, this_month: 0 }] })),
                pool.query(`
                    SELECT COALESCE(SUM(finalprice), 0) AS total_revenue
                    FROM orders WHERE status IN ('DELIVERED', 'SETTLED')
                `).catch(() => ({ rows: [{ total_revenue: 0 }] })),
                pool.query(`
                    WITH dates AS (
                        SELECT generate_series(
                            CURRENT_DATE - INTERVAL '14 days',
                            CURRENT_DATE,
                            '1 day'::interval
                        )::date AS date
                    )
                    SELECT 
                        to_char(d.date, 'DD/MM') as date_str,
                        COUNT(o.id) as order_count,
                        COALESCE(SUM(o.finalprice) FILTER (WHERE o.status IN ('DELIVERED', 'SETTLED')), 0) as revenue
                    FROM dates d
                    LEFT JOIN orders o ON DATE(o.created_at) = d.date
                    GROUP BY d.date
                    ORDER BY d.date ASC
                `).catch((err) => { console.error('Trend query error:', err); return { rows: [] }; })
            ]);

            const users = usersResult.rows[0];
            const sellers = sellerResult.rows[0];
            const orders = ordersResult.rows[0];
            const revenue = revenueResult.rows[0];

            // Recent seller applications
            const recentSellers = await pool.query(`
                SELECT sa.id, sa.business_name, sa.tax_code, sa.status, sa.submitted_at,
                       u.email, u.firstname, u.lastname
                FROM seller_applications sa
                JOIN users u ON sa.user_id = u.id
                ORDER BY sa.submitted_at DESC
                LIMIT 10
            `);

            res.status(200).json({
                users: {
                    total: parseInt(users.total),
                    new_this_month: parseInt(users.new_this_month)
                },
                sellers: {
                    total: parseInt(sellers.total),
                    pending: parseInt(sellers.pending),
                    approved: parseInt(sellers.approved),
                    rejected: parseInt(sellers.rejected)
                },
                orders: {
                    total: parseInt(orders.total),
                    pending: parseInt(orders.pending),
                    delivered: parseInt(orders.delivered),
                    this_month: parseInt(orders.this_month)
                },
                revenue: {
                    total: parseFloat(revenue.total_revenue)
                },
                trends: trendResult.rows.map(r => ({
                    date: r.date_str,
                    orders: parseInt(r.order_count),
                    revenue: parseFloat(r.revenue)
                })),
                recent_sellers: recentSellers.rows.map(r => ({
                    id: r.id,
                    business_name: r.business_name,
                    tax_code: r.tax_code,
                    status: r.status,
                    submitted_at: r.submitted_at,
                    email: r.email,
                    full_name: `${r.firstname} ${r.lastname}`.trim()
                }))
            });
        } catch (error) {
            console.error('Dashboard stats error:', error.message);
            res.status(500).json({ detail: `Lỗi: ${error.message}` });
        }
    }

    // ─── ORDER MANAGEMENT ───────────────────────────────────────────────

    // GET /v1/admin/orders/:id/items — only items, no JOIN
    async getOrderItems(req, res) {
        const { id } = req.params;
        try {
            const result = await pool.query(
                `SELECT oi.id, oi.productid AS product_id, oi.variantid AS variant_id,
                        oi.count AS quantity, oi.price, oi.promotionalprice AS promotional_price,
                        oi.productname AS product_name, oi.variantname AS variant_name, oi.productimage AS image
                 FROM orderitem oi WHERE oi.orderid = $1`,
                [id]
            );
            res.json({ items: result.rows });
        } catch (e) {
            console.error('admin getOrderItems:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        }
    }

    // GET /v1/admin/orders/:id — chi tiết đầy đủ
    async getOrder(req, res) {
        const { id } = req.params;
        try {
            const [orderRes, itemsRes] = await Promise.all([
                pool.query(
                    `SELECT o.id, o.status, o.paymentmethod, o.codstatus, o.finalprice, o.price, o.deliveryprice,
                            o.storeid, o.storename, o.created_at, o.updated_at,
                            o.shippingaddressline1, o.shippingaddressline2, o.shippingcity, o.shippingdistrict, o.shippingphone,
                            o.shipper_id, o.payment_proof_url, o.payment_verified, o.payment_verified_at,
                            CONCAT(u.firstname,' ',u.lastname) AS buyer_name, u.email AS buyer_email, u.phone AS buyer_phone,
                            CONCAT(sh.firstname,' ',sh.lastname) AS shipper_name, sh.email AS shipper_email, sh.phone AS shipper_phone,
                            CONCAT(admin.firstname,' ',admin.lastname) AS verified_by_name
                     FROM orders o
                     LEFT JOIN users u ON CAST(o.user_id AS text) = CAST(u.id AS text)
                     LEFT JOIN users sh ON o.shipper_id IS NOT NULL AND CAST(o.shipper_id AS text) = CAST(sh.id AS text)
                     LEFT JOIN users admin ON o.payment_verified_by IS NOT NULL AND CAST(o.payment_verified_by AS text) = CAST(admin.id AS text)
                     WHERE o.id = $1`,
                    [id]
                ),
                pool.query(
                    `SELECT oi.id, oi.productid AS product_id, oi.variantid AS variant_id,
                            oi.count AS quantity, oi.price, oi.promotionalprice AS promotional_price,
                            oi.productname AS product_name, oi.variantname AS variant_name, oi.productimage AS image
                     FROM orderitem oi WHERE oi.orderid = $1`,
                    [id]
                )
            ]);
            if (orderRes.rows.length === 0) return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            res.json({ order: orderRes.rows[0], items: itemsRes.rows });
        } catch (e) {
            console.error('admin getOrder:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        }
    }

    // GET /v1/admin/orders
    async getOrders(req, res) {
        const { status, search, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        try {
            const countParams = [];
            let whereClause = '';
            if (status) {
                countParams.push(status);
                whereClause = `WHERE o.status = $1`;
            }
            if (search) {
                const s = `%${search}%`;
                if (!whereClause) {
                    countParams.push(s);
                    whereClause = `WHERE (o.id::text ILIKE $1 OR o.storename ILIKE $1 OR o.shippingphone ILIKE $1 OR CAST(o.user_id AS text) ILIKE $1)`;
                } else {
                    countParams.push(s);
                    whereClause += ` AND (o.id::text ILIKE $${countParams.length} OR o.storename ILIKE $${countParams.length} OR o.shippingphone ILIKE $${countParams.length} OR CAST(o.user_id AS text) ILIKE $${countParams.length})`;
                }
            }
            const mainParams = [...countParams, parseInt(limit), parseInt(offset)];
            const lIdx = countParams.length + 1;
            const oIdx = countParams.length + 2;

            const [dataRes, countRes] = await Promise.all([
                pool.query(
                    `SELECT o.id, o.status, o.paymentmethod, o.codstatus, o.finalprice, o.price, o.deliveryprice,
                            o.storeid, o.storename, o.created_at, o.updated_at, o.shippingphone,
                            o.shippingaddressline1, o.shippingcity, o.user_id,
                            o.shop_coupon_id, o.shop_discount, o.platform_coupon_id, o.platform_discount,
                            sc.code as shop_coupon_code, sc.description as shop_coupon_description,
                            pc.code as platform_coupon_code, pc.description as platform_coupon_description
                     FROM orders o
                     LEFT JOIN coupon sc ON o.shop_coupon_id = sc.id
                     LEFT JOIN coupon pc ON o.platform_coupon_id = pc.id
                     ${whereClause}
                     ORDER BY o.created_at DESC LIMIT $${lIdx} OFFSET $${oIdx}`,
                    mainParams
                ),
                pool.query(`SELECT COUNT(*) FROM orders o ${whereClause}`, countParams)
            ]);

            // Get buyer info separately to avoid UUID cast issues
            const orders = dataRes.rows;
            if (orders.length > 0) {
                const userIds = [...new Set(orders.map(o => o.user_id).filter(Boolean))];
                let userMap = {};
                if (userIds.length > 0) {
                    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
                    const usersRes = await pool.query(
                        `SELECT id::text, CONCAT(firstname,' ',lastname) AS full_name, email FROM users WHERE id::text = ANY(ARRAY[${placeholders}])`,
                        userIds
                    );
                    usersRes.rows.forEach(u => { userMap[u.id] = u; });
                }
                orders.forEach(o => {
                    const u = userMap[o.user_id];
                    o.buyer_name = u ? u.full_name : null;
                    o.buyer_email = u ? u.email : null;
                });
            }

            res.json({ orders, total: parseInt(countRes.rows[0].count) });
        } catch (e) {
            console.error('admin getOrders:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        }
    }

    // POST /v1/admin/orders/:id/confirm-payment
    // PREPAID: CREATED → PAID (+ cố gắng đồng bộ Blockchain)
    async confirmPayment(req, res) {
        const { id } = req.params;
        const adminUserId = req.user.user_id;
        const { simulated_time } = req.query;
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const r = await client.query(`
                SELECT *, payment_proof_url, payment_verified 
                FROM orders WHERE id = $1
            `, [id]);

            if (r.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            }

            const o = r.rows[0];
            if ((o.paymentmethod || '').toUpperCase() !== 'PREPAID') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: 'Chỉ xác nhận thanh toán cho đơn PREPAID' });
            }
            if (o.status !== 'CREATED') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Đơn hàng phải ở trạng thái CREATED (hiện tại: ${o.status})` });
            }

            if (o.payment_verified) {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: 'Chứng từ thanh toán đã được xác nhận trước đó' });
            }

            // ====== BLOCKCHAIN GUARD ======
            const guard = await requireBlockchainSync(id, client);
            if (guard) {
                await client.query('ROLLBACK');
                return res.status(409).json({ detail: guard.message, sync_status: guard.status });
            }

            const hasProof = !!o.payment_proof_url;
            const now = simulated_time ? new Date(simulated_time) : new Date();

            const result = await client.query(`
                UPDATE orders SET 
                    status = 'PAID', 
                    payment_verified = $1, 
                    payment_verified_at = CASE WHEN $1 THEN $4::timestamp ELSE payment_verified_at END, 
                    payment_verified_by = CASE WHEN $1 THEN $2 ELSE payment_verified_by END, 
                    updated_at = $4::timestamp 
                WHERE id = $3 
                RETURNING id, status, updated_at, payment_verified_at
            `, [hasProof, adminUserId, id, now.toISOString()]);

            // ====== GHI TRACKING LOG ======
            await logTracking(client, {
                orderId: id,
                status: 'PAID',
                codstatus: o.codstatus || null,
                event: 'CONFIRM_PAYMENT',
                carrierId: o.carrier_id,
                shipperId: o.shipper_id,
                notes: 'Admin xác nhận thanh toán (PREPAID)',
                changedBy: adminUserId,
                timestamp: now,
            });

            // ====== OUTBOX PATTERN: Ghi task xác nhận thanh toán vào outbox ======
            await client.query(
                `INSERT INTO blockchain_outbox (order_id, action, payload) VALUES ($1, $2, $3)`,
                [id, 'CONFIRM_PAYMENT', JSON.stringify({
                    orderID: id,
                    simulatedTime: simulated_time ? now.toISOString() : undefined,
                    requestorOrg: 'platform',
                    requestorUser: 'admin-ca-platform'
                })]
            );
            console.log(` [Outbox] Đã ghi task CONFIRM_PAYMENT cho đơn ${id}`);

            await client.query('COMMIT');
            res.json({
                message: hasProof ? 'Đã xác nhận thanh toán và chứng từ' : 'Đã xác nhận thanh toán',
                order: result.rows[0]
            });
        } catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            console.error('confirmPayment:', e.message);
            res.status(500).json({ detail: `Lỗi Server: ${e.message}` });
        } finally {
            client.release();
        }
    }

    // POST /v1/admin/orders/:id/cancel
    // CREATED or PAID → CANCELLED
    async cancelOrder(req, res) {
        const { id } = req.params;
        const client = await pool.connect();
        try {
            const r = await client.query(`SELECT * FROM orders WHERE id = $1`, [id]);
            if (r.rows.length === 0) return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            const o = r.rows[0];
            if (!['CREATED', 'PAID'].includes(o.status))
                return res.status(400).json({ detail: `Chỉ hủy được đơn ở trạng thái CREATED hoặc PAID (hiện tại: ${o.status})` });

            // ====== BLOCKCHAIN GUARD ======
            const guard = await requireBlockchainSync(id);
            if (guard) {
                client.release();
                return res.status(409).json({ detail: guard.message, sync_status: guard.status });
            }

            await client.query('BEGIN');

            const result = await client.query(
                `UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 RETURNING id, status, updated_at`,
                [id]
            );

            // ====== GHI TRACKING LOG ======
            const cancelledOrder = result.rows[0];
            await logTracking(client, {
                orderId: id,
                status: 'CANCELLED',
                codstatus: o.codstatus || null,
                event: 'CANCEL_ORDER',
                carrierId: o.carrier_id,
                shipperId: o.shipper_id,
                notes: 'Admin hủy đơn hàng',
                changedBy: null, // không có req.user trong context này
                timestamp: new Date(),
            });

            // ====== OUTBOX PATTERN: Ghi task hủy đơn admin vào outbox ======
            await client.query(
                `INSERT INTO blockchain_outbox (order_id, action, payload) VALUES ($1, $2, $3)`,
                [id, 'CANCEL_ORDER', JSON.stringify({
                    orderID: id,
                    requestorOrg: 'platform',
                    requestorUser: 'admin-ca-platform'
                })]
            );
            console.log(` [Outbox] Đã ghi task CANCEL_ORDER (admin) cho đơn ${id}`);

            await client.query('COMMIT');
            res.json({ message: 'Đã hủy đơn hàng', order: result.rows[0] });

        } catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            console.error('cancelOrder:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // POST /v1/admin/orders/:id/request-return
    // DELIVERED (within 5 minutes) → RETURN_REQUESTED
    async requestReturn(req, res) {
        const { id } = req.params;
        const { simulated_time } = req.query;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const r = await client.query(`SELECT * FROM orders WHERE id = $1`, [id]);
            if (r.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            }
            const o = r.rows[0];
            if (o.status !== 'DELIVERED') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Đơn hàng phải ở trạng thái DELIVERED (hiện tại: ${o.status})` });
            }

            // ====== BLOCKCHAIN GUARD ======
            const guard = await requireBlockchainSync(id, client);
            if (guard) {
                await client.query('ROLLBACK');
                return res.status(409).json({ detail: guard.message, sync_status: guard.status });
            }

            let returnWindowMinutes = 5;
            try {
                const bizRes = await axios.get(`${BLOCKCHAIN_ADAPTER_URL}/config/business?requestorOrg=platform&requestorUser=admin-ca-platform`);
                if (bizRes.data?.success) {
                    returnWindowMinutes = Number(bizRes.data.data.returnWindowMinutes);
                } else {
                    throw new Error('Dữ liệu cấu hình không hợp lệ');
                }
            } catch (e) {
                await client.query('ROLLBACK');
                return res.status(500).json({ detail: `Không kết nối được cấu hình Hệ thống từ Blockchain: ${e.message}` });
            }

            // Check return window
            const deliveredAt = new Date(o.updated_at);
            const now = simulated_time ? new Date(simulated_time) : new Date();
            const diffMs = now - deliveredAt;
            if (diffMs > returnWindowMinutes * 60 * 1000) {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Đã hết thời hạn yêu cầu trả hàng (${returnWindowMinutes} phút)` });
            }

            const result = await client.query(
                `UPDATE orders SET status = 'RETURN_REQUESTED', updated_at = $2 WHERE id = $1 RETURNING id, status, updated_at`,
                [id, now.toISOString()]
            );

            // ====== GHI TRACKING LOG ======
            await logTracking(client, {
                orderId: id,
                status: 'RETURN_REQUESTED',
                codstatus: o.codstatus || null,
                event: 'REQUEST_RETURN',
                carrierId: o.carrier_id,
                shipperId: o.shipper_id,
                notes: 'Admin yêu cầu hoàn trả đơn hàng',
                changedBy: null,
                timestamp: now,
            });

            // ====== OUTBOX PATTERN: Ghi task trả hàng admin vào outbox ======
            await client.query(
                `INSERT INTO blockchain_outbox (order_id, action, payload) VALUES ($1, $2, $3)`,
                [id, 'REQUEST_RETURN', JSON.stringify({
                    orderID: id,
                    simulatedTime: simulated_time ? now.toISOString() : undefined,
                    requestorOrg: 'platform',
                    requestorUser: 'admin-ca-platform'
                })]
            );
            console.log(` [Outbox] Đã ghi task REQUEST_RETURN (admin) cho đơn ${id}`);

            await client.query('COMMIT');
            res.json({ message: 'Đã yêu cầu trả hàng thành công', order: result.rows[0] });
        } catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            console.error('requestReturn:', e.message);
            res.status(500).json({ detail: `Lỗi server: ${e.message}` });
        } finally {
            client.release();
        }
    }
    // POST /v1/admin/orders/:id/remit-cod
    // COD + PENDING_REMITTANCE → REMITTED
    async remitCOD(req, res) {
        const { id } = req.params;
        const { simulated_time } = req.query;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const r = await client.query(`SELECT * FROM orders WHERE id = $1`, [id]);
            if (r.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            }

            const o = r.rows[0];
            if ((o.paymentmethod || '').toUpperCase() !== 'COD') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: 'Chỉ áp dụng cho đơn COD' });
            }
            if (o.codstatus !== 'PENDING_REMITTANCE') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `CodStatus phải là PENDING_REMITTANCE (hiện tại: ${o.codstatus})` });
            }

            // ====== BLOCKCHAIN GUARD ======
            const guardRemit = await requireBlockchainSync(id, client);
            if (guardRemit) {
                await client.query('ROLLBACK');
                return res.status(409).json({ detail: guardRemit.message, sync_status: guardRemit.status });
            }

            const now = simulated_time ? new Date(simulated_time) : new Date();

            const result = await client.query(
                `UPDATE orders SET codstatus = 'REMITTED', updated_at = $2 WHERE id = $1 RETURNING id, status, codstatus, updated_at`,
                [id, now.toISOString()]
            );

            // ====== GHI TRACKING LOG ======
            await logTracking(client, {
                orderId: id,
                status: o.status,         // status giữ nguyên, chỉ codstatus thay đổi
                codstatus: 'REMITTED',
                event: 'REMIT_COD',
                carrierId: o.carrier_id,
                shipperId: o.shipper_id,
                notes: 'Admin xác nhận đã thu tiền COD từ shipper',
                changedBy: null,
                timestamp: now,
            });

            // ====== OUTBOX PATTERN: Ghi task remit COD vào outbox ======
            await client.query(
                `INSERT INTO blockchain_outbox (order_id, action, payload) VALUES ($1, $2, $3)`,
                [id, 'REMIT_COD', JSON.stringify({
                    orderID: id,
                    simulatedTime: simulated_time ? now.toISOString() : undefined,
                    requestorOrg: 'platform',
                    requestorUser: 'admin-ca-platform'
                })]
            );
            console.log(` [Outbox] Đã ghi task REMIT_COD cho đơn ${id}`);

            await client.query('COMMIT');
            res.json({ message: 'Đã xác nhận nhận tiền COD và đồng bộ Blockchain', order: result.rows[0] });

        } catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            console.error('remitCOD:', e.message);
            res.status(500).json({ detail: `Lỗi server: ${e.message}` });
        } finally {
            client.release();
        }
    }
    // GET /v1/admin/shippers — danh sách shipper
    async getShippers(req, res) {
        try {
            const { search } = req.query;
            let query = `
                SELECT u.id, u.email, u.firstname, u.lastname, u.phone, u.isactive, u.created_at,
                       sp.display_name, sp.logo_url, sp.description, sp.service_description,
                       sp.estimated_days_local, sp.estimated_days_national, sp.origin_province,
                       sp.is_active as profile_active
                FROM users u
                JOIN userroles ur ON u.id = ur.userid
                JOIN roles r ON ur.roleid = r.id
                LEFT JOIN shipper_profiles sp ON u.id::text = sp.user_id::text
                WHERE r.name = 'SHIPPER'
            `;
            const params = [];
            if (search) {
                const s = `%${search}%`;
                params.push(s);
                query += ` AND (u.email ILIKE $1 OR u.firstname ILIKE $1 OR u.lastname ILIKE $1 OR u.phone ILIKE $1 OR sp.display_name ILIKE $1)`;
            }
            query += ' ORDER BY u.created_at DESC';
            const result = await pool.query(query, params);
            res.json({ shippers: result.rows });
        } catch (e) {
            console.error('getShippers:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        }
    }

    // POST /v1/admin/shippers — tạo tài khoản shipper mới
    async createShipper(req, res) {
        const { email, password, full_name, phone, display_name, description } = req.body;

        if (!email || !password || !full_name) {
            return res.status(400).json({ detail: 'Vui lòng điền đầy đủ email, mật khẩu và họ tên' });
        }

        let createdUser = null;

        try {
            createdUser = await authService.register({
                email,
                password,
                full_name,
                phone_number: phone || ''
            }, 'SHIPPER');

            // ALWAYS create shipper profile (mandatory)
            const shipperDisplayName = display_name || full_name;
            const shipperDescription = description || `Đơn vị vận chuyển ${shipperDisplayName}`;

            const client = await pool.connect();
            try {
                await client.query(
                    `INSERT INTO shipper_profiles (user_id, display_name, description, is_active, created_at, updated_at)
                     VALUES ($1, $2, $3, true, NOW(), NOW())
                     ON CONFLICT (user_id) DO UPDATE SET
                       display_name = EXCLUDED.display_name,
                       description = EXCLUDED.description,
                       is_active = true,
                       updated_at = NOW()`,
                    [createdUser.id, shipperDisplayName, shipperDescription]
                );
                console.log(`Created shipper profile for ${shipperDisplayName}`);
            } finally {
                client.release();
            }

            // 2. TẠO ĐỊNH DANH BLOCKCHAIN (CA & VAULT)
            const chainUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');

            let blockchainNote = '';
            try {
                console.log(`\n [Admin] Đang yêu cầu cấp Identity Blockchain cho Shipper: ${chainUsername}...`);

                const adapterRes = await axios.post(`${BLOCKCHAIN_ADAPTER_URL}/register-user`, {
                    username: chainUsername,
                    role: 'SHIPPER',
                    storeName: display_name || full_name
                });

                if (!adapterRes.data.success) {
                    const errMsg = adapterRes.data.error || adapterRes.data.message || 'Lỗi từ Adapter';
                    console.warn(` [Blockchain] Cảnh báo: ${errMsg}`);
                    blockchainNote = ` (Blockchain chưa đồng bộ: ${errMsg})`;
                } else {
                    console.log(` [Blockchain] Đã cấp Identity thành công cho Shipper: ${chainUsername}`);
                }
            } catch (chainErr) {
                const errorMsg = chainErr.response?.data?.error
                    || chainErr.response?.data?.message
                    || chainErr.message
                    || chainErr.code
                    || 'Lỗi kết nối Adapter';
                console.warn(` [Blockchain] Cảnh báo lỗi cấp CA Identity: ${errorMsg}`);
                blockchainNote = ` (Blockchain chưa đồng bộ: ${errorMsg})`;
            }

            res.status(201).json({
                message: `Tạo tài khoản Shipper thành công.${blockchainNote}`,
                user: createdUser,
                blockchain_id: chainUsername
            });

        } catch (e) {
            const errorMsg = e.response?.data?.error || e.message || String(e);
            console.error(' Lỗi hệ thống khi tạo Shipper:', errorMsg);

            // COMPENSATING TRANSACTION nếu lỗi SQL hoặc AuthService
            if (createdUser && createdUser.id) {
                try {
                    console.log(` [Rollback] Đang tiến hành xóa user ${email} do lỗi hệ thống...`);
                    const client = await pool.connect();
                    await client.query('BEGIN');
                    await client.query('DELETE FROM userroles WHERE userid = $1', [createdUser.id]);
                    await client.query('DELETE FROM usersession WHERE userid = $1', [createdUser.id]);
                    await client.query('DELETE FROM users WHERE id = $1', [createdUser.id]);
                    await client.query('COMMIT');
                    client.release();
                    console.log(` [Rollback] Đã dọn dẹp sạch sẽ user lỗi.`);
                } catch (rollbackErr) {
                    console.error(' [Lỗi Rollback DB]:', rollbackErr.message);
                }
            }

            res.status(500).json({ detail: `Hệ thống gặp sự cố: ${errorMsg}` });
        }
    }

    // PATCH /v1/admin/shippers/:id/toggle — kích hoạt / vô hiệu hóa
    async toggleShipper(req, res) {
        const { id } = req.params;
        try {
            const r = await pool.query(`SELECT id, isactive FROM users WHERE id = $1`, [id]);
            if (r.rows.length === 0) return res.status(404).json({ detail: 'Không tìm thấy tài khoản' });
            const newActive = !r.rows[0].isactive;
            const result = await pool.query(
                `UPDATE users SET isactive = $1 WHERE id = $2 RETURNING id, email, isactive`,
                [newActive, id]
            );
            res.json({ message: newActive ? 'Đã kích hoạt' : 'Đã vô hiệu hóa', user: result.rows[0] });
        } catch (e) {
            console.error('toggleShipper:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        }
    }

    // PUT /v1/admin/shippers/:id/profile — Admin cập nhật profile của shipper
    async updateShipperProfile(req, res) {
        const { id } = req.params;
        const { display_name, description, service_description, logo_url,
            estimated_days_local, estimated_days_national, origin_province, is_active, password } = req.body;

        console.log('🔧 updateShipperProfile called:', { id, display_name, password_length: password?.length || 0, password_empty: !password });

        try {
            // Check if user exists and is shipper
            const userCheck = await pool.query(
                `SELECT u.id FROM users u
                 JOIN userroles ur ON u.id = ur.userid
                 JOIN roles r ON ur.roleid = r.id
                 WHERE u.id::text = $1::text AND r.name = 'SHIPPER'`,
                [id]
            );

            if (userCheck.rows.length === 0) {
                return res.status(404).json({ detail: 'Shipper không tồn tại' });
            }

            // Update password if provided
            if (password && password.trim()) {
                const trimmedPassword = password.trim();
                console.log('🔐 Updating password - length:', trimmedPassword.length, 'first 3 chars:', trimmedPassword.substring(0, 3));
                const hashedPassword = await hashPassword(trimmedPassword);
                console.log('🔐 Hashed - length:', hashedPassword.length, 'first 20:', hashedPassword.substring(0, 20));
                const pwdRes = await pool.query(
                    `UPDATE users SET password_hash = $1 WHERE id::text = $2::text RETURNING id`,
                    [hashedPassword, id]
                );
                console.log('Password updated:', pwdRes.rows.length > 0);
            }

            // Upsert shipper profile
            const result = await pool.query(
                `INSERT INTO shipper_profiles
                 (user_id, display_name, description, service_description, logo_url,
                  estimated_days_local, estimated_days_national, origin_province, is_active, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                 ON CONFLICT (user_id) DO UPDATE SET
                   display_name = COALESCE(EXCLUDED.display_name, shipper_profiles.display_name),
                   description = COALESCE(EXCLUDED.description, shipper_profiles.description),
                   service_description = COALESCE(EXCLUDED.service_description, shipper_profiles.service_description),
                   logo_url = COALESCE(EXCLUDED.logo_url, shipper_profiles.logo_url),
                   estimated_days_local = COALESCE(EXCLUDED.estimated_days_local, shipper_profiles.estimated_days_local),
                   estimated_days_national = COALESCE(EXCLUDED.estimated_days_national, shipper_profiles.estimated_days_national),
                   origin_province = COALESCE(EXCLUDED.origin_province, shipper_profiles.origin_province),
                   is_active = COALESCE(EXCLUDED.is_active, shipper_profiles.is_active),
                   updated_at = NOW()
                 RETURNING *`,
                [id, display_name, description, service_description, logo_url,
                    estimated_days_local, estimated_days_national, origin_province,
                    is_active !== undefined ? is_active : true]
            );

            res.json({
                message: 'Cập nhật thông tin shipper thành công' + (password ? ' (kể cả mật khẩu)' : ''),
                profile: result.rows[0]
            });
        } catch (e) {
            console.error('updateShipperProfile error:', e.message, e.stack);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        }
    }

    // POST /v1/admin/orders/:id/remit-cod
    // COD: DELIVERED + PENDING_REMITTANCE → REMITTED + trừ tiền shipper
    async remitCOD(req, res) {
        const { id } = req.params;
        const adminUserId = req.user.user_id;
        const { simulated_time } = req.query;
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Auto-create shipper_balances table if not exists
            await client.query(`
                CREATE TABLE IF NOT EXISTS shipper_balances (
                    id SERIAL PRIMARY KEY,
                    shipper_id TEXT UNIQUE,
                    cod_holding DECIMAL(10,2) DEFAULT 0.00,
                    total_earnings DECIMAL(10,2) DEFAULT 0.00,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            `);

            // Get order details
            const orderRes = await client.query(`
                SELECT * FROM orders WHERE id = $1
            `, [id]);

            if (orderRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            }

            const order = orderRes.rows[0];

            // Validate COD order conditions
            if ((order.paymentmethod || '').toUpperCase() !== 'COD') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: 'Chỉ xử lý cho đơn hàng COD' });
            }

            if (order.status !== 'DELIVERED') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Đơn hàng phải ở trạng thái DELIVERED (hiện tại: ${order.status})` });
            }

            if (order.codstatus !== 'PENDING_REMITTANCE') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `COD status phải là PENDING_REMITTANCE (hiện tại: ${order.codstatus || 'null'})` });
            }

            const now = simulated_time ? new Date(simulated_time) : new Date();

            // Update order cod_status to REMITTED
            const updateOrderRes = await client.query(`
                UPDATE orders 
                SET codstatus = 'REMITTED', updated_at = $2 
                WHERE id = $1 
                RETURNING id, codstatus, finalprice, carrier_id
            `, [id, now.toISOString()]);

            const updatedOrder = updateOrderRes.rows[0];
            const codAmount = parseFloat(updatedOrder.finalprice || 0);
            const carrierId = updatedOrder.carrier_id;

            // Deduct COD amount from shipper's holding balance
            if (carrierId && codAmount > 0) {
                // Ensure shipper has a wallet/balance record
                await client.query(`
                    INSERT INTO shipper_balances (shipper_id, cod_holding, created_at, updated_at)
                    VALUES ($1, 0, NOW(), NOW())
                    ON CONFLICT (shipper_id) DO NOTHING
                `, [carrierId]);

                // Deduct the COD amount from shipper's holding balance
                const balanceUpdateRes = await client.query(`
                    UPDATE shipper_balances 
                    SET cod_holding = GREATEST(cod_holding - $2, 0), 
                        updated_at = $3
                    WHERE shipper_id = $1
                    RETURNING cod_holding
                `, [carrierId, codAmount, now.toISOString()]);

                if (balanceUpdateRes.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(500).json({ detail: 'Không thể cập nhật số dư shipper' });
                }

                console.log(`RemitCOD: Deducted ${codAmount}₫ from shipper ${carrierId}, new balance: ${balanceUpdateRes.rows[0].cod_holding}₫`);
            }

            // ====== OUTBOX PATTERN: Ghi task remit COD v2 vào outbox ======
            await client.query(
                `INSERT INTO blockchain_outbox (order_id, action, payload) VALUES ($1, $2, $3)`,
                [id, 'REMIT_COD', JSON.stringify({
                    orderID: id,
                    simulatedTime: simulated_time ? now.toISOString() : undefined,
                    requestorOrg: 'platform',
                    requestorUser: 'admin-ca-platform'
                })]
            );
            console.log(` [Outbox] Đã ghi task REMIT_COD (v2) cho đơn ${id}`);

            await client.query('COMMIT');

            res.json({
                success: true,
                message: 'Đã xác nhận tiền COD về túi. Số tiền đã được trừ khỏi tài khoản shipper.',
                order: updatedOrder,
                deducted_amount: codAmount
            });

        } catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            console.error('remitCOD error:', e.message);
            res.status(500).json({ detail: `Lỗi Server: ${e.message}` });
        } finally {
            client.release();
        }
    }

    // POST /v1/admin/orders/:id/payout
    // PREPAID: DELIVERED + hết 5 phút → SETTLED
    // COD: DELIVERED + REMITTED + hết 5 phút → SETTLED
    async payoutToSeller(req, res) {
        const { id } = req.params;
        const { simulated_time } = req.query;

        const client = await pool.connect();
        try {
            const r = await client.query(`
                SELECT o.*, s.taxid as store_tax_code 
                FROM orders o 
                LEFT JOIN store s ON o.storeid::text = s.id::text 
                WHERE o.id = $1
            `, [id]);

            if (r.rows.length === 0) return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });

            const o = r.rows[0];
            if (o.status !== 'DELIVERED')
                return res.status(400).json({ detail: `Đơn hàng phải ở trạng thái DELIVERED (hiện tại: ${o.status})` });

            // ====== BLOCKCHAIN GUARD ======
            const guardPayout = await requireBlockchainSync(id);
            if (guardPayout) {
                return res.status(409).json({ detail: guardPayout.message, sync_status: guardPayout.status });
            }

            const pm = (o.paymentmethod || '').toUpperCase();
            if (pm === 'COD' && o.codstatus !== 'REMITTED')
                return res.status(400).json({ detail: 'Đơn COD phải có CodStatus = REMITTED trước khi thanh toán cho Shop' });

            let vatRate, holdPeriodMinutes;
            try {
                const [taxRes, bizRes] = await Promise.all([
                    axios.get(`${BLOCKCHAIN_ADAPTER_URL}/config/tax?requestorOrg=platform&requestorUser=admin-ca-platform`),
                    axios.get(`${BLOCKCHAIN_ADAPTER_URL}/config/business?requestorOrg=platform&requestorUser=admin-ca-platform`)
                ]);

                if (!taxRes.data?.success || !bizRes.data?.success) {
                    throw new Error("Phản hồi không hợp lệ từ Blockchain");
                }

                vatRate = Number(taxRes.data.data.vatRate);
                holdPeriodMinutes = Number(bizRes.data.data.holdPeriodMinutes);
            } catch (e) {
                return res.status(500).json({ detail: `Không kết nối được cấu hình Hệ thống từ Blockchain: ${e.message}` });
            }

            // 3. Kiểm tra thời hạn giữ tiền (Hold Period)
            const deliveredAt = new Date(o.updated_at);
            const now = simulated_time ? new Date(simulated_time) : new Date();
            const diffMs = now - deliveredAt;

            if (diffMs < holdPeriodMinutes * 60 * 1000) {
                return res.status(400).json({ detail: `Chưa hết thời hạn giữ tiền (${holdPeriodMinutes} phút kể từ khi giao)` });
            }

            const itemsRes = await client.query(`SELECT * FROM orderitem WHERE orderid = $1`, [id]);

            let actualSubTotal = 0;
            const blockchainItems = itemsRes.rows.map(item => {
                const unitPrice = item.promotionalprice !== null ? Number(item.promotionalprice) : Number(item.price);
                actualSubTotal += unitPrice * Number(item.count);

                return {
                    productID: String(item.productid),
                    variantID: item.variantid ? String(item.variantid) : "",
                    productName: item.productname,
                    unitPrice: unitPrice,
                    quantity: Number(item.count)
                };
            });

            // Bắt đầu Transaction Database
            await client.query('BEGIN');

            const result = await client.query(
                `UPDATE orders SET status = 'SETTLED', updated_at = $2 WHERE id = $1 RETURNING id, status, updated_at`,
                [id, now.toISOString()]
            );

            // ====== GHI TRACKING LOG ======
            await logTracking(client, {
                orderId: id,
                status: 'SETTLED',
                codstatus: o.codstatus || null,
                event: 'PAYOUT',
                carrierId: o.carrier_id,
                shipperId: o.shipper_id,
                notes: 'Admin quyết toán đơn hàng cho shop',
                changedBy: null,
                timestamp: now,
            });

            // ====== OUTBOX PATTERN: Ghi task payout vào outbox ======
            const shopDiscount = Number(o.shop_discount || 0);
            const platformDiscount = Number(o.platform_discount || 0);

            const sellerNetIncome = actualSubTotal - shopDiscount;

            const validTaxableRevenue = sellerNetIncome > 0 ? sellerNetIncome : 0;
            const vatAmount = Math.round(validTaxableRevenue * vatRate / 100.0);

            const taxData = {
                orderID: id,
                sellerID: "SellerOrgMSP",
                sellerCompanyID: String(o.storeid),
                sellerTaxCode: o.store_tax_code || "",
                taxableRevenue: validTaxableRevenue,
                vatAmount: vatAmount,
                transactionDate: now.toISOString(),
                note: `Trích lập ${vatRate}% VAT tự động`
            };

            const sellerSettlementData = {
                orderID: id,
                customerID: String(o.user_id),
                items: blockchainItems,
                sellerTaxCode: o.store_tax_code || "",

                FinalPrice: Number(o.finalprice),
                TotalAmount: actualSubTotal,
                vatAmount: vatAmount,
                sellerNetIncome: validTaxableRevenue,
                platformDiscountAmount: platformDiscount,
                shopDiscountAmount: shopDiscount
            };

            await client.query(
                `INSERT INTO blockchain_outbox (order_id, action, payload) VALUES ($1, $2, $3)`,
                [id, 'PAYOUT', JSON.stringify({
                    orderID: id,
                    taxData: taxData,
                    sellerSettlementData: sellerSettlementData,
                    simulatedTime: simulated_time ? now.toISOString() : undefined,
                    requestorOrg: 'platform',
                    requestorUser: 'admin-ca-platform'
                })]
            );
            console.log(` [Outbox] Đã ghi task PAYOUT cho đơn ${id}`);

            await client.query('COMMIT');
            res.json({ message: 'Đã thanh toán cho Shop, đơn hàng kết thúc và ghi nhận Thuế thành công', order: result.rows[0] });

        } catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            console.error('payoutToSeller:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // GET /v1/admin/users?search=&role=&page=1&limit=20
    async getUsers(req, res) {
        const { search = '', role = '', page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        try {
            const params = [];
            const conditions = [];

            if (search.trim()) {
                params.push(`%${search.trim()}%`);
                conditions.push(`(u.email ILIKE $${params.length} OR u.firstname ILIKE $${params.length} OR u.lastname ILIKE $${params.length} OR u.phone ILIKE $${params.length})`);
            }
            if (role.trim()) {
                params.push(role.trim());
                conditions.push(`u.role = $${params.length}`);
            }

            const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
            const countParams = [...params];
            const dataParams = [...params, parseInt(limit), offset];
            const lIdx = params.length + 1;
            const oIdx = params.length + 2;

            const [dataRes, countRes] = await Promise.all([
                pool.query(
                    `SELECT u.id, u.email, u.firstname, u.lastname, u.phone, u.role, u.isactive, u.created_at,
                            array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) AS roles
                     FROM users u
                     LEFT JOIN userroles ur ON ur.userid = u.id
                     LEFT JOIN roles r ON r.id = ur.roleid
                     ${where}
                     GROUP BY u.id
                     ORDER BY u.created_at DESC
                     LIMIT $${lIdx} OFFSET $${oIdx}`,
                    dataParams
                ),
                pool.query(`SELECT COUNT(DISTINCT u.id) FROM users u ${where}`, countParams)
            ]);

            res.json({ users: dataRes.rows, total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
        } catch (e) {
            console.error('getUsers:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        }
    }

    // GET /v1/admin/users/:id
    async getUserById(req, res) {
        const { id } = req.params;
        try {
            const result = await pool.query(
                `SELECT u.id, u.email, u.firstname, u.lastname, u.phone, u.role, u.isactive, u.created_at,
                        array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) AS roles
                 FROM users u
                 LEFT JOIN userroles ur ON ur.userid = u.id
                 LEFT JOIN roles r ON r.id = ur.roleid
                 WHERE u.id = $1
                 GROUP BY u.id`,
                [id]
            );
            if (!result.rows.length) return res.status(404).json({ detail: 'Không tìm thấy người dùng' });
            res.json({ user: result.rows[0] });
        } catch (e) {
            console.error('getUserById:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        }
    }

    // POST /v1/admin/users
    async createUser(req, res) {
        const { email, password, firstname, lastname, phone, role = 'CUSTOMER' } = req.body;
        if (!email || !password) return res.status(400).json({ detail: 'Email và mật khẩu là bắt buộc' });
        try {
            const newUser = await require('../services/auth.service').register(
                { email, password, full_name: `${firstname || ''} ${lastname || ''}`.trim() || email, phone_number: phone || '' },
                role
            );
            res.status(201).json({ message: 'Đã tạo người dùng', user: newUser });
        } catch (e) {
            if (e.code === '23505') return res.status(400).json({ detail: 'Email đã tồn tại' });
            console.error('createUser:', e.message);
            res.status(500).json({ detail: e.message });
        }
    }

    // PUT /v1/admin/users/:id
    async updateUser(req, res) {
        const { id } = req.params;
        const { firstname, lastname, phone, role, isactive } = req.body;
        try {
            const updates = [];
            const params = [];

            if (firstname !== undefined) { params.push(firstname); updates.push(`firstname = $${params.length}`); }
            if (lastname !== undefined) { params.push(lastname); updates.push(`lastname = $${params.length}`); }
            if (phone !== undefined) { params.push(phone); updates.push(`phone = $${params.length}`); }
            if (role !== undefined) { params.push(role); updates.push(`role = $${params.length}`); }
            if (isactive !== undefined) { params.push(isactive); updates.push(`isactive = $${params.length}`); }

            if (!updates.length) return res.status(400).json({ detail: 'Không có thông tin cập nhật' });

            params.push(id);
            const result = await pool.query(
                `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING id, email, firstname, lastname, phone, role, isactive`,
                params
            );
            if (!result.rows.length) return res.status(404).json({ detail: 'Không tìm thấy người dùng' });
            res.json({ message: 'Đã cập nhật người dùng', user: result.rows[0] });
        } catch (e) {
            console.error('updateUser:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        }
    }

    // DELETE /v1/admin/users/:id
    async deleteUser(req, res) {
        const { id } = req.params;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM userroles WHERE userid = $1', [id]);
            const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING id, email', [id]);
            if (!result.rows.length) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy người dùng' });
            }
            await client.query('COMMIT');
            res.json({ message: `Đã xóa người dùng ${result.rows[0].email}` });
        } catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            console.error('deleteUser:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // PATCH /v1/admin/users/:id/toggle
    async toggleUser(req, res) {
        const { id } = req.params;
        try {
            const result = await pool.query(
                `UPDATE users SET isactive = NOT isactive WHERE id = $1 RETURNING id, email, isactive`,
                [id]
            );
            if (!result.rows.length) return res.status(404).json({ detail: 'Không tìm thấy người dùng' });
            const u = result.rows[0];
            res.json({ message: u.isactive ? `Đã kích hoạt ${u.email}` : `Đã khóa ${u.email}`, user: u });
        } catch (e) {
            console.error('toggleUser:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        }
    }

    // ─── PAYOUTS / ĐỐI SOÁT ──────────────────────────────────────────

    /**
     * GET /v1/admin/payouts
     * List all SETTLED orders (payout history) with VAT info
     * Query: ?search=&store=&page=1&limit=20&from=&to=
     */
    async getPayouts(req, res) {
        const { search = '', store = '', page = 1, limit = 20, from, to } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        try {
            const params = [];
            const conds = [`o.status = 'SETTLED'`];

            if (search) {
                params.push(`%${search}%`);
                conds.push(`(o.id::text ILIKE $${params.length} OR o.storename ILIKE $${params.length} OR s.taxid ILIKE $${params.length})`);
            }
            if (store) {
                params.push(`%${store}%`);
                conds.push(`o.storename ILIKE $${params.length}`);
            }
            if (from) {
                params.push(from);
                conds.push(`o.updated_at >= $${params.length}`);
            }
            if (to) {
                params.push(to);
                conds.push(`o.updated_at <= $${params.length}::date + interval '1 day'`);
            }

            const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
            const countParams = [...params];
            params.push(parseInt(limit), offset);
            const lIdx = params.length - 1;
            const oIdx = params.length;

            const [dataRes, countRes, statsRes] = await Promise.all([
                pool.query(
                    `SELECT o.id, o.updated_at AS settled_at, o.created_at,
                            o.storeid, o.storename, s.taxid AS store_tax_code,
                            o.paymentmethod, o.finalprice, o.price, o.deliveryprice,
                            o.shop_discount, o.platform_discount, o.codstatus,
                            u.firstname, u.lastname, u.email AS buyer_email
                     FROM orders o
                     LEFT JOIN store s ON o.storeid::text = s.id::text
                     LEFT JOIN users u ON o.user_id = u.id
                     ${where}
                     ORDER BY o.updated_at DESC
                     LIMIT $${lIdx} OFFSET $${oIdx}`,
                    params
                ),
                pool.query(
                    `SELECT COUNT(*) FROM orders o LEFT JOIN store s ON o.storeid::text = s.id::text ${where}`,
                    countParams
                ),
                pool.query(
                    `SELECT
                        COUNT(*) AS total_orders,
                        COALESCE(SUM(o.finalprice), 0) AS total_revenue,
                        COALESCE(SUM(o.price - COALESCE(o.shop_discount,0)), 0) AS total_seller_gross
                     FROM orders o LEFT JOIN store s ON o.storeid::text = s.id::text
                     ${where}`,
                    countParams
                )
            ]);

            res.json({
                payouts: dataRes.rows.map(r => ({
                    ...r,
                    buyer_name: `${r.firstname || ''} ${r.lastname || ''}`.trim() || r.buyer_email
                })),
                total: parseInt(countRes.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit),
                stats: {
                    total_orders: parseInt(statsRes.rows[0].total_orders),
                    total_revenue: parseFloat(statsRes.rows[0].total_revenue),
                    total_seller_gross: parseFloat(statsRes.rows[0].total_seller_gross),
                }
            });
        } catch (e) {
            console.error('getPayouts:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        }
    }

    // ─── BLOCKCHAIN CONFIG ───────────────────────────────────────────────

    /**
     * GET /v1/admin/config
     * Proxy to read both /config/tax and /config/business from Blockchain Adapter
     */
    async getBlockchainConfig(req, res) {
        try {
            const [taxRes, bizRes] = await Promise.all([
                axios.get(`${BLOCKCHAIN_ADAPTER_URL}/config/tax?requestorOrg=platform&requestorUser=admin-ca-platform`),
                axios.get(`${BLOCKCHAIN_ADAPTER_URL}/config/business?requestorOrg=platform&requestorUser=admin-ca-platform`)
            ]);
            res.json({
                tax: taxRes.data?.data || null,
                business: bizRes.data?.data || null,
                tax_raw: taxRes.data,
                business_raw: bizRes.data
            });
        } catch (e) {
            const msg = e.response?.data?.error || e.message || 'Lỗi kết nối Adapter';
            console.error('getBlockchainConfig:', msg);
            res.status(500).json({ detail: `Không lấy được cấu hình từ Blockchain: ${msg}` });
        }
    }

    /**
     * POST /v1/admin/config/tax
     * Proxy: forward vatRate to Blockchain Adapter POST /config/tax
     * Body: { vatRate: number }
     */
    async setTaxConfig(req, res) {
        const { vatRate } = req.body;
        if (vatRate === undefined || vatRate === null || isNaN(Number(vatRate))) {
            return res.status(400).json({ detail: 'vatRate là bắt buộc và phải là số' });
        }
        const rate = Number(vatRate);
        if (rate < 0 || rate > 100) {
            return res.status(400).json({ detail: 'vatRate phải nằm trong khoảng 0-100' });
        }
        try {
            const adapterRes = await axios.post(`${BLOCKCHAIN_ADAPTER_URL}/config/tax`, {
                vatRate: rate,
                requestorOrg: 'platform',
                requestorUser: 'admin-ca-platform'
            });
            if (!adapterRes.data?.success) {
                throw new Error(adapterRes.data?.error || adapterRes.data?.message || 'Lỗi từ Adapter');
            }
            console.log(`[Config] Cập nhật VAT Rate: ${rate}%`);
            res.json({ success: true, message: `Đã cập nhật VAT Rate thành ${rate}%`, vatRate: rate });
        } catch (e) {
            const msg = e.response?.data?.error || e.message;
            console.error('setTaxConfig:', msg);
            res.status(500).json({ detail: `Lỗi cập nhật thuế: ${msg}` });
        }
    }

    /**
     * POST /v1/admin/config/business
     * Proxy: forward holdPeriodMinutes & returnWindowMinutes to Blockchain Adapter
     * Body: { holdPeriodMinutes: number, returnWindowMinutes: number }
     */
    async setBusinessConfig(req, res) {
        const { holdPeriodMinutes, returnWindowMinutes } = req.body;
        if (holdPeriodMinutes === undefined || returnWindowMinutes === undefined) {
            return res.status(400).json({ detail: 'holdPeriodMinutes và returnWindowMinutes là bắt buộc' });
        }
        const hold = Number(holdPeriodMinutes);
        const ret = Number(returnWindowMinutes);
        if (isNaN(hold) || hold < 0) return res.status(400).json({ detail: 'holdPeriodMinutes phải là số dương' });
        if (isNaN(ret) || ret < 0) return res.status(400).json({ detail: 'returnWindowMinutes phải là số dương' });
        try {
            const adapterRes = await axios.post(`${BLOCKCHAIN_ADAPTER_URL}/config/business`, {
                holdPeriodMinutes: hold,
                returnWindowMinutes: ret,
                requestorOrg: 'platform',
                requestorUser: 'admin-ca-platform'
            });
            if (!adapterRes.data?.success) {
                throw new Error(adapterRes.data?.error || adapterRes.data?.message || 'Lỗi từ Adapter');
            }
            console.log(`[Config] Cập nhật Business Rules: hold=${hold}ph, return=${ret}ph`);
            res.json({
                success: true,
                message: `Đã cập nhật: Giữ tiền ${hold} phút, Hoàn hàng ${ret} phút`,
                holdPeriodMinutes: hold,
                returnWindowMinutes: ret
            });
        } catch (e) {
            const msg = e.response?.data?.error || e.message;
            console.error('setBusinessConfig:', msg);
            res.status(500).json({ detail: `Lỗi cập nhật Business Rules: ${msg}` });
        }
    }
}

module.exports = new AdminController();
