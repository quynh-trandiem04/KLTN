// backend-api/src/controllers/wishlistController.js
const pool = require('../config/database');

class WishlistController {
    
    // GET /v1/wishlist - Get user's wishlist
    async getWishlist(req, res) {
        const userId = req.user.user_id;
        const { page = 1, limit = 20, sort = 'added_at' } = req.query;
        const offset = (page - 1) * limit;
        
        const client = await pool.connect();
        try {
            // Get total count
            const countRes = await client.query(
                `SELECT COUNT(*) as total FROM wishlists WHERE user_id::text = $1::text`,
                [userId]
            );
            const total = parseInt(countRes.rows[0].total);
            
            // Get wishlist items with product details
            const itemsRes = await client.query(`
                SELECT w.id, w.product_id, w.variant_id, w.added_at, w.notes,
                       p.name AS product_name,
                       p.price AS product_price,
                       p.promotionalprice AS product_promotional_price,
                       COALESCE(
                         (SELECT url FROM product_images pi
                          WHERE pi.product_id::text = p.id::text AND pi.is_primary = true LIMIT 1),
                         p.image
                       ) AS product_image,
                       p.rating AS product_rating,
                       p.stock AS product_stock,
                       s.name AS seller_name,
                       CASE WHEN p.stock > 0 THEN true ELSE false END AS in_stock,
                       pv.sku AS variant_name,
                       pv.price AS variant_price,
                       pv.promotional_price AS variant_promotional_price
                FROM wishlists w
                JOIN products p ON p.id::text = w.product_id::text
                LEFT JOIN product_variants pv ON pv.id::text = w.variant_id::text
                LEFT JOIN store s ON s.ownerid = p.seller_id
                WHERE w.user_id::text = $1::text
                ORDER BY w.${sort === 'price' ? 'product_price' : 'added_at'} DESC
                LIMIT $2 OFFSET $3
            `, [userId, limit, offset]);
            
            res.json({
                items: itemsRes.rows,
                total: total,
                page: parseInt(page),
                total_pages: Math.ceil(total / limit)
            });
            
        } catch (error) {
            console.error('getWishlist error:', error.message);
            res.status(500).json({ detail: 'Lỗi server: ' + error.message });
        } finally {
            client.release();
        }
    }
    
    // POST /v1/wishlist - Add to wishlist
    async addToWishlist(req, res) {
        const userId = req.user.user_id;
        const { product_id, variant_id, notes } = req.body;
        
        if (!product_id) {
            return res.status(400).json({ detail: 'product_id là bắt buộc' });
        }
        
        const client = await pool.connect();
        try {
            // Check if product exists
            const productCheck = await client.query(
                `SELECT id, name FROM products 
                 WHERE id::text = $1::text
                 AND (status = 'ACTIVE' OR EXISTS (
                    SELECT 1 FROM product_variants pv 
                    WHERE pv.product_id = products.id AND pv.is_active = true
                 ))`,
                [product_id]
            );
            
            if (productCheck.rows.length === 0) {
                return res.status(404).json({ detail: 'Sản phẩm không tồn tại' });
            }
            
            // Insert or update wishlist item
            const result = await client.query(`
                INSERT INTO wishlists (user_id, product_id, variant_id, notes, added_at)
                VALUES ($1, $2::text, $3::text, $4, NOW())
                ON CONFLICT (user_id, product_id) DO UPDATE SET
                  variant_id = EXCLUDED.variant_id,
                  notes = EXCLUDED.notes,
                  added_at = NOW()
                RETURNING *
            `, [userId, product_id, variant_id || null, notes || null]);
            
            res.status(201).json({
                message: 'Đã thêm vào danh sách yêu thích',
                wishlist_item: result.rows[0]
            });
            
        } catch (error) {
            console.error('addToWishlist error:', error.message);
            res.status(500).json({ detail: 'Lỗi server: ' + error.message });
        } finally {
            client.release();
        }
    }
    
