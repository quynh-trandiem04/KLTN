const pool = require('../config/database');


class CouponController {

    // GET /v1/coupons — list
    // Admin: all; Seller: own store; Customer: active platform+own store coupons (query ?storeId=)
    async getCoupons(req, res) {
        try {
            const roles = req.user?.roles || [];
            const isAdmin = roles.includes('ADMIN');
            const isSeller = roles.includes('STORE_OWNER');
            const userId = req.user?.user_id;
            const { storeId } = req.query;

            let rows;
            if (isAdmin) {
                const r = await pool.query(
                    `SELECT c.*, s.name AS store_name FROM coupon c LEFT JOIN store s ON s.id = c.storeid ORDER BY c.id DESC`
                );
                rows = r.rows;
            } else if (isSeller) {
                const storeRes = await pool.query(`SELECT id FROM store WHERE ownerid = $1 LIMIT 1`, [userId]);
                if (!storeRes.rows.length) return res.json([]);
                const sid = storeRes.rows[0].id;
                const r = await pool.query(`SELECT * FROM coupon WHERE storeid = $1 ORDER BY id DESC`, [sid]);
                rows = r.rows;
            } else {
                // Customer: platform (storeid IS NULL) + specific store
                const params = [];
                let whereClauses = [`c.isactive = true AND c.startdate <= NOW() AND c.enddate >= NOW()`];
                let storeClause = `c.storeid IS NULL`;
                if (storeId) {
                    storeClause = `(c.storeid IS NULL OR c.storeid = $${params.length + 1})`;
                    params.push(storeId);
                }
                whereClauses.push(storeClause);
                const r = await pool.query(
                    `SELECT c.* FROM coupon c WHERE ${whereClauses.join(' AND ')} ORDER BY c.id DESC`,
                    params
                );
                rows = r.rows;
            }
            res.json(rows);
        } catch (e) {
            res.status(500).json({ detail: e.message });
        }
    }

    // POST /v1/coupons/validate — validate coupon code
    async validateCoupon(req, res) {
        try {
            const { code, orderValue, storeId } = req.body;
            if (!code) return res.status(400).json({ detail: 'Thiếu mã coupon' });

            const r = await pool.query(`SELECT * FROM coupon WHERE UPPER(code) = UPPER($1) LIMIT 1`, [code]);
            if (!r.rows.length) return res.status(404).json({ detail: 'Mã không tồn tại' });

            const c = r.rows[0];
            const now = new Date();

            if (!c.isactive) return res.status(400).json({ detail: 'Mã đã bị vô hiệu hóa' });
            if (new Date(c.startdate) > now) return res.status(400).json({ detail: 'Mã chưa có hiệu lực' });
            if (new Date(c.enddate) < now) return res.status(400).json({ detail: 'Mã đã hết hạn' });
            if (c.usagelimit && c.usedcount >= c.usagelimit) return res.status(400).json({ detail: 'Mã đã hết lượt sử dụng' });
            if (c.minordervalue && Number(orderValue) < Number(c.minordervalue))
                return res.status(400).json({ detail: `Đơn hàng tối thiểu ${Number(c.minordervalue).toLocaleString('vi-VN')}₫` });

            // Check coupon type matches: platform coupon (storeid null) or shop coupon for correct store
            const isplatform = c.storeid === null;
            if (!isplatform && storeId && String(c.storeid) !== String(storeId))
                return res.status(400).json({ detail: 'Mã không áp dụng cho shop này' });

            let discount = 0;
            if (c.discounttype === 'PERCENTAGE') {
                discount = Number(orderValue) * Number(c.discountvalue) / 100;
                if (c.maxdiscount) discount = Math.min(discount, Number(c.maxdiscount));
            } else {
                discount = Number(c.discountvalue);
            }
            discount = Math.round(Math.min(discount, Number(orderValue)));

            res.json({ valid: true, coupon: c, discount, isplatform });
        } catch (e) {
            res.status(500).json({ detail: e.message });
        }
    }

