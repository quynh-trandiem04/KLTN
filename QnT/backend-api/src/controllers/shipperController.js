// backend-api/src/controllers/shipperController.js
const pool = require('../config/database');
const storageService = require('../services/storage.service');
const { requireBlockchainSync } = require('../services/blockchainGuard');
const { logTracking } = require('../services/trackingService');

class ShipperController {

    // GET /v1/shipper/dashboard-stats
    async getDashboardStats(req, res) {
        const shipperId = req.user.user_id;
        const client = await pool.connect();
        try {
            console.log('Shipper Dashboard Debug:', {
                shipperId: shipperId,
                shipperIdType: typeof shipperId
            });

            // Debug: Check all orders for this shipper
            const debugRes = await client.query(`
                SELECT status, COUNT(*) as count
                FROM orders 
                WHERE carrier_id::text = $1::text
                GROUP BY status
                ORDER BY status
            `, [shipperId]);
            console.log('🚚 Orders by status for shipper:', debugRes.rows);

            const [statsRes, recentRes] = await Promise.all([
                client.query(`
                    SELECT
                        COUNT(*) AS total,
                        COUNT(*) FILTER (WHERE status = 'SHIPPED') AS shipping,
                        COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
                        COUNT(*) FILTER (WHERE status = 'DELIVERED' AND updated_at >= date_trunc('day', NOW())) AS delivered_today,
                        COUNT(*) FILTER (WHERE status IN ('CREATED', 'PAID')) AS pending_pickup,
                        COALESCE(SUM(CASE WHEN status = 'DELIVERED' AND paymentmethod = 'COD' AND codstatus = 'PENDING_REMITTANCE' THEN finalprice ELSE 0 END), 0) AS cod_holding
                    FROM orders
                    WHERE carrier_id::text = $1::text
                `, [shipperId]),
                client.query(`
                    SELECT o.id, o.status, o.paymentmethod, o.codstatus, o.finalprice,
                           o.storename, o.created_at, o.updated_at,
                           o.shippingaddressline1, o.shippingcity,
                           CONCAT(u.firstname,' ',u.lastname) AS buyer_name, u.phone AS buyer_phone
                    FROM orders o
                    LEFT JOIN users u ON o.user_id::text = u.id::text
                    WHERE o.carrier_id::text = $1::text
                    ORDER BY o.updated_at DESC LIMIT 5
                `, [shipperId]),
            ]);

            console.log('Shipper Stats Result:', statsRes.rows[0]);
            console.log('Recent Orders Count:', recentRes.rows.length);

            res.json({ stats: statsRes.rows[0], recent_orders: recentRes.rows });
        } catch (e) {
            console.error('shipper getDashboardStats:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // GET /v1/shipper/orders
    async getOrders(req, res) {
        const shipperId = req.user.user_id;
        const { status, search, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        const client = await pool.connect();
        try {
            const countParams = [shipperId];
            let whereClause = 'WHERE o.carrier_id::text = $1::text';

            if (status) {
                countParams.push(status);
                whereClause += ` AND o.status = $${countParams.length}`;
            }

            if (search && search.trim()) {
                countParams.push(`%${search}%`);
                whereClause += ` AND (
                  o.id::text ILIKE $${countParams.length} OR
                  CONCAT(u.firstname,' ',u.lastname) ILIKE $${countParams.length} OR
                  u.email ILIKE $${countParams.length}
                )`;
            }

            const mainParams = [...countParams, parseInt(limit), parseInt(offset)];
            const limitIdx = mainParams.length - 1;
            const offsetIdx = mainParams.length;

            const result = await client.query(
                `SELECT o.id, o.status, o.paymentmethod, o.codstatus, o.finalprice, o.price, o.deliveryprice,
                        o.storeid, o.storename, o.created_at, o.updated_at,
                        o.shippingaddressline1, o.shippingaddressline2, o.shippingcity, o.shippingdistrict, o.shippingphone,
                        CONCAT(u.firstname,' ',u.lastname) AS buyer_name, u.email AS buyer_email
                 FROM orders o
                 LEFT JOIN users u ON CAST(o.user_id AS text) = CAST(u.id AS text)
                 ${whereClause}
                 ORDER BY o.created_at DESC
                 LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
                mainParams
            );

            const countResult = await client.query(
                `SELECT COUNT(*) FROM orders o
                 LEFT JOIN users u ON CAST(o.user_id AS text) = CAST(u.id AS text)
                 ${whereClause}`,
                countParams
            );

            res.json({ orders: result.rows, total: parseInt(countResult.rows[0].count) });
        } catch (e) {
            console.error('shipper getOrders:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // POST /v1/shipper/orders/:id/ship
    // COD: CREATED → SHIPPED; PREPAID: PAID → SHIPPED
    async shipOrder(req, res) {
        const { id } = req.params;
        const { simulated_time } = req.query;
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const orderRes = await client.query(`SELECT * FROM orders WHERE id = $1`, [id]);
            if (orderRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            }

            const order = orderRes.rows[0];
            const pm = (order.paymentmethod || '').toUpperCase();

            if (pm === 'COD' && order.status !== 'CREATED') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Đơn COD phải ở trạng thái CREATED để lấy hàng (hiện tại: ${order.status})` });
            }
            if (pm === 'PREPAID' && order.status !== 'PAID') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Đơn PREPAID phải ở trạng thái PAID để lấy hàng (hiện tại: ${order.status})` });
            }

            // ====== BLOCKCHAIN GUARD ======
            const guard = await requireBlockchainSync(id, client);
            if (guard) {
                await client.query('ROLLBACK');
                return res.status(409).json({ detail: guard.message, sync_status: guard.status });
            }

            const now = simulated_time ? new Date(simulated_time) : new Date();

            const result = await client.query(
                `UPDATE orders SET status = 'SHIPPED', shipper_id = $2, updated_at = $3 WHERE id = $1 RETURNING id, status, updated_at`,
                [id, req.user.user_id, now.toISOString()]
            );

            // ====== GHI TRACKING LOG ======
            await logTracking(client, {
                orderId: id,
                status: 'SHIPPED',
                codstatus: order.codstatus || null,
                event: 'SHIP_ORDER',
                carrierId: order.carrier_id,
                shipperId: req.user.user_id,
                currentLocation: 'Đang vận chuyển',
                notes: 'Shipper đã lấy hàng và bắt đầu giao',
                changedBy: req.user.user_id,
                timestamp: now,
            });

            // ====== OUTBOX PATTERN: Ghi task lấy hàng vào outbox ======
            const chainUsername = req.user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
            await client.query(
                `INSERT INTO blockchain_outbox (order_id, action, payload) VALUES ($1, $2, $3)`,
                [id, 'SHIP_ORDER', JSON.stringify({
                    orderID: id,
                    simulatedTime: simulated_time ? now.toISOString() : undefined,
                    requestorOrg: 'shipper',
                    requestorUser: chainUsername
                })]
            );
            console.log(` [Outbox] Đã ghi task SHIP_ORDER cho đơn ${id} (shipper: ${chainUsername})`);

            await client.query('COMMIT');
            res.json({ message: 'Đã xác nhận lấy hàng thành công', order: result.rows[0] });

        } catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            console.error('shipOrder error:', e.message);
            res.status(500).json({ detail: `Lỗi Server: ${e.message}` });
        } finally {
            client.release();
        }
    }

    // POST /v1/shipper/orders/:id/deliver
    // PREPAID: SHIPPED → DELIVERED
    async confirmDelivery(req, res) {
        const { id } = req.params;
        const { simulated_time } = req.query;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const orderRes = await client.query(`SELECT * FROM orders WHERE id = $1`, [id]);
            if (orderRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            }

            const order = orderRes.rows[0];
            if (order.status !== 'SHIPPED') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Đơn hàng phải ở trạng thái SHIPPED (hiện tại: ${order.status})` });
            }
            if ((order.paymentmethod || '').toUpperCase() !== 'PREPAID') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: 'Hãy dùng deliver-cod cho đơn COD' });
            }

            // ====== BLOCKCHAIN GUARD ======
            const guardDel = await requireBlockchainSync(id, client);
            if (guardDel) {
                await client.query('ROLLBACK');
                return res.status(409).json({ detail: guardDel.message, sync_status: guardDel.status });
            }

            const now = simulated_time ? new Date(simulated_time) : new Date();

            const result = await client.query(
                `UPDATE orders SET status = 'DELIVERED', updated_at = $2 WHERE id = $1 RETURNING id, status, updated_at`,
                [id, now.toISOString()]
            );

            // ====== GHI TRACKING LOG ======
            await logTracking(client, {
                orderId: id,
                status: 'DELIVERED',
                codstatus: order.codstatus || null,
                event: 'CONFIRM_DELIVERY',
                carrierId: order.carrier_id,
                shipperId: req.user.user_id,
                currentLocation: 'Đã giao đến người nhận',
                notes: 'Giao hàng thành công (PREPAID)',
                changedBy: req.user.user_id,
                timestamp: now,
            });

            // ====== OUTBOX PATTERN: Ghi task giao hàng PREPAID vào outbox ======
            const chainUsername = req.user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
            await client.query(
                `INSERT INTO blockchain_outbox (order_id, action, payload) VALUES ($1, $2, $3)`,
                [id, 'CONFIRM_DELIVERY', JSON.stringify({
                    orderID: id,
                    simulatedTime: simulated_time ? now.toISOString() : undefined,
                    requestorOrg: 'shipper',
                    requestorUser: chainUsername
                })]
            );
            console.log(` [Outbox] Đã ghi task CONFIRM_DELIVERY cho đơn ${id} (shipper: ${chainUsername})`);

            await client.query('COMMIT');
            res.json({ message: 'Đã xác nhận giao hàng thành công', order: result.rows[0] });

        } catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            console.error('confirmDelivery error:', e.message);
            res.status(500).json({ detail: `Lỗi Server: ${e.message}` });
        } finally {
            client.release();
        }
    }

    // POST /v1/shipper/orders/:id/deliver-cod
    // COD: SHIPPED → DELIVERED + codstatus = PENDING_REMITTANCE
    async confirmCODDelivery(req, res) {
        const { id } = req.params;
        const { simulated_time } = req.query;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const orderRes = await client.query(`SELECT * FROM orders WHERE id = $1`, [id]);
            if (orderRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            }

            const order = orderRes.rows[0];
            if (order.status !== 'SHIPPED') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Đơn hàng phải ở trạng thái SHIPPED (hiện tại: ${order.status})` });
            }
            if ((order.paymentmethod || '').toUpperCase() !== 'COD') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: 'Hãy dùng deliver cho đơn PREPAID' });
            }

            // ====== BLOCKCHAIN GUARD ======
            const guardCod = await requireBlockchainSync(id, client);
            if (guardCod) {
                await client.query('ROLLBACK');
                return res.status(409).json({ detail: guardCod.message, sync_status: guardCod.status });
            }

            const now = simulated_time ? new Date(simulated_time) : new Date();

            const result = await client.query(
                `UPDATE orders SET status = 'DELIVERED', codstatus = 'PENDING_REMITTANCE', updated_at = $2 WHERE id = $1 RETURNING id, status, codstatus, updated_at`,
                [id, now.toISOString()]
            );

            // ====== GHI TRACKING LOG ======
            await logTracking(client, {
                orderId: id,
                status: 'DELIVERED',
                codstatus: 'PENDING_REMITTANCE',
                event: 'CONFIRM_COD_DELIVERY',
                carrierId: order.carrier_id,
                shipperId: req.user.user_id,
                currentLocation: 'Đã giao đến người nhận',
                notes: 'Giao hàng COD thành công — đang chờ nộp tiền',
                changedBy: req.user.user_id,
                timestamp: now,
            });

            // ====== OUTBOX PATTERN: Ghi task giao hàng COD vào outbox ======
            const chainUsername = req.user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
            await client.query(
                `INSERT INTO blockchain_outbox (order_id, action, payload) VALUES ($1, $2, $3)`,
                [id, 'CONFIRM_COD_DELIVERY', JSON.stringify({
                    orderID: id,
                    simulatedTime: simulated_time ? now.toISOString() : undefined,
                    requestorOrg: 'shipper',
                    requestorUser: chainUsername
                })]
            );
            console.log(` [Outbox] Đã ghi task CONFIRM_COD_DELIVERY cho đơn ${id} (shipper: ${chainUsername})`);

            await client.query('COMMIT');
            res.json({
                message: 'Giao hàng COD thành công, hệ thống đã cập nhật.',
                order: result.rows[0]
            });

        } catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            console.error('confirmCODDelivery error:', e.message);
            res.status(500).json({ detail: `Lỗi Server: ${e.message}` });
        } finally {
            client.release();
        }
    }

    // POST /v1/shipper/orders/:id/ship-return
    // RETURN_REQUESTED → RETURN_IN_TRANSIT
    async shipReturn(req, res) {
        const { id } = req.params;
        const { simulated_time } = req.query;
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const orderRes = await client.query(`SELECT * FROM orders WHERE id = $1`, [id]);
            if (orderRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            }

            const order = orderRes.rows[0];
            if (order.status !== 'RETURN_REQUESTED') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Đơn hàng phải ở trạng thái RETURN_REQUESTED (hiện tại: ${order.status})` });
            }

            // ====== BLOCKCHAIN GUARD ======
            const guardRet = await requireBlockchainSync(id, client);
            if (guardRet) {
                await client.query('ROLLBACK');
                return res.status(409).json({ detail: guardRet.message, sync_status: guardRet.status });
            }

            const now = simulated_time ? new Date(simulated_time) : new Date();

            const result = await client.query(
                `UPDATE orders SET status = 'RETURN_IN_TRANSIT', updated_at = $2 WHERE id = $1 RETURNING id, status, updated_at`,
                [id, now.toISOString()]
            );

            // ====== GHI TRACKING LOG ======
            await logTracking(client, {
                orderId: id,
                status: 'RETURN_IN_TRANSIT',
                codstatus: order.codstatus || null,
                event: 'SHIP_RETURN',
                carrierId: order.carrier_id,
                shipperId: req.user.user_id,
                currentLocation: 'Đang vận chuyển hoàn hàng',
                notes: 'Shipper đã lấy hàng hoàn từ khách',
                changedBy: req.user.user_id,
                timestamp: now,
            });

            // ====== OUTBOX PATTERN: Ghi task ship return vào outbox ======
            const chainUsername = req.user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
            await client.query(
                `INSERT INTO blockchain_outbox (order_id, action, payload) VALUES ($1, $2, $3)`,
                [id, 'SHIP_RETURN', JSON.stringify({
                    orderID: id,
                    simulatedTime: simulated_time ? now.toISOString() : undefined,
                    requestorOrg: 'shipper',
                    requestorUser: chainUsername
                })]
            );
            console.log(` [Outbox] Đã ghi task SHIP_RETURN cho đơn ${id} (shipper: ${chainUsername})`);

            await client.query('COMMIT');
            res.json({ message: 'Đã lấy hàng hoàn trả từ khách thành công', order: result.rows[0] });

        } catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            console.error('shipReturn error:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // GET /v1/shipper/profile — lấy profile của shipper hiện tại
    async getProfile(req, res) {
        const shipperId = req.user.user_id;
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM shipper_profiles WHERE user_id = $1`,
                [shipperId]
            );
            res.json({ profile: result.rows[0] || null });
        } catch (e) {
            console.error('getProfile:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // PUT /v1/shipper/profile — upsert profile
    async upsertProfile(req, res) {
        const shipperId = req.user.user_id;
        const { display_name, description, logo_url, service_description, estimated_days_local, estimated_days_national, origin_province } = req.body;
        if (!display_name) {
            return res.status(400).json({ detail: 'display_name là bắt buộc' });
        }
        const client = await pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO shipper_profiles (user_id, display_name, description, logo_url, service_description, estimated_days_local, estimated_days_national, origin_province, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                 ON CONFLICT (user_id) DO UPDATE SET
                   display_name = EXCLUDED.display_name,
                   description = EXCLUDED.description,
                   logo_url = EXCLUDED.logo_url,
                   service_description = EXCLUDED.service_description,
                   estimated_days_local = EXCLUDED.estimated_days_local,
                   estimated_days_national = EXCLUDED.estimated_days_national,
                   origin_province = EXCLUDED.origin_province,
                   updated_at = NOW()
                 RETURNING *`,
                [shipperId, display_name, description || null, logo_url || null, service_description || null,
                    estimated_days_local || '1-2', estimated_days_national || '3-5',
                    origin_province || 'Hồ Chí Minh']
            );
            res.json({ profile: result.rows[0] });
        } catch (e) {
            console.error('upsertProfile:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // POST /v1/shipper/profile/upload-logo — Upload shipper logo
    async uploadLogo(req, res) {
        const shipperId = req.user.user_id;

        try {
            // Check if file exists
            if (!req.file) {
                return res.status(400).json({ detail: 'Vui lòng chọn file ảnh để upload' });
            }

            // Upload to cloud storage
            const logoUrl = await storageService.uploadShipperLogo(
                req.file.buffer,
                req.file.originalname,
                req.file.mimetype,
                shipperId
            );

            // Update logo_url in database
            const client = await pool.connect();
            try {
                // Get old logo URL to delete later
                const oldResult = await client.query(
                    `SELECT logo_url FROM shipper_profiles WHERE user_id = $1`,
                    [shipperId]
                );
                const oldLogoUrl = oldResult.rows[0]?.logo_url;

                // Update with new logo URL
                const result = await client.query(
                    `INSERT INTO shipper_profiles (user_id, logo_url, updated_at)
                     VALUES ($1, $2, NOW())
                     ON CONFLICT (user_id) DO UPDATE SET
                       logo_url = EXCLUDED.logo_url,
                       updated_at = NOW()
                     RETURNING *`,
                    [shipperId, logoUrl]
                );

                // Delete old logo if exists (async, don't wait)
                if (oldLogoUrl && oldLogoUrl !== logoUrl) {
                    storageService.deleteFile(oldLogoUrl).catch(err =>
                        console.warn('Failed to delete old logo:', err.message)
                    );
                }

                res.json({
                    logo_url: logoUrl,
                    message: 'Upload logo thành công',
                    profile: result.rows[0]
                });
            } finally {
                client.release();
            }

        } catch (error) {
            console.error('uploadLogo error:', error.message);
            res.status(500).json({ detail: 'Lỗi upload logo: ' + error.message });
        }
    }

    // GET /v1/shipper/rates — lấy bảng giá của shipper hiện tại
    async getRates(req, res) {
        const shipperId = req.user.user_id;
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT id, zone, weight_from, weight_to, base_fee, per_kg_fee
                 FROM shipping_rates WHERE shipper_id = $1
                 ORDER BY zone, weight_from`,
                [shipperId]
            );
            res.json({ rates: result.rows });
        } catch (e) {
            console.error('getRates:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // PUT /v1/shipper/rates — thay thế toàn bộ bảng giá
    async replaceRates(req, res) {
        const shipperId = req.user.user_id;
        const { rates } = req.body;
        if (!Array.isArray(rates)) {
            return res.status(400).json({ detail: 'rates phải là mảng' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`DELETE FROM shipping_rates WHERE shipper_id = $1 AND service_id IS NULL`, [shipperId]);
            for (const r of rates) {
                await client.query(
                    `INSERT INTO shipping_rates (shipper_id, zone, weight_from, weight_to, base_fee, per_kg_fee)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [shipperId, r.zone, r.weight_from || 0, r.weight_to != null ? r.weight_to : null,
                        r.base_fee || 0, r.per_kg_fee || 0]
                );
            }
            await client.query('COMMIT');
            const result = await client.query(
                `SELECT id, zone, weight_from, weight_to, base_fee, per_kg_fee
                 FROM shipping_rates WHERE shipper_id = $1 AND service_id IS NULL ORDER BY zone, weight_from`,
                [shipperId]
            );
            res.json({ rates: result.rows });
        } catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            console.error('replaceRates:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // GET /v1/shipper/services
    async getServices(req, res) {
        const shipperId = req.user.user_id;
        const client = await pool.connect();
        try {
            const svcRes = await client.query(
                `SELECT s.*,
                  (SELECT json_agg(r ORDER BY r.zone_type, r.weight_from)
                   FROM shipping_rates r WHERE r.service_id = s.id) AS rates
                 FROM shipping_services s WHERE s.carrier_id = $1 ORDER BY s.sort_order, s.id`,
                [shipperId]
            );
            res.json({ services: svcRes.rows });
        } catch (e) {
            console.error('getServices:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally { client.release(); }
    }

    // PUT /v1/shipper/services — replace all services + rates
    async replaceServices(req, res) {
        const shipperId = req.user.user_id;
        const { services } = req.body;
        if (!Array.isArray(services)) return res.status(400).json({ detail: 'services phải là mảng' });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const oldSvcs = await client.query(`SELECT id FROM shipping_services WHERE carrier_id = $1`, [shipperId]);
            for (const svc of oldSvcs.rows) {
                await client.query(`DELETE FROM shipping_rates WHERE service_id = $1`, [svc.id]);
            }
            await client.query(`DELETE FROM shipping_services WHERE carrier_id = $1`, [shipperId]);

            const result = [];
            for (let i = 0; i < services.length; i++) {
                const s = services[i];
                const svcRes = await client.query(
                    `INSERT INTO shipping_services (carrier_id, service_code, service_name, is_active, estimated_days_noi_thanh, estimated_days_noi_tinh, estimated_days_lien_tinh, sort_order)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
                    [shipperId, s.service_code || 'STANDARD', s.service_name || 'Dịch vụ', s.is_active !== false,
                        s.estimated_days_noi_thanh || '1', s.estimated_days_noi_tinh || '1-2', s.estimated_days_lien_tinh || '3-5', i]
                );
                const svcId = svcRes.rows[0].id;
                const rates = s.rates || [];
                for (const r of rates) {
                    const legacyZone = (r.zone_type === 'lien_tinh') ? 'national' : 'local';
                    await client.query(
                        `INSERT INTO shipping_rates (shipper_id, service_id, zone, zone_type, weight_from, weight_to, base_fee, per_kg_fee)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                        [shipperId, svcId, legacyZone, r.zone_type || 'lien_tinh', Number(r.weight_from) || 0,
                            r.weight_to != null && r.weight_to !== '' ? Number(r.weight_to) : null,
                            Number(r.base_fee) || 0, Number(r.per_kg_fee) || 0]
                    );
                }
                result.push({ id: svcId, ...s });
            }
            await client.query('COMMIT');
            res.json({ services: result });
        } catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            console.error('replaceServices:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally { client.release(); }
    }

    // GET /v1/shipper/surcharges
    async getSurcharges(req, res) {
        const shipperId = req.user.user_id;
        const client = await pool.connect();
        try {
            const result = await client.query(`SELECT * FROM shipping_surcharges WHERE carrier_id = $1`, [shipperId]);
            res.json({ surcharges: result.rows[0] || { carrier_id: shipperId, cod_fee_percent: 1.0, cod_fee_min: 10000, cod_fee_max: 0, insurance_fee_percent: 0.5, remote_area_fee: 0, fuel_surcharge_percent: 0 } });
        } catch (e) {
            console.error('getSurcharges:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally { client.release(); }
    }

    // PUT /v1/shipper/surcharges
    async upsertSurcharges(req, res) {
        const shipperId = req.user.user_id;
        const { cod_fee_percent, cod_fee_min, cod_fee_max, insurance_fee_percent, remote_area_fee, fuel_surcharge_percent } = req.body;
        const client = await pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO shipping_surcharges (carrier_id, cod_fee_percent, cod_fee_min, cod_fee_max, insurance_fee_percent, remote_area_fee, fuel_surcharge_percent, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
                 ON CONFLICT (carrier_id) DO UPDATE SET
                   cod_fee_percent=EXCLUDED.cod_fee_percent, cod_fee_min=EXCLUDED.cod_fee_min,
                   cod_fee_max=EXCLUDED.cod_fee_max, insurance_fee_percent=EXCLUDED.insurance_fee_percent,
                   remote_area_fee=EXCLUDED.remote_area_fee, fuel_surcharge_percent=EXCLUDED.fuel_surcharge_percent,
                   updated_at=NOW()
                 RETURNING *`,
                [shipperId, cod_fee_percent || 0, cod_fee_min || 0, cod_fee_max || 0, insurance_fee_percent || 0, remote_area_fee || 0, fuel_surcharge_percent || 0]
            );
            res.json({ surcharges: result.rows[0] });
        } catch (e) {
            console.error('upsertSurcharges:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally { client.release(); }
    }

}

module.exports = new ShipperController();
