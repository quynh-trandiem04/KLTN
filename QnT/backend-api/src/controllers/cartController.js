const pool = require('../config/database');

class CartController {

    // GET /v1/cart — lấy giỏ hàng của user
    async getCart(req, res) {
        const userId = req.user.user_id;
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity,
                        p.name AS product_name, p.price AS product_price, p.promotionalprice, p.image AS product_image, p.stock AS product_stock, p.seller_id,
                        (SELECT url FROM product_images pi2 WHERE pi2.product_id=p.id AND pi2.is_primary=true LIMIT 1) AS primary_image,
                        pv.sku AS variant_sku, pv.price AS variant_price, pv.promotional_price AS variant_promotional_price, pv.stock AS variant_stock, pv.image_url AS variant_image,
                        (SELECT json_agg(json_build_object('option_name', po.name, 'value', pov.value) ORDER BY po.sort_order)
                         FROM variant_option_values vov
                         JOIN product_option_values pov ON pov.id = vov.option_value_id
                         JOIN product_options po ON po.id = pov.option_id
                         WHERE vov.variant_id = pv.id) AS variant_options,
                        s.id AS store_id, s.name AS store_name
                 FROM cart_items ci
                 JOIN products p ON p.id = ci.product_id
                 LEFT JOIN product_variants pv ON pv.id = ci.variant_id
                 LEFT JOIN store s ON s.ownerid = p.seller_id
                 WHERE ci.user_id = $1
                 ORDER BY ci.created_at DESC`,
                [userId]
            );
            res.json({ items: result.rows });
        } catch (e) {
            console.error('cart getCart:', e.message);
            res.status(500).json({ detail: 'Lỗi server' });
        } finally {
            client.release();
        }
    }

    // POST /v1/cart — thêm sản phẩm vào giỏ
    async addToCart(req, res) {
        const userId = req.user.user_id;
        const { product_id, variant_id, quantity = 1 } = req.body;
        if (!product_id) return res.status(400).json({ detail: 'Thiếu product_id' });

        const client = await pool.connect();
        try {
            // Kiểm tra sản phẩm tồn tại
            const prodRes = await client.query(`
                SELECT id FROM products 
                WHERE id = $1 AND (
                    status = 'ACTIVE' OR EXISTS (
                        SELECT 1 FROM product_variants pv 
                        WHERE pv.product_id = products.id AND pv.is_active = true AND COALESCE(pv.stock, 0) > 0
                    )
                )`, [product_id]);
            if (prodRes.rows.length === 0) return res.status(404).json({ detail: 'Sản phẩm không tồn tại' });

            // Kiểm tra variant nếu có
            let availableStock = 0;
            if (variant_id) {
                const varRes = await client.query(`SELECT id, stock FROM product_variants WHERE id = $1 AND product_id = $2 AND is_active = true`, [variant_id, product_id]);
                if (varRes.rows.length === 0) return res.status(404).json({ detail: 'Biến thể không tồn tại' });
                availableStock = varRes.rows[0].stock || 0;
            } else {
                // Lấy stock của sản phẩm chính
                const stockRes = await client.query(`SELECT stock FROM products WHERE id = $1`, [product_id]);
                availableStock = stockRes.rows[0]?.stock || 0;
            }

            // Kiểm tra tồn kho
            if (availableStock <= 0) {
                return res.status(400).json({ detail: 'Sản phẩm đã hết hàng' });
            }

            // Kiểm tra số lượng trong giỏ hiện tại
            const currentCartRes = await client.query(
                `SELECT quantity FROM cart_items WHERE user_id = $1 AND product_id = $2 AND variant_id IS NOT DISTINCT FROM $3`,
                [userId, product_id, variant_id || null]
            );
            const currentCartQuantity = currentCartRes.rows[0]?.quantity || 0;
            const totalQuantityAfterAdd = currentCartQuantity + quantity;

            if (totalQuantityAfterAdd > availableStock) {
                return res.status(400).json({ 
                    detail: `Chỉ còn ${availableStock} sản phẩm có sẵn. Bạn đã có ${currentCartQuantity} trong giỏ hàng.`
                });
            }

            // Upsert: nếu đã có thì cộng quantity
            const result = await client.query(
                `INSERT INTO cart_items (user_id, product_id, variant_id, quantity)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (user_id, product_id, variant_id)
                 DO UPDATE SET quantity = cart_items.quantity + $4, updated_at = NOW()
                 RETURNING *`,
                [userId, product_id, variant_id || null, quantity]
            );
            res.json({ message: 'Đã thêm vào giỏ hàng', item: result.rows[0] });
        } catch (e) {
            console.error('cart addToCart:', e.message);
            res.status(500).json({ detail: 'Lỗi server' });
        } finally {
            client.release();
        }
    }

    // PUT /v1/cart/:id — cập nhật số lượng
    async updateCartItem(req, res) {
        const userId = req.user.user_id;
        const { id } = req.params;
        const { quantity } = req.body;
        if (!quantity || quantity < 1) return res.status(400).json({ detail: 'Số lượng không hợp lệ' });

        const client = await pool.connect();
        try {
            const result = await client.query(
                `UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *`,
                [quantity, id, userId]
            );
            if (result.rows.length === 0) return res.status(404).json({ detail: 'Không tìm thấy' });
            res.json({ message: 'Đã cập nhật', item: result.rows[0] });
        } catch (e) {
            console.error('cart updateCartItem:', e.message);
            res.status(500).json({ detail: 'Lỗi server' });
        } finally {
            client.release();
        }
    }

    // DELETE /v1/cart/:id — xóa 1 item
    async removeCartItem(req, res) {
        const userId = req.user.user_id;
        const { id } = req.params;
        const client = await pool.connect();
        try {
            const result = await client.query(`DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING *`, [id, userId]);
            if (result.rows.length === 0) return res.status(404).json({ detail: 'Không tìm thấy' });
            res.json({ message: 'Đã xóa khỏi giỏ hàng' });
        } catch (e) {
            console.error('cart removeCartItem:', e.message);
            res.status(500).json({ detail: 'Lỗi server' });
        } finally {
            client.release();
        }
    }

    // GET /v1/cart/count — đếm số lượng items
    async getCartCount(req, res) {
        const userId = req.user.user_id;
        const client = await pool.connect();
        try {
            const result = await client.query(`SELECT COALESCE(SUM(quantity), 0) AS count FROM cart_items WHERE user_id = $1`, [userId]);
            res.json({ count: parseInt(result.rows[0].count) });
        } catch (e) {
            console.error('cart getCartCount:', e.message);
            res.status(500).json({ detail: 'Lỗi server' });
        } finally {
            client.release();
        }
    }
}

module.exports = new CartController();