    // POST /v1/coupons — create
    async createCoupon(req, res) {
        try {
            const roles = req.user?.roles || [];
            const isSeller = roles.includes('STORE_OWNER');
            const userId = req.user?.user_id;
            const { code, description, discounttype, discountvalue, minordervalue, maxdiscount, startdate, enddate, usagelimit } = req.body;

            if (!code || !discounttype || !discountvalue || !startdate || !enddate)
                return res.status(400).json({ detail: 'Thiếu thông tin bắt buộc' });

            let storeid = null;
            if (isSeller) {
                const storeRes = await pool.query(`SELECT id FROM store WHERE ownerid = $1 LIMIT 1`, [userId]);
                if (!storeRes.rows.length) return res.status(400).json({ detail: 'Bạn chưa có shop' });
                storeid = storeRes.rows[0].id;
            }

            const r = await pool.query(
                `INSERT INTO coupon (code, description, discounttype, discountvalue, minordervalue, maxdiscount, startdate, enddate, usagelimit, usedcount, isactive, createat, updateat, storeid)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,true,NOW(),NOW(),$10) RETURNING *`,
                [code.toUpperCase(), description || null, discounttype, discountvalue, minordervalue || null, maxdiscount || null, startdate, enddate, usagelimit || null, storeid]
            );
            res.json(r.rows[0]);
        } catch (e) {
            if (e.code === '23505') return res.status(400).json({ detail: 'Mã coupon đã tồn tại' });
            res.status(500).json({ detail: e.message });
        }
    }

    // PUT /v1/coupons/:id — update
    async updateCoupon(req, res) {
        try {
            const { id } = req.params;
            const roles = req.user?.roles || [];
            const isAdmin = roles.includes('ADMIN');
            const userId = req.user?.user_id;

            // Permission check
            if (!isAdmin) {
                const storeRes = await pool.query(`SELECT id FROM store WHERE ownerid = $1 LIMIT 1`, [userId]);
                if (!storeRes.rows.length) return res.status(403).json({ detail: 'Forbidden' });
                const check = await pool.query(`SELECT id FROM coupon WHERE id=$1 AND storeid=$2`, [id, storeRes.rows[0].id]);
                if (!check.rows.length) return res.status(403).json({ detail: 'Không có quyền' });
            }

            const { description, discounttype, discountvalue, minordervalue, maxdiscount, startdate, enddate, usagelimit, isactive } = req.body;
            const r = await pool.query(
                `UPDATE coupon SET description=$2, discounttype=$3, discountvalue=$4, minordervalue=$5, maxdiscount=$6,
                 startdate=$7, enddate=$8, usagelimit=$9, isactive=$10, updateat=NOW() WHERE id=$1 RETURNING *`,
                [id, description || null, discounttype, discountvalue, minordervalue || null, maxdiscount || null, startdate, enddate, usagelimit || null, isactive !== false]
            );
            if (!r.rows.length) return res.status(404).json({ detail: 'Không tìm thấy' });
            res.json(r.rows[0]);
        } catch (e) {
            res.status(500).json({ detail: e.message });
        }
    }

    // DELETE /v1/coupons/:id
    async deleteCoupon(req, res) {
        try {
            const { id } = req.params;
            const roles = req.user?.roles || [];
            const isAdmin = roles.includes('ADMIN');
            const userId = req.user?.user_id;

            if (!isAdmin) {
                const storeRes = await pool.query(`SELECT id FROM store WHERE ownerid = $1 LIMIT 1`, [userId]);
                if (!storeRes.rows.length) return res.status(403).json({ detail: 'Forbidden' });
                const check = await pool.query(`SELECT id FROM coupon WHERE id=$1 AND storeid=$2`, [id, storeRes.rows[0].id]);
                if (!check.rows.length) return res.status(403).json({ detail: 'Không có quyền' });
            }

            await pool.query(`DELETE FROM coupon WHERE id=$1`, [id]);
            res.json({ message: 'Đã xóa' });
        } catch (e) {
            res.status(500).json({ detail: e.message });
        }
    }
}

module.exports = new CouponController();