    // DELETE /v1/wishlist/:id - Remove from wishlist by ID
    async removeFromWishlist(req, res) {
        const userId = req.user.user_id;
        const { id } = req.params;
        
        const client = await pool.connect();
        try {
            const result = await client.query(
                `DELETE FROM wishlists 
                 WHERE id = $1 AND user_id::text = $2::text
                 RETURNING id`,
                [id, userId]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({ detail: 'Không tìm thấy sản phẩm trong danh sách yêu thích' });
            }
            
            res.json({ message: 'Đã xóa khỏi danh sách yêu thích' });
            
        } catch (error) {
            console.error('removeFromWishlist error:', error.message);
            res.status(500).json({ detail: 'Lỗi server: ' + error.message });
        } finally {
            client.release();
        }
    }
    
    // DELETE /v1/wishlist/product/:productId - Remove by product ID
    async removeByProductId(req, res) {
        const userId = req.user.user_id;
        const { productId } = req.params;

        if (!productId) {
            return res.status(400).json({ detail: 'product_id là bắt buộc' });
        }

        const client = await pool.connect();
        try {
            const result = await client.query(
                `DELETE FROM wishlists
                 WHERE product_id::text = $1::text AND user_id::text = $2::text
                 RETURNING id`,
                [productId, userId]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({ detail: 'Không tìm thấy sản phẩm trong danh sách yêu thích' });
            }
            
            res.json({ message: 'Đã xóa khỏi danh sách yêu thích' });
            
        } catch (error) {
            console.error('removeByProductId error:', error.message);
            res.status(500).json({ detail: 'Lỗi server: ' + error.message });
        } finally {
            client.release();
        }
    }
    
    // POST /v1/wishlist/toggle/:productId - Toggle favorite
    async toggleWishlist(req, res) {
        const userId = req.user.user_id;
        const { productId } = req.params;
        const { variant_id } = req.body;

        if (!productId) {
            return res.status(400).json({ detail: 'product_id là bắt buộc' });
        }

        const client = await pool.connect();
        try {
            // Check if already in wishlist
            const existingRes = await client.query(
                `SELECT id FROM wishlists
                 WHERE user_id::text = $1::text AND product_id::text = $2::text`,
                [userId, productId]
            );

            if (existingRes.rows.length > 0) {
                // Remove from wishlist
                await client.query(
                    `DELETE FROM wishlists WHERE id = $1`,
                    [existingRes.rows[0].id]
                );

                return res.json({
                    action: 'removed',
                    message: 'Đã xóa khỏi danh sách yêu thích',
                    is_favorited: false
                });
            } else {
                // Add to wishlist
                const result = await client.query(`
                    INSERT INTO wishlists (user_id, product_id, variant_id, added_at)
                    VALUES ($1, $2::text, $3::text, NOW())
                    RETURNING id
                `, [userId, productId, variant_id || null]);

                return res.json({
                    action: 'added',
                    message: 'Đã thêm vào danh sách yêu thích',
                    is_favorited: true,
                    wishlist_id: result.rows[0].id
                });
            }

        } catch (error) {
            console.error('toggleWishlist error:', error.message);
            res.status(500).json({ detail: 'Lỗi server: ' + error.message });
        } finally {
            client.release();
        }
    }
    
    // GET /v1/wishlist/check/:productId - Check if favorited
    async checkFavorited(req, res) {
        const userId = req.user.user_id;
        const { productId } = req.params;

        if (!productId) {
            return res.status(400).json({ detail: 'product_id là bắt buộc' });
        }

        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT id FROM wishlists
                 WHERE user_id::text = $1::text AND product_id::text = $2::text
                 LIMIT 1`,
                [userId, productId]
            );

            res.json({
                is_favorited: result.rows.length > 0,
                wishlist_id: result.rows[0]?.id || null
            });
            
        } catch (error) {
            console.error('checkFavorited error:', error.message);
            res.status(500).json({ detail: 'Lỗi server: ' + error.message });
        } finally {
            client.release();
        }
    }
    
    // GET /v1/wishlist/count - Get wishlist count
    async getWishlistCount(req, res) {
        const userId = req.user.user_id;
        
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT COUNT(*) as count FROM wishlists WHERE user_id::text = $1::text`,
                [userId]
            );
            
            res.json({ count: parseInt(result.rows[0].count) });
            
        } catch (error) {
            console.error('getWishlistCount error:', error.message);
            res.status(500).json({ detail: 'Lỗi server: ' + error.message });
        } finally {
            client.release();
        }
    }
}

module.exports = new WishlistController();
