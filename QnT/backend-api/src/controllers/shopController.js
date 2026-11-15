const pool = require('../config/database');

class ShopController {

    async getCategories(req, res) {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT c.name AS category, COUNT(*) AS count
                 FROM products p
                 JOIN category c ON c.id = p.categoryid
                 WHERE p.status = 'ACTIVE'
                 GROUP BY c.name
                 ORDER BY count DESC, c.name ASC`
            );
            res.json({ categories: result.rows });
        } catch (e) {
            console.error('shop getCategories:', e.message);
            res.status(500).json({ detail: 'Lỗi server' });
        } finally {
            client.release();
        }
    }

    async getBrands(req, res) {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT b.name AS brand, COUNT(*) AS count
                 FROM products p
                 JOIN brand b ON b.id = p.brandid
                 WHERE p.status = 'ACTIVE'
                 GROUP BY b.name
                 ORDER BY count DESC, b.name ASC`
            );
            res.json({ brands: result.rows });
        } catch (e) {
            console.error('shop getBrands:', e.message);
            res.status(500).json({ detail: 'Lỗi server' });
        } finally {
            client.release();
        }
    }

    async getColors(req, res) {
        const client = await pool.connect();
        try {
            const attrColors = await client.query(
                `SELECT DISTINCT pa.value AS color
                 FROM product_attributes pa
                 JOIN products p ON p.id = pa.product_id
                 WHERE p.status = 'ACTIVE'
                   AND (LOWER(pa.name) LIKE '%màu%' OR LOWER(pa.name) LIKE '%color%')
                   AND pa.value IS NOT NULL AND pa.value <> ''`
            );
            const optColors = await client.query(
                `SELECT DISTINCT pov.value AS color
                 FROM product_option_values pov
                 JOIN product_options po ON po.id = pov.option_id
                 JOIN products p ON p.id = po.product_id
                 WHERE p.status = 'ACTIVE'
                   AND (LOWER(po.name) LIKE '%màu%' OR LOWER(po.name) LIKE '%color%')
                   AND pov.value IS NOT NULL AND pov.value <> ''`
            );
            const all = [...new Set([
                ...attrColors.rows.map(r => r.color),
                ...optColors.rows.map(r => r.color)
            ])].sort();
            res.json({ colors: all });
        } catch (e) {
            console.error('shop getColors:', e.message);
            res.status(500).json({ detail: 'L\u1ed7i server' });
        } finally {
            client.release();
        }
    }

    async getProducts(req, res) {
        const { search, category, brand, price_min, price_max, sale, min_rating, color, size, page = 1, limit = 20, sort } = req.query;
        const offset = (page - 1) * limit;
        const client = await pool.connect();
        try {
            let where = `p.status = 'ACTIVE'`;
            const params = [];
            if (search) { params.push(`%${search}%`); where += ` AND p.name ILIKE $${params.length}`; }
            if (category) {
                params.push(category);
                where += ` AND EXISTS (SELECT 1 FROM category c WHERE c.id = p.categoryid AND c.name = $${params.length})`;
            }
            if (brand) {
                const brandArr = brand.split(',').map(b => b.trim()).filter(Boolean);
                if (brandArr.length > 0) {
                    params.push(brandArr);
                    where += ` AND EXISTS (SELECT 1 FROM brand b WHERE b.id = p.brandid AND b.name = ANY($${params.length}))`;
                }
            }
            if (price_min !== undefined && price_min !== '') {
                params.push(Number(price_min));
                where += ` AND (
                    CASE
                        WHEN (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true) > 0
                        THEN (SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true)
                        ELSE COALESCE(p.promotionalprice::numeric, p.price::numeric, 0)
                    END
                ) >= $${params.length}`;
            }
            if (price_max !== undefined && price_max !== '') {
                params.push(Number(price_max));
                where += ` AND (
                    CASE
                        WHEN (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true) > 0
                        THEN (SELECT MAX(pv.price) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true)
                        ELSE COALESCE(p.promotionalprice::numeric, p.price::numeric, 0)
                    END
                ) <= $${params.length}`;
            }
            if (sale) {
                const saleArr = sale.split(',').map(s => s.trim()).filter(Boolean);
                const saleConds = [];
                if (saleArr.includes('on_sale') || saleArr.includes('discount')) saleConds.push(`(p.promotionalprice IS NOT NULL AND p.promotionalprice::numeric < p.price::numeric)`);
                if (saleArr.includes('in_stock')) saleConds.push(`COALESCE(p.stock, 0) > 0`);
                if (saleArr.includes('out_of_stock')) saleConds.push(`COALESCE(p.stock, 0) = 0`);
                if (saleConds.length > 0) where += ` AND (${saleConds.join(' OR ')})`;
            }
            if (min_rating && min_rating !== '') {
                params.push(Number(min_rating));
                where += ` AND COALESCE((SELECT AVG(r.rating)::numeric FROM review r WHERE r.productid = p.id), 0) >= $${params.length}`;
            }
            if (color) {
                const colorArr = color.split(',').map(c => c.trim()).filter(Boolean);
                if (colorArr.length > 0) {
                    params.push(colorArr);
                    where += ` AND (
                        EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.product_id = p.id AND (LOWER(pa.name) LIKE '%màu%' OR LOWER(pa.name) LIKE '%color%') AND pa.value = ANY($${params.length}))
                        OR EXISTS (SELECT 1 FROM variant_option_values vov JOIN product_option_values pov ON pov.id = vov.option_value_id JOIN product_options po ON po.id = pov.option_id JOIN product_variants pv2 ON pv2.id = vov.variant_id WHERE pv2.product_id = p.id AND (LOWER(po.name) LIKE '%màu%' OR LOWER(po.name) LIKE '%color%') AND pov.value = ANY($${params.length}))
                    )`;
                }
            }
            if (size) {
                const sizeArr = size.split(',').map(s => s.trim()).filter(Boolean);
                if (sizeArr.length > 0) {
                    params.push(sizeArr);
                    where += ` AND (
                        EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.product_id = p.id AND (LOWER(pa.name) LIKE '%size%' OR LOWER(pa.name) LIKE '%kích thước%') AND UPPER(pa.value) = ANY(SELECT UPPER(x) FROM unnest($${params.length}::text[]) x))
                        OR EXISTS (SELECT 1 FROM variant_option_values vov JOIN product_option_values pov ON pov.id = vov.option_value_id JOIN product_options po ON po.id = pov.option_id JOIN product_variants pv2 ON pv2.id = vov.variant_id WHERE pv2.product_id = p.id AND (LOWER(po.name) LIKE '%size%' OR LOWER(po.name) LIKE '%kích thước%') AND UPPER(pov.value) = ANY(SELECT UPPER(x) FROM unnest($${params.length}::text[]) x))
                    )`;
                }
            }

            const countRes = await client.query(`SELECT COUNT(*) FROM products p WHERE ${where}`, params);
            const total = parseInt(countRes.rows[0].count);

            let orderBy = 'p.created_at DESC';
            if (sort === 'price_asc') orderBy = 'COALESCE(p.price, 0) ASC';
            else if (sort === 'price_desc') orderBy = 'COALESCE(p.price, 0) DESC';
            else if (sort === 'best_seller') orderBy = 'COALESCE(p.sold, 0) DESC';

            params.push(parseInt(limit)); params.push(parseInt(offset));
            const dataRes = await client.query(
                `SELECT p.id, p.name, p.price, p.promotionalprice, p.image,
                        b.name AS brand, c.name AS category,
                        COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 1) FROM review r WHERE r.productid = p.id::text), 0) AS rating,
                        COALESCE((SELECT COUNT(*) FROM review r WHERE r.productid = p.id::text), 0) AS review_count,
                        p.sold, p.stock, p.created_at,
                        (SELECT url FROM product_images pi2 WHERE pi2.product_id=p.id AND pi2.is_primary=true LIMIT 1) AS primary_image,
                        (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id=p.id AND pv.is_active=true) AS variant_count,
                        (SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id=p.id AND pv.is_active=true) AS variant_price_min,
                        (SELECT MAX(pv.price) FROM product_variants pv WHERE pv.product_id=p.id AND pv.is_active=true) AS variant_price_max,
                        (SELECT MIN(COALESCE(pv.promotional_price, pv.price)) FROM product_variants pv WHERE pv.product_id=p.id AND pv.is_active=true) AS variant_promo_price_min,
                        (SELECT MAX(COALESCE(pv.promotional_price, pv.price)) FROM product_variants pv WHERE pv.product_id=p.id AND pv.is_active=true) AS variant_promo_price_max
                 FROM products p
                 LEFT JOIN brand b ON b.id = p.brandid
                 LEFT JOIN category c ON c.id = p.categoryid
                 WHERE ${where} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
                params
            );
            res.json({ total, page: parseInt(page), limit: parseInt(limit), products: dataRes.rows });
        } catch (e) {
            console.error('shop getProducts:', e.message);
            res.status(500).json({ detail: 'Lỗi server' });
        } finally {
            client.release();
        }
    }

    async getProduct(req, res) {
        const { id } = req.params;
        console.log('Getting product:', id);

        const client = await pool.connect();
        try {
            const prodRes = await client.query(
                `SELECT p.id, p.name, p.description, p.price,
                        c.name AS category, b.name AS brand,
                        COALESCE(p.stock, 0) as stock, p.status, p.image, p.seller_id,
                        s.name AS shop_name
                 FROM products p
                 LEFT JOIN store s ON s.ownerid = p.seller_id
                 LEFT JOIN category c ON c.id = p.categoryid
                 LEFT JOIN brand b ON b.id = p.brandid
                 WHERE p.id = $1 AND (
                    p.status = 'ACTIVE' OR EXISTS (
                        SELECT 1 FROM product_variants pv 
                        WHERE pv.product_id = p.id AND pv.is_active = true AND COALESCE(pv.stock, 0) > 0
                    )
                 )`, [id]
            );
            
            console.log('Product query result:', prodRes.rows.length, 'rows');
            if (prodRes.rows.length === 0) {
                console.log('Product not found or no active variants with stock');
                return res.status(404).json({ detail: 'Sản phẩm không tồn tại' });
            }
            
            const product = prodRes.rows[0];
            console.log('Product found:', product.name, 'status:', product.status);

            // Execute queries sequentially to avoid deprecation warning
            const imagesRes = await client.query(`SELECT url, alt_text, is_primary, sort_order FROM product_images WHERE product_id=$1 ORDER BY sort_order`, [id]);
            const optionsRes = await client.query(
                `SELECT po.id AS option_id, po.name AS option_name, po.sort_order AS option_sort,
                        json_agg(json_build_object('id', pov.id, 'value', pov.value, 'sort_order', pov.sort_order) ORDER BY pov.sort_order) AS values
                 FROM product_options po
                 LEFT JOIN product_option_values pov ON pov.option_id = po.id
                 WHERE po.product_id=$1
                 GROUP BY po.id ORDER BY po.sort_order`, [id]
            );
            const variantsRes = await client.query(
                `SELECT pv.id, pv.price, COALESCE(pv.stock, 0) as stock, pv.is_active,
                        json_agg(json_build_object('option_value_id', vov.option_value_id, 'value', pov.value, 'option_name', po.name) ORDER BY po.sort_order) AS option_values
                 FROM product_variants pv
                 LEFT JOIN variant_option_values vov ON vov.variant_id = pv.id
                 LEFT JOIN product_option_values pov ON pov.id = vov.option_value_id
                 LEFT JOIN product_options po ON po.id = pov.option_id
                 WHERE pv.product_id=$1 AND pv.is_active=true
                 GROUP BY pv.id ORDER BY pv.created_at`, [id]
            );
            const attributesRes = await client.query(`SELECT name, value, sort_order FROM product_attributes WHERE product_id=$1 ORDER BY sort_order`, [id]);
            const reviewsRes = await client.query(
                `SELECT r.id, r.content, r.rating, r.createat, r.username, r.useravatar
                 FROM review r
                 WHERE r.productid = $1
                 ORDER BY r.createat DESC, r.id DESC
                 LIMIT 50`,
                [id]
            );

            product.images = imagesRes.rows;
            product.options = optionsRes.rows;
            product.variants = variantsRes.rows;
            product.attributes = attributesRes.rows;
            product.reviews = reviewsRes.rows;
            res.json({ product });
        } catch (e) {
            console.error('shop getProduct:', e.message);
            res.status(500).json({ detail: 'Lỗi server' });
        } finally {
            client.release();
        }
    }
}

module.exports = new ShopController();
