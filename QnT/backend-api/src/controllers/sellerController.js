// backend-api/src/controllers/sellerController.js
const pool = require('../config/database');
const { requireBlockchainSync } = require('../services/blockchainGuard');
const { logTracking } = require('../services/trackingService');

class SellerController {

    /**
     * Resolve store.id (integer) from store.ownerid (UUID)
     */
    async _getStoreId(client, userId) {
        const result = await client.query('SELECT id FROM store WHERE ownerid = $1', [userId]);
        if (result.rows.length === 0) throw new Error('Không tìm thấy shop của bạn');
        return result.rows[0].id;
    }

    // ─────────────────────────────────────────
    // DASHBOARD
    // ─────────────────────────────────────────

    async getDashboardStats(req, res) {
        const sellerId = req.user.user_id;
        const client = await pool.connect();
        try {
            console.log('Seller Dashboard Debug:', {
                sellerId: sellerId,
                sellerIdType: typeof sellerId
            });
            
            const storeId = await this._getStoreId(client, sellerId);
            console.log('🏪 Store ID:', storeId);
            
            // Debug: Check all orders for this store
            const debugRes = await client.query(`
                SELECT status, COUNT(*) as count
                FROM orders 
                WHERE storeid = $1
                GROUP BY status
                ORDER BY status
            `, [storeId]);
            console.log('Orders by status for store:', debugRes.rows);
            
            const [products, orders, recentOrders, trendResult] = await Promise.all([
                client.query(
                    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='ACTIVE' OR is_activated=true) AS active FROM products WHERE seller_id=$1 AND status != 'DELETED'`,
                    [sellerId]
                ),
                client.query(
                    `SELECT COUNT(*) AS total,
                        COUNT(*) FILTER (WHERE status='CREATED') AS created,
                        COUNT(*) FILTER (WHERE status IN ('CREATED', 'PAID')) AS pending,
                        COUNT(*) FILTER (WHERE status='SHIPPED') AS shipped,
                        COUNT(*) FILTER (WHERE status IN ('DELIVERED','SETTLED')) AS delivered,
                        COUNT(*) FILTER (WHERE status='CANCELLED') AS cancelled,
                        COALESCE(SUM(CASE WHEN status = 'SETTLED' THEN finalprice ELSE 0 END),0) AS revenue_total,
                        COALESCE(SUM(CASE WHEN status = 'SETTLED' AND created_at >= date_trunc('month', NOW()) THEN finalprice ELSE 0 END),0) AS revenue_month
                     FROM orders WHERE storeid=$1`,
                    [storeId]
                ),
                client.query(
                    `SELECT o.id, o.status, o.finalprice AS total_amount, o.created_at, o.paymentmethod, CONCAT(u.firstname,' ',u.lastname) AS buyer_name, u.email AS buyer_email
                     FROM orders o LEFT JOIN users u ON CAST(o.user_id AS text) = CAST(u.id AS text)
                     WHERE o.storeid=$1 ORDER BY o.created_at DESC LIMIT 5`,
                    [storeId]
                ),
                client.query(`
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
                    LEFT JOIN orders o ON DATE(o.created_at) = d.date AND o.storeid = $1
                    GROUP BY d.date
                    ORDER BY d.date ASC
                `, [storeId]).catch((err) => { console.error('Trend query error:', err); return { rows: [] }; })
            ]);
            
            const ordersStats = {
                total: parseInt(orders.rows[0].total),
                created: parseInt(orders.rows[0].created),
                pending: parseInt(orders.rows[0].pending),
                shipped: parseInt(orders.rows[0].shipped),
                delivered: parseInt(orders.rows[0].delivered),
                cancelled: parseInt(orders.rows[0].cancelled),
            };
            
            console.log('Seller Order Stats:', ordersStats);
            
            res.json({
                products: {
                    total: parseInt(products.rows[0].total),
                    active: parseInt(products.rows[0].active),
                },
                orders: ordersStats,
                revenue: {
                    total: parseFloat(orders.rows[0].revenue_total),
                    this_month: parseFloat(orders.rows[0].revenue_month),
                },
                trends: trendResult.rows.map(r => ({
                    date: r.date_str,
                    orders: parseInt(r.order_count),
                    revenue: parseFloat(r.revenue)
                })),
                recent_orders: recentOrders.rows,
            });
        } catch (e) {
            console.error('getDashboardStats:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // ─────────────────────────────────────────
    // PRODUCTS
    // ─────────────────────────────────────────

    async getProductMeta(req, res) {
        const client = await pool.connect();
        try {
            const [categoriesRes, brandsRes] = await Promise.all([
                client.query(`SELECT name FROM category ORDER BY name ASC`),
                client.query(`SELECT name FROM brand ORDER BY name ASC`),
            ]);

            res.json({
                categories: categoriesRes.rows,
                brands: brandsRes.rows,
            });
        } catch (e) {
            console.error('getProductMeta:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    async getProducts(req, res) {
        const sellerId = req.user.user_id;
        const { search, status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        const client = await pool.connect();
        try {
            let where = `p.seller_id=$1 AND p.status != 'DELETED'`;
            const params = [sellerId];
            if (status) { params.push(status); where += ` AND p.status=$${params.length}`; }
            if (search) { params.push(`%${search}%`); where += ` AND p.name ILIKE $${params.length}`; }

            const countRes = await client.query(`SELECT COUNT(*) FROM products p WHERE ${where}`, params);
            const total = parseInt(countRes.rows[0].count);

            params.push(parseInt(limit)); params.push(parseInt(offset));
            const dataRes = await client.query(
                `SELECT p.id, p.name, p.description, p.price, p.promotionalprice, p.image, p.status, p.is_activated,
                        b.name AS brand, p.rating, p.stock, c.name AS category, p.categoryid, p.created_at, p.updated_at,
                        (SELECT url FROM product_images pi2 WHERE pi2.product_id=p.id AND pi2.is_primary=true LIMIT 1) AS primary_image,
                        (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id=p.id AND pv.is_active=true) AS variant_count,
                        (SELECT COUNT(*) FROM product_options po WHERE po.product_id=p.id) AS option_count,
                        (SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id=p.id AND pv.is_active=true) AS variant_price_min,
                        (SELECT MAX(pv.price) FROM product_variants pv WHERE pv.product_id=p.id AND pv.is_active=true) AS variant_price_max,
                        (SELECT COALESCE(SUM(pv.stock),0) FROM product_variants pv WHERE pv.product_id=p.id AND pv.is_active=true) AS variant_stock_sum,
                        (SELECT COALESCE(SUM(oi.count),0) 
                         FROM orderitem oi 
                         JOIN orders o ON oi.orderid = o.id 
                         WHERE oi.productid = p.id 
                         AND (
                             -- Chỉ tính đơn đã quyết toán (SETTLED)
                             o.status = 'SETTLED'
                         )) AS sold
                 FROM products p 
                 LEFT JOIN category c ON c.id = p.categoryid
                 LEFT JOIN brand b ON b.id = p.brandid
                 WHERE ${where} ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
                params
            );
            res.json({ total, page: parseInt(page), limit: parseInt(limit), products: dataRes.rows });
        } catch (e) {
            console.error('getProducts:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    async getProduct(req, res) {
        const sellerId = req.user.user_id;
        const { id } = req.params;
        const client = await pool.connect();
        try {
            const prodRes = await client.query(
                `SELECT * FROM products WHERE id=$1 AND seller_id=$2 AND status != 'DELETED'`, [id, sellerId]
            );
            if (prodRes.rows.length === 0) return res.status(404).json({ detail: 'Sản phẩm không tồn tại' });
            const product = prodRes.rows[0];

            const [imagesRes, optionsRes, variantsRes, attributesRes] = await Promise.all([
                client.query(`SELECT * FROM product_images WHERE product_id=$1 ORDER BY sort_order`, [id]),
                client.query(
                    `SELECT po.id AS option_id, po.name AS option_name, po.sort_order AS option_sort,
                            json_agg(json_build_object('id', pov.id, 'value', pov.value, 'sort_order', pov.sort_order) ORDER BY pov.sort_order) AS values
                     FROM product_options po
                     LEFT JOIN product_option_values pov ON pov.option_id = po.id
                     WHERE po.product_id=$1
                     GROUP BY po.id ORDER BY po.sort_order`, [id]
                ),
                client.query(
                    `SELECT pv.*,
                            json_agg(json_build_object('option_value_id', vov.option_value_id, 'value', pov.value, 'option_name', po.name) ORDER BY po.sort_order) AS option_values
                     FROM product_variants pv
                     LEFT JOIN variant_option_values vov ON vov.variant_id = pv.id
                     LEFT JOIN product_option_values pov ON pov.id = vov.option_value_id
                     LEFT JOIN product_options po ON po.id = pov.option_id
                     WHERE pv.product_id=$1
                     GROUP BY pv.id ORDER BY pv.created_at`, [id]
                ),
                client.query(`SELECT * FROM product_attributes WHERE product_id=$1 ORDER BY sort_order`, [id]),
            ]);

            product.images = imagesRes.rows;
            product.options = optionsRes.rows;
            product.variants = variantsRes.rows;
            product.attributes = attributesRes.rows;
            res.json({ product });
        } catch (e) {
            console.error('getProduct:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    async createProduct(req, res) {
        const sellerId = req.user.user_id;
        const { name, description, price, stock, category, image_url, brand, options, variants, images, attributes } = req.body;
        const hasVariants = variants && variants.length > 0;
        if (!name) {
            return res.status(400).json({ detail: 'Tên sản phẩm là bắt buộc' });
        }
        if (!hasVariants && (price === undefined || price === null || price === '')) {
            return res.status(400).json({ detail: 'Vui lòng nhập giá hoặc tạo biến thể có giá' });
        }
        if (price !== undefined && price !== null && price !== '' && (isNaN(parseFloat(price)) || parseFloat(price) < 0)) {
            return res.status(400).json({ detail: 'Giá không hợp lệ' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Insert product
            const prodRes = await client.query(
                `INSERT INTO products (id, seller_id, name, description, price, stock, category, categoryid, image, brand, brandid, status, is_activated)
                 VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',true) RETURNING *`,
                [
                    sellerId,
                    name.trim(),
                    description || null,
                    parseFloat(price),
                    parseInt(stock) || 0,
                    category || null,
                    null,
                    image_url || null,
                    brand || null,
                    null,
                ]
            );
            const product = prodRes.rows[0];
            const productId = product.id;

            // 2. Insert images
            if (Array.isArray(images) && images.length > 0) {
                for (let i = 0; i < images.length; i++) {
                    const img = images[i];
                    await client.query(
                        `INSERT INTO product_images (product_id, url, alt_text, sort_order, is_primary) VALUES ($1,$2,$3,$4,$5)`,
                        [productId, img.url, img.alt_text || null, i, i === 0]
                    );
                }
                // Set primary image on products table too
                await client.query(`UPDATE products SET image=$1 WHERE id=$2`, [images[0].url, productId]);
            }

            // 3. Insert options + option values, keep mapping for variants
            const optionValueMap = {}; // tempId -> real db id
            if (Array.isArray(options) && options.length > 0) {
                for (let oi = 0; oi < options.length; oi++) {
                    const opt = options[oi];
                    const optRes = await client.query(
                        `INSERT INTO product_options (product_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id`,
                        [productId, opt.name, oi]
                    );
                    const optionId = optRes.rows[0].id;
                    if (Array.isArray(opt.values)) {
                        for (let vi = 0; vi < opt.values.length; vi++) {
                            const val = opt.values[vi];
                            const valRes = await client.query(
                                `INSERT INTO product_option_values (option_id, value, sort_order) VALUES ($1,$2,$3) RETURNING id`,
                                [optionId, val.value || val, vi]
                            );
                            // Map by "optionName:valueName" for variant linking
                            const key = `${opt.name}:${val.value || val}`;
                            optionValueMap[key] = valRes.rows[0].id;
                        }
                    }
                }
            }

            // 4. Insert variants
            if (Array.isArray(variants) && variants.length > 0) {
                for (const v of variants) {
                    const varRes = await client.query(
                        `INSERT INTO product_variants (product_id, sku, price, promotional_price, stock, image_url, is_active)
                         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
                        [productId, v.sku || null, parseFloat(v.price), v.promotional_price ? parseFloat(v.promotional_price) : null,
                         parseInt(v.stock) || 0, v.image_url || null, true]
                    );
                    const variantId = varRes.rows[0].id;
                    // Link variant to option values
                    if (Array.isArray(v.option_values)) {
                        for (const ov of v.option_values) {
                            const key = `${ov.option_name}:${ov.value}`;
                            const optionValueId = optionValueMap[key];
                            if (optionValueId) {
                                await client.query(
                                    `INSERT INTO variant_option_values (variant_id, option_value_id) VALUES ($1,$2)`,
                                    [variantId, optionValueId]
                                );
                            }
                        }
                    }
                }
                // Update total stock on parent product
                const totalStock = variants.reduce((s, v) => s + (parseInt(v.stock) || 0), 0);
                await client.query(`UPDATE products SET stock=$1 WHERE id=$2`, [totalStock, productId]);
            }

            // 5. Insert attributes
            if (Array.isArray(attributes) && attributes.length > 0) {
                for (let i = 0; i < attributes.length; i++) {
                    const attr = attributes[i];
                    await client.query(
                        `INSERT INTO product_attributes (product_id, name, value, sort_order) VALUES ($1,$2,$3,$4)`,
                        [productId, attr.name, attr.value, i]
                    );
                }
            }

            await client.query('COMMIT');
            res.status(201).json({ message: 'Thêm sản phẩm thành công', product: { ...product, id: productId } });
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('createProduct:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    async updateProduct(req, res) {
        const sellerId = req.user.user_id;
        const { id } = req.params;
        const { name, description, price, stock, category, image_url, brand, status, options, variants, images, attributes } = req.body;
        const client = await pool.connect();
        try {
            const existing = await client.query(`SELECT * FROM products WHERE id=$1 AND seller_id=$2 AND status != 'DELETED'`, [id, sellerId]);
            if (existing.rows.length === 0) return res.status(404).json({ detail: 'Sản phẩm không tồn tại' });

            await client.query('BEGIN');
            const prod = existing.rows[0];
            const newStatus = status && ['ACTIVE','INACTIVE'].includes(status) ? status : prod.status;

            // 1. Update base product
            await client.query(
                `UPDATE products SET name=$1, description=$2, price=$3, stock=$4, category=$5, categoryid=$6, image=$7, brand=$8, brandid=$9, status=$10,
                 is_activated=$11, updated_at=NOW() WHERE id=$12 AND seller_id=$13`,
                [
                    name !== undefined ? name.trim() : prod.name,
                    description !== undefined ? description : prod.description,
                    price !== undefined ? parseFloat(price) : prod.price,
                    stock !== undefined ? parseInt(stock) : prod.stock,
                    category !== undefined ? category : prod.category,
                    null,
                    image_url !== undefined ? image_url : prod.image,
                    brand !== undefined ? brand : prod.brand,
                    null,
                    newStatus,
                    newStatus === 'ACTIVE',
                    id,
                    sellerId
                ]
            );

            // 2. Replace images if provided
            if (Array.isArray(images)) {
                await client.query(`DELETE FROM product_images WHERE product_id=$1`, [id]);
                for (let i = 0; i < images.length; i++) {
                    const img = images[i];
                    await client.query(
                        `INSERT INTO product_images (product_id, url, alt_text, sort_order, is_primary) VALUES ($1,$2,$3,$4,$5)`,
                        [id, img.url, img.alt_text || null, i, i === 0]
                    );
                }
                if (images.length > 0) {
                    await client.query(`UPDATE products SET image=$1 WHERE id=$2`, [images[0].url, id]);
                }
            }

            // 3. Replace options + option values if provided
            const optionValueMap = {};
            if (Array.isArray(options)) {
                // Cascade delete handles option_values and variant_option_values
                await client.query(`DELETE FROM product_options WHERE product_id=$1`, [id]);
                for (let oi = 0; oi < options.length; oi++) {
                    const opt = options[oi];
                    const optRes = await client.query(
                        `INSERT INTO product_options (product_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id`,
                        [id, opt.name, oi]
                    );
                    const optionId = optRes.rows[0].id;
                    if (Array.isArray(opt.values)) {
                        for (let vi = 0; vi < opt.values.length; vi++) {
                            const val = opt.values[vi];
                            const valRes = await client.query(
                                `INSERT INTO product_option_values (option_id, value, sort_order) VALUES ($1,$2,$3) RETURNING id`,
                                [optionId, val.value || val, vi]
                            );
                            const key = `${opt.name}:${val.value || val}`;
                            optionValueMap[key] = valRes.rows[0].id;
                        }
                    }
                }
            }

            // 4. Replace variants if provided
            if (Array.isArray(variants)) {
                await client.query(`DELETE FROM product_variants WHERE product_id=$1`, [id]);
                for (const v of variants) {
                    const varRes = await client.query(
                        `INSERT INTO product_variants (product_id, sku, price, promotional_price, stock, image_url, is_active)
                         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
                        [id, v.sku || null, parseFloat(v.price), v.promotional_price ? parseFloat(v.promotional_price) : null,
                         parseInt(v.stock) || 0, v.image_url || null, true]
                    );
                    const variantId = varRes.rows[0].id;
                    if (Array.isArray(v.option_values)) {
                        for (const ov of v.option_values) {
                            const key = `${ov.option_name}:${ov.value}`;
                            const optionValueId = optionValueMap[key];
                            if (optionValueId) {
                                await client.query(
                                    `INSERT INTO variant_option_values (variant_id, option_value_id) VALUES ($1,$2)`,
                                    [variantId, optionValueId]
                                );
                            }
                        }
                    }
                }
                const totalStock = variants.reduce((s, v) => s + (parseInt(v.stock) || 0), 0);
                await client.query(`UPDATE products SET stock=$1 WHERE id=$2`, [totalStock, id]);
            }

            // 5. Replace attributes if provided
            if (Array.isArray(attributes)) {
                await client.query(`DELETE FROM product_attributes WHERE product_id=$1`, [id]);
                for (let i = 0; i < attributes.length; i++) {
                    const attr = attributes[i];
                    await client.query(
                        `INSERT INTO product_attributes (product_id, name, value, sort_order) VALUES ($1,$2,$3,$4)`,
                        [id, attr.name, attr.value, i]
                    );
                }
            }

            await client.query('COMMIT');
            const updatedRes = await client.query(`SELECT * FROM products WHERE id=$1`, [id]);
            res.json({ message: 'Cập nhật thành công', product: updatedRes.rows[0] });
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('updateProduct:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    async deleteProduct(req, res) {
        const sellerId = req.user.user_id;
        const { id } = req.params;
        const client = await pool.connect();
        try {
            const result = await client.query(
                `UPDATE products SET status='DELETED', updated_at=NOW() WHERE id=$1 AND seller_id=$2 AND status != 'DELETED' RETURNING id`,
                [id, sellerId]
            );
            if (result.rows.length === 0) return res.status(404).json({ detail: 'Sản phẩm không tồn tại' });
            res.json({ message: 'Xóa sản phẩm thành công' });
        } catch (e) {
            console.error('deleteProduct:', e.message);
            res.status(500).json({ detail: 'Lỗi server' });
        } finally {
            client.release();
        }
    }

    // ─────────────────────────────────────────
    // ORDERS
    // ─────────────────────────────────────────

    async getOrders(req, res) {
        const sellerId = req.user.user_id;
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        const client = await pool.connect();
        try {
            const storeId = await this._getStoreId(client, sellerId);
            let where = `o.storeid=$1`;
            const params = [storeId];
            if (status) { params.push(status); where += ` AND o.status=$${params.length}`; }

            const countRes = await client.query(`SELECT COUNT(*) FROM orders o WHERE ${where}`, params);
            const total = parseInt(countRes.rows[0].count);

            params.push(parseInt(limit)); params.push(parseInt(offset));
            const dataRes = await client.query(
                `SELECT o.id, o.status, o.finalprice AS total_amount, o.created_at, o.updated_at,
                    o.shippingaddressline1, o.shippingaddressline2, o.shippingcity, o.shippingdistrict,
                    o.shippingward, o.shippingphone, o.paymentmethod, o.discountamount,
                    o.shop_coupon_id, o.shop_discount, o.platform_coupon_id, o.platform_discount,
                    sc.code as shop_coupon_code, sc.description as shop_coupon_description,
                    pc.code as platform_coupon_code, pc.description as platform_coupon_description,
                    CONCAT(u.firstname,' ',u.lastname) AS buyer_name, u.email AS buyer_email, u.phone AS buyer_phone
                 FROM orders o 
                 LEFT JOIN users u ON CAST(o.user_id AS text) = CAST(u.id AS text)
                 LEFT JOIN coupon sc ON o.shop_coupon_id = sc.id
                 LEFT JOIN coupon pc ON o.platform_coupon_id = pc.id
                 WHERE ${where} ORDER BY o.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
                params
            );
            res.json({ total, page: parseInt(page), limit: parseInt(limit), orders: dataRes.rows });
        } catch (e) {
            console.error('getOrders:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    async getOrderItems(req, res) {
        const sellerId = req.user.user_id;
        const { id } = req.params;
        const client = await pool.connect();
        try {
            const storeId = await this._getStoreId(client, sellerId);
            // Verify order belongs to this seller's store
            const check = await client.query(`SELECT id FROM orders WHERE id=$1 AND storeid=$2`, [id, storeId]);
            if (check.rows.length === 0) return res.status(404).json({ detail: 'Đơn hàng không tồn tại' });

            const result = await client.query(
                `SELECT oi.id, oi.productid AS product_id, oi.variantid AS variant_id,
                        oi.count AS quantity, oi.price, oi.promotionalprice AS promotional_price,
                        oi.productname AS product_name, oi.variantname AS variant_name, oi.productimage AS image
                 FROM orderitem oi WHERE oi.orderid = $1`,
                [id]
            );
            res.json({ items: result.rows });
        } catch (e) {
            console.error('seller getOrderItems:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    async confirmReturnReceived(req, res) {
        const sellerId = req.user.user_id;
        const { id } = req.params;
        const { simulated_time } = req.query; // Hỗ trợ giả lập thời gian (Data Lakehouse)
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const storeId = await this._getStoreId(client, sellerId);
            const existing = await client.query(`SELECT * FROM orders WHERE id=$1 AND storeid=$2`, [id, storeId]);
            if (existing.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Đơn hàng không tồn tại' });
            }

            const current = existing.rows[0].status;
            if (current !== 'RETURN_IN_TRANSIT') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Đơn hàng phải ở trạng thái RETURN_IN_TRANSIT (hiện tại: ${current})` });
            }

            const now = simulated_time ? new Date(simulated_time) : new Date();

            // ====== BLOCKCHAIN GUARD ======
            const guard = await requireBlockchainSync(id, client);
            if (guard) {
                await client.query('ROLLBACK');
                return res.status(409).json({ detail: guard.message, sync_status: guard.status });
            }

            const result = await client.query(
                `UPDATE orders SET status='RETURNED', updated_at=$3 WHERE id=$1 AND storeid=$2 RETURNING id, status, updated_at`,
                [id, storeId, now.toISOString()]
            );

            // ====== GHI TRACKING LOG ======
            const o = existing.rows[0];
            await logTracking(client, {
                orderId: id,
                status: 'RETURNED',
                codstatus: o.codstatus || null,
                event: 'CONFIRM_RETURN_RECEIVED',
                carrierId: o.carrier_id,
                shipperId: o.shipper_id,
                notes: 'Seller xác nhận đã nhận lại hàng hoàn trả',
                changedBy: sellerId,
                timestamp: now,
            });

            // ====== OUTBOX PATTERN: Ghi task xác nhận nhận hàng trả vào outbox ======
            const chainUsername = req.user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
            await client.query(
                `INSERT INTO blockchain_outbox (order_id, action, payload) VALUES ($1, $2, $3)`,
                [id, 'CONFIRM_RETURN_RECEIVED', JSON.stringify({
                    orderID: id,
                    simulatedTime: simulated_time ? now.toISOString() : undefined,
                    requestorOrg: 'seller',
                    requestorUser: chainUsername
                })]
            );
            console.log(` [Outbox] Đã ghi task CONFIRM_RETURN_RECEIVED cho đơn ${id} (seller: ${chainUsername})`);

            await client.query('COMMIT');
            res.json({ message: 'Đã xác nhận nhận lại hàng hoàn trả thành công', order: result.rows[0] });

        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('confirmReturnReceived error:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // Debug method to test sold count calculation
    async testSoldCount(req, res) {
        const { productId } = req.params;
        const client = await pool.connect();

        try {
            // Get detailed info about product and its orders
            const productQuery = `
                SELECT 
                    p.id,
                    p.name,
                    p.sold as product_sold,
                    p.store_owner_id,
                    COALESCE(
                        (SELECT SUM(oi.count)::int 
                         FROM orderitem oi 
                         JOIN orders o ON oi.orderid = o.id 
                         WHERE oi.productid = p.id 
                         AND (
                             -- Chỉ tính đơn đã quyết toán (SETTLED)
                             o.status = 'SETTLED'
                         )
                        ), 0
                    ) as calculated_sold
                FROM products p 
                WHERE p.id = $1
            `;

            const orderQuery = `
                SELECT 
                    o.id as order_id,
                    o.status,
                    o.payment_method,
                    o.cod_status,
                    oi.count as quantity,
                    o.created_at
                FROM orderitem oi 
                JOIN orders o ON oi.orderid = o.id 
                WHERE oi.productid = $1
                ORDER BY o.created_at DESC
            `;

            const [productResult, orderResult] = await Promise.all([
                client.query(productQuery, [productId]),
                client.query(orderQuery, [productId])
            ]);

            res.json({
                success: true,
                product: productResult.rows[0] || null,
                orders: orderResult.rows,
                summary: {
                    total_orders: orderResult.rows.length,
                    delivered_orders: orderResult.rows.filter(o => 
                        o.status === 'SETTLED'
                    ).length,
                    cod_orders: orderResult.rows.filter(o => o.payment_method === 'COD').length,
                    bank_transfer_orders: orderResult.rows.filter(o => o.payment_method === 'BANK_TRANSFER').length
                }
            });

        } catch (error) {
            console.error('Test sold count error:', error);
            res.status(500).json({ success: false, error: error.message });
        } finally {
            client.release();
        }
    }
}

module.exports = new SellerController();
