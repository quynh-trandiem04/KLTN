// backend-api\src\controllers\orderController.js

const pool = require('../config/database');
const axios = require('axios');
const { BLOCKCHAIN_ADAPTER_URL } = require('../config/constants');
const { requireBlockchainSync } = require('../services/blockchainGuard');
const { logTracking } = require('../services/trackingService');


function determineZone(destinationProvince, originProvince) {
    if (!destinationProvince || !originProvince) return 'lien_tinh';
    const dest = destinationProvince.trim().toLowerCase();
    const origin = originProvince.trim().toLowerCase();
    if (dest === origin || dest.includes(origin) || origin.includes(dest)) {
        const majorCities = ['hồ chí minh', 'ho chi minh', 'hcm', 'hà nội', 'ha noi', 'hn', 'đà nẵng', 'da nang'];
        const isMajor = majorCities.some(c => dest.includes(c) || origin.includes(c));
        return isMajor ? 'noi_thanh' : 'noi_tinh';
    }
    return 'lien_tinh';
}

class OrderController {

    // POST /v1/orders — tạo đơn hàng từ giỏ, tách theo từng shop
    async createOrder(req, res) {
        const userId = req.user.user_id;
        const { simulated_time } = req.query;
        const {
            shippingAddressLine1, shippingAddressLine2, shippingCity, shippingDistrict,
            phone, paymentMethod = 'COD', shippingMethod = 'standard', note,
            carrierId, serviceId, useInsurance, destinationProvince,
            shopCouponId, platformCouponId
        } = req.body;

        const client = await pool.connect();
        try {
            // Lấy giỏ hàng kèm thông tin store và weight sản phẩm
            const cartRes = await client.query(
                `SELECT ci.id AS cart_item_id, ci.product_id, ci.variant_id, ci.quantity,
                        p.name AS product_name, p.price AS product_price, p.promotionalprice, p.image AS product_image, p.seller_id,
                        COALESCE(p.weight, 0.5) AS product_weight,
                        (SELECT url FROM product_images pi2 WHERE pi2.product_id=p.id AND pi2.is_primary=true LIMIT 1) AS primary_image,
                        pv.price AS variant_price, pv.promotional_price AS variant_promotional_price, pv.sku AS variant_sku,
                        s.id AS store_id, s.name AS store_name,
                        s.taxid AS store_tax_id,
                        u.email AS seller_email
                 FROM cart_items ci
                 JOIN products p ON p.id = ci.product_id
                 LEFT JOIN product_variants pv ON pv.id = ci.variant_id
                 LEFT JOIN store s ON s.ownerid = p.seller_id
                 LEFT JOIN users u ON u.id = s.ownerid
                 WHERE ci.user_id = $1`,
                [userId]
            );

            if (cartRes.rows.length === 0) {
                return res.status(400).json({ detail: 'Giỏ hàng trống' });
            }

            // Tính tổng trọng lượng đơn hàng
            const totalWeight = cartRes.rows.reduce((sum, item) => sum + Number(item.product_weight) * item.quantity, 0);

            // Chuẩn hoá paymentmethod theo constraint DB: chỉ cho phép 'COD' hoặc 'PREPAID'
            const dbPaymentMethod = (paymentMethod || '').toUpperCase() === 'COD' ? 'COD' : 'PREPAID';

            // Tính phí vận chuyển
            const shippingFees = { standard: 0, express: 30000, courier: 50000 };
            let deliveryPrice = shippingFees[shippingMethod] || 0;
            let globalCodSurcharge = 0;
            let globalInsuranceFee = 0;
            let globalFuelSurcharge = 0;
            let globalBaseShippingFee = deliveryPrice;
            let carrierName = '';
            
            // Tính tổng actualSubTotal của toàn bộ giỏ hàng (để tính COD và insurance 1 lần)
            const totalCartActualSubTotal = cartRes.rows.reduce((sum, item) => {
                const basePrice = item.variant_id ? Number(item.variant_price || 0) : Number(item.product_price || 0);
                const promoPrice = item.variant_id
                    ? (item.variant_promotional_price != null ? Number(item.variant_promotional_price) : null)
                    : (item.promotionalprice != null ? Number(item.promotionalprice) : null);
                const finalUnitPrice = (promoPrice !== null && promoPrice > 0) ? promoPrice : basePrice;
                return sum + finalUnitPrice * item.quantity;
            }, 0);
            
            if (carrierId) {
                // Validate shipper is active
                const shipperCheckRes = await client.query(
                    `SELECT sp.is_active, sp.display_name, u.firstname, u.lastname
                     FROM shipper_profiles sp
                     JOIN users u ON u.id::text = sp.user_id::text
                     WHERE sp.user_id::text = $1::text`,
                    [carrierId]
                );
                
                if (shipperCheckRes.rows.length === 0) {
                    return res.status(400).json({ detail: 'Shipper không tồn tại' });
                }
                
                if (!shipperCheckRes.rows[0].is_active) {
                    return res.status(400).json({ detail: 'Shipper không hoạt động. Vui lòng chọn đơn vị vận chuyển khác' });
                }
                
                carrierName = shipperCheckRes.rows[0].display_name || 
                              `${shipperCheckRes.rows[0].firstname || ''} ${shipperCheckRes.rows[0].lastname || ''}`.trim();
                
                try {

                    // Get carrier origin province
                    const profileRes = await client.query(
                        `SELECT origin_province FROM shipper_profiles WHERE user_id = $1`, [carrierId]
                    );
                    const originProvince = profileRes.rows[0]?.origin_province || 'Hồ Chí Minh';
                    const zoneType = determineZone(destinationProvince || shippingCity, originProvince);

                    let shippingBase = 30000; 
                    if (serviceId) {
                        const rateRes = await client.query(
                            `SELECT base_fee, per_kg_fee, weight_from FROM shipping_rates
                             WHERE service_id = $1 AND zone_type = $2
                               AND weight_from <= $3 AND (weight_to IS NULL OR weight_to > $3)
                             ORDER BY weight_from DESC LIMIT 1`,
                            [serviceId, zoneType, totalWeight]
                        );
                        if (rateRes.rows.length > 0) {
                            const r = rateRes.rows[0];
                            shippingBase = Number(r.base_fee) + Math.max(0, totalWeight - Number(r.weight_from)) * Number(r.per_kg_fee);
                        }
                    } else {
                        // Legacy zone-based
                        const legacyZone = zoneType === 'lien_tinh' ? 'national' : 'local';
                        const rateRes = await client.query(
                            `SELECT base_fee, per_kg_fee, weight_from FROM shipping_rates
                             WHERE shipper_id = $1 AND zone = $2
                               AND weight_from <= $3 AND (weight_to IS NULL OR weight_to > $3)
                             ORDER BY weight_from DESC LIMIT 1`,
                            [carrierId, legacyZone, totalWeight]
                        );
                        if (rateRes.rows.length > 0) {
                            const r = rateRes.rows[0];
                            shippingBase = Number(r.base_fee) + Math.max(0, totalWeight - Number(r.weight_from)) * Number(r.per_kg_fee);
                        }
                    }
                    
                    // Lấy fuel surcharge và tính phí COD, bảo hiểm cho toàn bộ giỏ
                    const surchargeRes = await client.query(
                        `SELECT * FROM shipping_surcharges WHERE carrier_id = $1`, [carrierId]
                    );
                    const sc = surchargeRes.rows[0] || { fuel_surcharge_percent: 0, cod_fee_percent: 0, cod_fee_min: 0, cod_fee_max: 0, insurance_fee_percent: 0 };
                    
                    const fuelSurcharge = Number(sc.fuel_surcharge_percent) > 0 
                        ? Math.ceil(shippingBase * Number(sc.fuel_surcharge_percent) / 100) 
                        : 0;
                    
                    deliveryPrice = shippingBase + fuelSurcharge;
                    globalFuelSurcharge = fuelSurcharge;
                    globalBaseShippingFee = shippingBase;
                    
                    // Tính phí COD cho toàn bộ giỏ hàng
                    if (dbPaymentMethod === 'COD' && Number(sc.cod_fee_percent) > 0) {
                        globalCodSurcharge = Math.ceil(totalCartActualSubTotal * Number(sc.cod_fee_percent) / 100);
                        if (Number(sc.cod_fee_min) > 0) globalCodSurcharge = Math.max(globalCodSurcharge, Number(sc.cod_fee_min));
                        if (Number(sc.cod_fee_max) > 0) globalCodSurcharge = Math.min(globalCodSurcharge, Number(sc.cod_fee_max));
                    }
                    
                    // Tính phí bảo hiểm cho toàn bộ giỏ hàng
                    if (useInsurance && Number(sc.insurance_fee_percent) > 0) {
                        globalInsuranceFee = Math.ceil(totalCartActualSubTotal * Number(sc.insurance_fee_percent) / 100);
                    }
                } catch(e) {
                    deliveryPrice = 30000; // fallback nếu bảng chưa migrate
                }
            }

            // Nhóm sản phẩm theo store
            const storeGroups = {};
            for (const item of cartRes.rows) {
                const storeKey = item.store_id != null ? String(item.store_id) : 'unknown';
                if (!storeGroups[storeKey]) {
                    storeGroups[storeKey] = {
                        store_id: item.store_id,
                        store_name: item.store_name,
                        tax_id: item.store_tax_id,
                        items: []
                    };
                }
                storeGroups[storeKey].items.push(item);
            }

            // Tính số lượng đơn hàng (số shop)
            const numberOfOrders = Object.keys(storeGroups).length;

            // Tính platform coupon 1 lần duy nhất (áp cho toàn bộ đơn hàng)
            let globalPlatformDiscount = 0;
            let resolvedGlobalPlatformCouponId = null;
            if (platformCouponId) {
                try {
                    const pc = await client.query(`SELECT * FROM coupon WHERE id=$1 AND storeid IS NULL AND isactive=true`, [platformCouponId]);
                    if (pc.rows.length) {
                        const c = pc.rows[0];
                        const totalActualSubTotal = cartRes.rows.reduce((sum, item) => {
                            const basePrice = item.variant_id ? Number(item.variant_price || 0) : Number(item.product_price || 0);
                            const promoPrice = item.variant_id
                                ? (item.variant_promotional_price != null ? Number(item.variant_promotional_price) : null)
                                : (item.promotionalprice != null ? Number(item.promotionalprice) : null);
                            const finalUnitPrice = (promoPrice !== null && promoPrice > 0) ? promoPrice : basePrice;
                            return sum + finalUnitPrice * item.quantity;
                        }, 0);
                        
                        globalPlatformDiscount = c.discounttype === 'PERCENTAGE'
                            ? Math.min(totalActualSubTotal * Number(c.discountvalue) / 100, c.maxdiscount ? Number(c.maxdiscount) : Infinity)
                            : Number(c.discountvalue);
                        globalPlatformDiscount = Math.round(Math.min(globalPlatformDiscount, totalActualSubTotal));
                        resolvedGlobalPlatformCouponId = c.id;
                    }
                } catch(e) {}
            }

            const vatRate = 0;
            const now = simulated_time ? new Date(simulated_time) : new Date();

            await client.query('BEGIN');

            const createdOrders = [];
            let remainingPlatformDiscount = globalPlatformDiscount;
            const orderGroups = Object.values(storeGroups);

            for (let orderIndex = 0; orderIndex < orderGroups.length; orderIndex++) {
                const group = orderGroups[orderIndex];
                const isLastOrder = orderIndex === orderGroups.length - 1;
                
                let baseSubTotal = 0;   // Tổng tiền theo giá gốc
                let actualSubTotal = 0; // Tổng tiền khách thực sự phải trả cho món hàng (đã trừ khuyến mãi sản phẩm)

                for (const item of group.items) {
                    const basePrice = item.variant_id
                        ? Number(item.variant_price || 0)
                        : Number(item.product_price || 0);
                    
                    const promoPrice = item.variant_id
                        ? (item.variant_promotional_price != null ? Number(item.variant_promotional_price) : null)
                        : (item.promotionalprice != null ? Number(item.promotionalprice) : null);

                    const finalUnitPrice = (promoPrice !== null && promoPrice > 0) ? promoPrice : basePrice;

                    baseSubTotal += basePrice * item.quantity;
                    actualSubTotal += finalUnitPrice * item.quantity;
                }

                // Chia đều phí ship, COD, và insurance cho các đơn hàng
                const sharedDeliveryPrice = Math.ceil(deliveryPrice / numberOfOrders);
                const sharedCodSurcharge = Math.ceil(globalCodSurcharge / numberOfOrders);
                const sharedInsuranceFee = Math.ceil(globalInsuranceFee / numberOfOrders);
                const sharedFuelSurcharge = Math.ceil(globalFuelSurcharge / numberOfOrders);
                const sharedBaseShippingFee = Math.ceil(globalBaseShippingFee / numberOfOrders);
                const totalDelivery = sharedDeliveryPrice + sharedCodSurcharge + sharedInsuranceFee;

                // Apply coupons
                let shopDiscount = 0;
                let platformDiscount = 0;
                let resolvedShopCouponId = null;
                let resolvedPlatformCouponId = null;

                try {
                    // Shop coupon: áp riêng cho từng shop
                    if (shopCouponId) {
                        const sc = await client.query(`SELECT * FROM coupon WHERE id=$1 AND storeid=$2 AND isactive=true`, [shopCouponId, group.store_id]);
                        if (sc.rows.length) {
                            const c = sc.rows[0];
                            shopDiscount = c.discounttype === 'PERCENTAGE'
                                ? Math.min(actualSubTotal * Number(c.discountvalue) / 100, c.maxdiscount ? Number(c.maxdiscount) : Infinity)
                                : Number(c.discountvalue);
                            shopDiscount = Math.round(Math.min(shopDiscount, actualSubTotal));
                            resolvedShopCouponId = c.id;
                        }
                    }
                    // Platform coupon: chia đều cho các đơn, đơn cuối lấy phần còn lại
                    if (globalPlatformDiscount > 0) {
                        if (isLastOrder) {
                            platformDiscount = remainingPlatformDiscount;
                        } else {
                            platformDiscount = Math.floor(globalPlatformDiscount / numberOfOrders);
                            remainingPlatformDiscount -= platformDiscount;
                        }
                        resolvedPlatformCouponId = resolvedGlobalPlatformCouponId;
                    }
                } catch(e) { }

                const totalDiscount = shopDiscount + platformDiscount;
                
                // Tính tổng tiền: (giá sản phẩm + phí vận chuyển) - giảm giá
                const totalAmountBeforeDiscount = actualSubTotal + totalDelivery;
                const finalPrice = Math.max(0, totalAmountBeforeDiscount - totalDiscount);

                const vatAmount = 0;
                const sellerNetIncome = actualSubTotal - shopDiscount; 

                const orderId = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();

                const initialCodStatus = dbPaymentMethod === 'COD' ? 'NOT_COLLECTED' : null;
                const orderRes = await client.query(
                    `INSERT INTO orders (id, user_id, total_amount, status, paymentmethod, codstatus,
                        shippingaddressline1, shippingaddressline2, shippingcity, shippingdistrict,
                        shippingphone, deliveryprice, storeid, storename, price, finalprice,
                        carrier_id, received, created_at, updated_at)
                     VALUES ($1, $2, $3, 'CREATED', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, false, $17, $17)
                     RETURNING *`,
                    [
                        orderId, userId, totalAmountBeforeDiscount, dbPaymentMethod, initialCodStatus,
                        shippingAddressLine1 || '', shippingAddressLine2 || '',
                        shippingCity || '', shippingDistrict || '',
                        phone || '', totalDelivery,
                        group.store_id, group.store_name,
                        baseSubTotal,
                        finalPrice,
                        carrierId,
                        now.toISOString()
                    ]
                );

                    await client.query(
                        `UPDATE orders SET service_id=$2, insurance_fee=$3, cod_surcharge=$4, use_insurance=$5,
                         shop_coupon_id=$6, shop_discount=$7, platform_coupon_id=$8, platform_discount=$9, fuel_surcharge=$10, base_shipping_fee=$11 WHERE id=$1`,
                    [
                        orderId, 
                        serviceId || null, 
                        sharedInsuranceFee || 0, 
                        sharedCodSurcharge || 0, 
                        useInsurance ? true : false, 
                        resolvedShopCouponId || null, 
                        shopDiscount || 0, 
                        resolvedPlatformCouponId || null, 
                        platformDiscount || 0,
                        sharedFuelSurcharge || 0,
                        sharedBaseShippingFee || 0
                    ]
                    );

                // Increment usedcount + insert couponusage
                if (resolvedShopCouponId) {
                    await client.query(`UPDATE coupon SET usedcount = usedcount + 1 WHERE id = $1`, [resolvedShopCouponId]);
                    await client.query(
                        `INSERT INTO couponusage (couponid, userid, orderid, couponcode, discounttype, discountvalue, usedat)
                         SELECT id, $2, $3, code, discounttype, discountvalue, $4 FROM coupon WHERE id=$1`,
                        [resolvedShopCouponId, userId, orderId, now.toISOString()]
                    );
                }
                // Platform coupon: chỉ increment 1 lần cho đơn đầu tiên
                if (resolvedPlatformCouponId && orderIndex === 0) {
                    await client.query(`UPDATE coupon SET usedcount = usedcount + 1 WHERE id = $1`, [resolvedPlatformCouponId]);
                }
                // Nhưng vẫn insert usage record cho từng đơn để tracking
                if (resolvedPlatformCouponId) {
                    await client.query(
                        `INSERT INTO couponusage (couponid, userid, orderid, couponcode, discounttype, discountvalue, usedat)
                         SELECT id, $2, $3, code, discounttype, discountvalue, $4 FROM coupon WHERE id=$1`,
                        [resolvedPlatformCouponId, userId, orderId, now.toISOString()]
                    );
                }

                // Tạo orderitem cho từng sản phẩm
                for (const item of group.items) {
                    const itemPrice = item.variant_id
                        ? Number(item.variant_price || 0)
                        : Number(item.product_price || 0);
                    const itemPromoPrice = item.variant_id
                        ? (item.variant_promotional_price != null ? Number(item.variant_promotional_price) : null)
                        : (item.promotionalprice != null ? Number(item.promotionalprice) : null);
                    const imageUrl = item.primary_image || item.product_image || '';

                    await client.query(
                        `INSERT INTO orderitem (orderid, productid, variantid, count, price, promotionalprice, productname, variantname, productimage, createat, updateat)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
                        [orderId, item.product_id, item.variant_id || null, item.quantity, itemPrice, itemPromoPrice, item.product_name, item.variant_sku || null, imageUrl, now.toISOString()]
                    );

                    // Giảm kho hàng khi đặt đơn thành công
                    if (item.variant_id) {
                        // Nếu có variant_id, trừ stock của variant
                        await client.query(
                            `UPDATE product_variants SET stock = GREATEST(0, COALESCE(stock, 0) - $1) WHERE id = $2`,
                            [item.quantity, item.variant_id]
                        );
                    } else {
                        // Nếu không có variant_id, trừ stock của product chính
                        await client.query(
                            `UPDATE products SET stock = GREATEST(0, COALESCE(stock, 0) - $1) WHERE id = $2`,
                            [item.quantity, item.product_id]
                        );
                    }
                    
                    // Cập nhật số lượng đã bán cho product
                    await client.query(
                        `UPDATE products SET sold = COALESCE(sold, 0) + $1 WHERE id = $2`,
                        [item.quantity, item.product_id]
                    );
                }

                // ====== OUTBOX PATTERN: Ghi task blockchain vào outbox (atomic với DB) ======
                const blockchainItems = group.items.map(item => {
                    const basePrice = item.variant_id ? Number(item.variant_price || 0) : Number(item.product_price || 0);
                    const promoPrice = item.variant_id 
                        ? (item.variant_promotional_price != null ? Number(item.variant_promotional_price) : null)
                        : (item.promotionalprice != null ? Number(item.promotionalprice) : null);
                    const finalUnitPrice = (promoPrice !== null && promoPrice > 0) ? promoPrice : basePrice;
                    return {
                        productID: String(item.product_id),
                        variantID: item.variant_id ? String(item.variant_id) : "",
                        productName: item.product_name,
                        unitPrice: finalUnitPrice,
                        quantity: Number(item.quantity)
                    };
                });

                const fullShippingAddress = `${shippingAddressLine1 || ''} ${shippingAddressLine2 || ''} ${shippingDistrict || ''} ${shippingCity || ''}`.trim();
                const sellerEmail = group.items[0].seller_email || '';
                const sellerChainUsername = (sellerEmail.split('@')[0] || group.store_name || 'seller').replace(/[^a-zA-Z0-9]/g, '');

                const adapterPayload = {
                    orderID: orderId,
                    sellerData: { 
                        storeId: String(group.store_id), 
                        storeName: sellerChainUsername, 
                        customerID: String(userId),
                        items: blockchainItems,
                        taxCode: group.tax_id,
                        FinalPrice: finalPrice, 
                        TotalAmount: actualSubTotal, 
                        TaxAmount: vatAmount, 
                        sellerNetIncome: sellerNetIncome > 0 ? sellerNetIncome : 0, 
                        platformDiscountAmount: platformDiscount || 0,
                        shopDiscountAmount: shopDiscount || 0
                    },
                    shipperData: {
                        carrierId: String(carrierId), 
                        carrierName: carrierName,
                        method: shippingMethod, 
                        shippingAddress: fullShippingAddress,
                        phone: phone,
                        shippingFee: totalDelivery 
                    },
                    metadata: {
                        paymentMethod: dbPaymentMethod,
                        finalPrice: finalPrice 
                    },
                    simulatedTime: simulated_time ? now.toISOString() : undefined,
                    requestorOrg: 'platform',
                    requestorUser: 'admin-ca-platform'
                };

                await client.query(
                    `INSERT INTO blockchain_outbox (order_id, action, payload) VALUES ($1, $2, $3)`,
                    [orderId, 'CREATE_ORDER', JSON.stringify(adapterPayload)]
                );
                console.log(` [Outbox] Đã ghi task CREATE_ORDER cho đơn ${orderId}`);

                createdOrders.push(orderRes.rows[0]);
            }

            // Xóa giỏ hàng sau khi đặt thành công
            await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

            await client.query('COMMIT');

            res.json({ message: 'Đặt hàng thành công', orders: createdOrders });
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('createOrder error:', e.message);
            res.status(500).json({ detail: `Lỗi đặt hàng: ${e.message}` });
        } finally {
            client.release();
        }
    }

    // GET /v1/orders — danh sách đơn hàng của user
    async getOrders(req, res) {
        const userId = req.user.user_id;
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT o.id, o.total_amount, o.status, o.paymentmethod, o.codstatus, o.created_at, o.updated_at,
                        o.storeid, o.storename, o.finalprice, o.price, o.deliveryprice,
                        o.shippingaddressline1, o.shippingcity, o.received,
                        o.shop_coupon_id, o.shop_discount, o.platform_coupon_id, o.platform_discount,
                        o.fuel_surcharge, o.base_shipping_fee, o.cod_surcharge, o.insurance_fee,
                        sc.code as shop_coupon_code, sc.description as shop_coupon_description,
                        pc.code as platform_coupon_code, pc.description as platform_coupon_description,
                        (SELECT json_agg(json_build_object(
                            'id', oi.id, 'product_id', oi.productid, 'variant_id', oi.variantid,
                            'quantity', oi.count, 'price', oi.price, 'promotional_price', oi.promotionalprice,
                            'product_name', oi.productname, 'variant_name', oi.variantname, 'image', oi.productimage
                        )) FROM orderitem oi WHERE oi.orderid = o.id) AS items
                 FROM orders o
                 LEFT JOIN coupon sc ON o.shop_coupon_id = sc.id
                 LEFT JOIN coupon pc ON o.platform_coupon_id = pc.id
                 WHERE o.user_id = $1
                 ORDER BY o.created_at DESC`,
                [userId]
            );
            res.json({ orders: result.rows });
        } catch (e) {
            console.error('getOrders error:', e.message);
            res.status(500).json({ detail: 'Lỗi server' });
        } finally {
            client.release();
        }
    }

    // GET /v1/orders/:id — chi tiết đơn hàng
    async getOrder(req, res) {
        const userId = req.user.user_id;
        const { id } = req.params;
        const client = await pool.connect();
        try {
            const orderRes = await client.query(
                `SELECT o.id, o.total_amount, o.status, o.paymentmethod, o.codstatus, o.created_at, o.updated_at,
                        o.storeid, o.storename, o.finalprice, o.price, o.deliveryprice,
                        o.shippingaddressline1, o.shippingaddressline2, o.shippingcity, o.shippingdistrict,
                        o.shippingphone, o.received, o.fuel_surcharge, o.base_shipping_fee, o.cod_surcharge, o.insurance_fee,
                        o.shop_coupon_id, o.shop_discount, o.platform_coupon_id, o.platform_discount,
                        sc.code as shop_coupon_code, sc.description as shop_coupon_description,
                        pc.code as platform_coupon_code, pc.description as platform_coupon_description
                 FROM orders o
                 LEFT JOIN coupon sc ON o.shop_coupon_id = sc.id
                 LEFT JOIN coupon pc ON o.platform_coupon_id = pc.id
                 WHERE o.id = $1 AND o.user_id = $2`,
                [id, userId]
            );
            if (orderRes.rows.length === 0) {
                return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            }

            const itemsRes = await client.query(
                `SELECT oi.id, oi.productid AS product_id, oi.variantid AS variant_id,
                        oi.count AS quantity, oi.price, oi.promotionalprice AS promotional_price,
                        oi.productname AS product_name, oi.variantname AS variant_name, oi.productimage AS image
                 FROM orderitem oi
                 WHERE oi.orderid = $1`,
                [id]
            );

            res.json({
                order: orderRes.rows[0],
                items: itemsRes.rows
            });
        } catch (e) {
            console.error('getOrder error:', e.message);
            res.status(500).json({ detail: 'Lỗi server' });
        } finally {
            client.release();
        }
    }
    // POST /v1/orders/:id/cancel — customer hủy đơn (CREATED hoặc PAID)
    async cancelOrder(req, res) {
        const userId = req.user.user_id;
        const { id } = req.params;
        const { simulated_time } = req.query;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const r = await client.query(`SELECT * FROM orders WHERE id = $1 AND user_id = $2`, [id, userId]);
            if (r.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            }
            
            const o = r.rows[0];
            if (!['CREATED', 'PAID'].includes(o.status)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Chỉ hủy được đơn ở trạng thái CREATED hoặc PAID (hiện tại: ${o.status})` });
            }

            // ====== BLOCKCHAIN GUARD: Chặn nếu đơn không tồn tại trên Blockchain ======
            const guard = await requireBlockchainSync(id, client);
            if (guard) {
                await client.query('ROLLBACK');
                return res.status(409).json({ detail: guard.message, sync_status: guard.status });
            }

            const now = simulated_time ? new Date(simulated_time) : new Date();

            const result = await client.query(
                `UPDATE orders SET status = 'CANCELLED', updated_at = $2 WHERE id = $1 RETURNING id, status, updated_at`,
                [id, now.toISOString()]
            );

            // ====== GHI TRACKING LOG ======
            await logTracking(client, {
                orderId: id,
                status: 'CANCELLED',
                codstatus: o.codstatus || null,
                event: 'CANCEL_ORDER',
                carrierId: o.carrier_id,
                shipperId: o.shipper_id,
                notes: 'Khách hàng tự hủy đơn',
                changedBy: userId,
                timestamp: now,
            });

            // ====== OUTBOX PATTERN: Ghi task hủy đơn vào outbox ======
            await client.query(
                `INSERT INTO blockchain_outbox (order_id, action, payload) VALUES ($1, $2, $3)`,
                [id, 'CANCEL_ORDER', JSON.stringify({
                    orderID: id,
                    simulatedTime: simulated_time ? now.toISOString() : undefined,
                    requestorOrg: 'platform',
                    requestorUser: 'admin-ca-platform'
                })]
            );
            console.log(` [Outbox] Đã ghi task CANCEL_ORDER cho đơn ${id}`);

            await client.query('COMMIT');
            res.json({ message: `Đã hủy đơn hàng thành công`, order: result.rows[0] });

        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('cancelOrder error:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // GET /v1/orders/addresses
    async getAddresses(req, res) {
        const userId = req.user.user_id;
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
                [userId]
            );
            res.json({ addresses: result.rows });
        } catch(e) {
            console.error('getAddresses:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally { client.release(); }
    }

    // POST /v1/orders/addresses
    async createAddress(req, res) {
        const userId = req.user.user_id;
        const { label, full_name, phone, address_line1, address_line2, province, district, is_default } = req.body;
        if (!full_name || !phone || !address_line1 || !province) {
            return res.status(400).json({ detail: 'Thiếu thông tin bắt buộc' });
        }
        const client = await pool.connect();
        try {
            // Kiểm tra giới hạn 6 địa chỉ
            const countRes = await client.query('SELECT COUNT(*) FROM user_addresses WHERE user_id = $1', [userId]);
            if (parseInt(countRes.rows[0].count) >= 6) {
                return res.status(400).json({ detail: 'Chỉ được lưu tối đa 6 địa chỉ giao hàng.' });
            }

            await client.query('BEGIN');
            if (is_default) {
                await client.query(`UPDATE user_addresses SET is_default = false WHERE user_id = $1`, [userId]);
            }
            const result = await client.query(
                `INSERT INTO user_addresses (user_id, label, full_name, phone, address_line1, address_line2, province, district, is_default)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
                [userId, label||'Nhà', full_name, phone, address_line1, address_line2||null, province, district||null, is_default||false]
            );
            await client.query('COMMIT');
            res.json({ address: result.rows[0] });
        } catch(e) {
            await client.query('ROLLBACK').catch(()=>{});
            console.error('createAddress:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally { client.release(); }
    }

    // PUT /v1/orders/addresses/:id
    async updateAddress(req, res) {
        const userId = req.user.user_id;
        const { id } = req.params;
        const { label, full_name, phone, address_line1, address_line2, province, district, is_default } = req.body;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (is_default) {
                await client.query(`UPDATE user_addresses SET is_default = false WHERE user_id = $1`, [userId]);
            }
            const result = await client.query(
                `UPDATE user_addresses SET label=$1,full_name=$2,phone=$3,address_line1=$4,address_line2=$5,province=$6,district=$7,is_default=$8,updated_at=NOW()
                 WHERE id=$9 AND user_id=$10 RETURNING *`,
                [label||'Nhà', full_name, phone, address_line1, address_line2||null, province, district||null, is_default||false, id, userId]
            );
            await client.query('COMMIT');
            if (result.rows.length === 0) return res.status(404).json({ detail: 'Không tìm thấy địa chỉ' });
            res.json({ address: result.rows[0] });
        } catch(e) {
            await client.query('ROLLBACK').catch(()=>{});
            console.error('updateAddress:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally { client.release(); }
    }

    // DELETE /v1/orders/addresses/:id
    async deleteAddress(req, res) {
        const userId = req.user.user_id;
        const { id } = req.params;
        const client = await pool.connect();
        try {
            await client.query(`DELETE FROM user_addresses WHERE id=$1 AND user_id=$2`, [id, userId]);
            res.json({ success: true });
        } catch(e) {
            console.error('deleteAddress:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally { client.release(); }
    }

    // POST /v1/orders/:id/upload-payment-proof
    async uploadPaymentProof(req, res) {
        const userId = req.user.user_id;
        const { id } = req.params;
        
        if (!req.file) {
            return res.status(400).json({ detail: 'Cần upload file ảnh chứng từ thanh toán' });
        }

        const client = await pool.connect();
        try {
            // Kiểm tra order có thuộc về user và có phải PREPAID không
            const orderCheck = await client.query(
                `SELECT id, status, paymentmethod FROM orders WHERE id = $1 AND user_id = $2`,
                [id, userId]
            );

            if (orderCheck.rows.length === 0) {
                return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            }

            const order = orderCheck.rows[0];
            if (order.paymentmethod !== 'PREPAID') {
                return res.status(400).json({ detail: 'Chỉ được upload chứng từ cho đơn hàng thanh toán trước' });
            }

            if (order.status !== 'CREATED') {
                return res.status(400).json({ detail: 'Chỉ được upload chứng từ khi đơn hàng ở trạng thái CREATED' });
            }

            // Lưu đường dẫn file (relative path từ uploads/)
            const proofUrl = `/uploads/${req.file.filename}`;
            
            await client.query(
                `UPDATE orders SET 
                    payment_proof_url = $1, 
                    payment_verified = false, 
                    updated_at = NOW()
                 WHERE id = $2`,
                [proofUrl, id]
            );

            res.json({ 
                success: true, 
                message: 'Upload chứng từ thanh toán thành công. Vui lòng đợi admin xác nhận.',
                proof_url: proofUrl
            });

        } catch (error) {
            console.error('uploadPaymentProof error:', error.message);
            res.status(500).json({ detail: 'Lỗi server: ' + error.message });
        } finally {
            client.release();
        }
    }

    // POST /v1/orders/:id/reviews - Customer đánh giá đơn hàng (1 lần/đơn)
    async createOrderReview(req, res) {
        const userId = req.user.user_id;
        const { id } = req.params;
        const { rating, content } = req.body || {};
        const score = Number(rating);

        if (!Number.isInteger(score) || score < 1 || score > 5) {
            return res.status(400).json({ detail: 'Rating phải là số nguyên từ 1 đến 5' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const orderRes = await client.query(
                `SELECT id, status FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
                [id, userId]
            );

            if (orderRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            }

            const st = String(orderRes.rows[0].status || '').toUpperCase();
            if (!['DELIVERED', 'SETTLED', 'COMPLETED'].includes(st)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: 'Chỉ đánh giá được đơn đã hoàn tất/giao thành công' });
            }

            const userRes = await client.query(
                `SELECT COALESCE(firstname || ' ' || lastname, email, 'User') AS username, avatar
                 FROM users WHERE id = $1`,
                [userId]
            );
            const username = (userRes.rows[0]?.username || 'User').trim();
            const useravatar = userRes.rows[0]?.avatar || null;

            const itemsRes = await client.query(
                `SELECT oi.productid AS product_id, oi.productname AS product_name
                 FROM orderitem oi WHERE oi.orderid = $1`,
                [id]
            );

            if (itemsRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: 'Đơn hàng không có sản phẩm để đánh giá' });
            }

            // Chặt chẽ: 1 user chỉ được review mỗi product trong order đúng 1 lần.
            const productIds = itemsRes.rows.map(r => r.product_id);
            const existed = await client.query(
                `SELECT DISTINCT productid FROM review WHERE userid = $1 AND productid = ANY($2::text[])`,
                [userId, productIds]
            );
            if (existed.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ detail: 'Bạn đã đánh giá một phần/toàn bộ sản phẩm trong đơn này' });
            }

            const now = new Date();
            for (const item of itemsRes.rows) {
                await client.query(
                    `INSERT INTO review (content, createat, rating, updateat, productname, username, useravatar, productid, userid)
                     VALUES ($1, $2::date, $3, $2::date, $4, $5, $6, $7, $8)`,
                    [(content || '').trim() || null, now.toISOString(), score, item.product_name || '', username, useravatar, String(item.product_id), userId]
                );
            }

            await client.query('COMMIT');
            return res.json({ success: true, message: 'Đánh giá thành công' });
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            if (e?.code === '42P01') {
                return res.status(500).json({ detail: 'Thiếu bảng order_reviews. Cần migrate DB trước khi dùng review.' });
            }
            console.error('createOrderReview error:', e.message);
            return res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // POST /v1/orders/:id/request-return - Customer yêu cầu hoàn trả
    async requestReturn(req, res) {
        const { id } = req.params;
        const userId = req.user.user_id;
        const { simulated_time } = req.query;
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Validate order belongs to user and is in DELIVERED status
            const orderRes = await client.query(`
                SELECT * FROM orders WHERE id = $1 AND user_id = $2
            `, [id, userId]);
            
            if (orderRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            }
            
            const order = orderRes.rows[0];
            
            if (order.status !== 'DELIVERED') {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: 'Chỉ có thể yêu cầu hoàn trả đơn hàng đã giao' });
            }

            // ====== BLOCKCHAIN GUARD: Chặn nếu đơn không tồn tại trên Blockchain ======
            const guard = await requireBlockchainSync(id, client);
            if (guard) {
                await client.query('ROLLBACK');
                return res.status(409).json({ detail: guard.message, sync_status: guard.status });
            }
            
            // Lấy Return Window từ Blockchain (hoặc dùng mặc định 5 phút)
            let returnWindowMinutes = 5;
            try {
                const bizRes = await axios.get(`${BLOCKCHAIN_ADAPTER_URL}/config/business?requestorOrg=platform&requestorUser=admin-ca-platform`);
                if (bizRes.data?.success) {
                    returnWindowMinutes = Number(bizRes.data.data.returnWindowMinutes);
                }
            } catch (e) {
                console.warn(` Không kết nối được cấu hình Blockchain, dùng mặc định (Return Window ${returnWindowMinutes}p)`);
            }
            
            // Check return window from delivered time
            const deliveredAt = new Date(order.updated_at);
            const now = simulated_time ? new Date(simulated_time) : new Date();
            const diffMs = now - deliveredAt;
            
            if (diffMs > returnWindowMinutes * 60 * 1000) {
                await client.query('ROLLBACK');
                return res.status(400).json({ detail: `Đã quá thời gian cho phép hoàn trả (${returnWindowMinutes} phút kể từ khi giao)` });
            }
            
            // Update order status
            const updateRes = await client.query(`
                UPDATE orders 
                SET status = 'RETURN_REQUESTED', updated_at = $2 
                WHERE id = $1 
                RETURNING id, status, updated_at
            `, [id, now.toISOString()]);

            // ====== GHI TRACKING LOG ======
            await logTracking(client, {
                orderId: id,
                status: 'RETURN_REQUESTED',
                codstatus: order.codstatus || null,
                event: 'REQUEST_RETURN',
                carrierId: order.carrier_id,
                shipperId: order.shipper_id,
                notes: 'Khách hàng yêu cầu hoàn trả',
                changedBy: userId,
                timestamp: now,
            });

            // ====== OUTBOX PATTERN: Ghi task trả hàng vào outbox ======
            await client.query(
                `INSERT INTO blockchain_outbox (order_id, action, payload) VALUES ($1, $2, $3)`,
                [id, 'REQUEST_RETURN', JSON.stringify({
                    orderID: id,
                    simulatedTime: simulated_time ? now.toISOString() : undefined,
                    requestorOrg: 'platform',
                    requestorUser: 'admin-ca-platform'
                })]
            );
            console.log(` [Outbox] Đã ghi task REQUEST_RETURN cho đơn ${id}`);
            
            await client.query('COMMIT');
            
            res.json({
                success: true,
                message: `Đã yêu cầu hoàn trả thành công. Shipper sẽ sớm liên hệ để lấy hàng.`,
                order: updateRes.rows[0]
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('requestReturn error:', error.message);
            res.status(500).json({ detail: 'Lỗi server: ' + error.message });
        } finally {
            client.release();
        }
    }

    // GET /v1/orders/:id/tracking — Lịch sử tracking đơn hàng (chỉ chủ đơn mới xem được)
    async getOrderTracking(req, res) {
        const userId = req.user.user_id;
        const { id } = req.params;
        const client = await pool.connect();
        try {
            // Kiểm tra đơn thuộc về user này
            const orderCheck = await client.query(
                `SELECT id, status, codstatus, paymentmethod FROM orders WHERE id = $1 AND user_id = $2`,
                [id, userId]
            );
            if (orderCheck.rows.length === 0) {
                return res.status(404).json({ detail: 'Không tìm thấy đơn hàng' });
            }

            const { getTrackingHistory } = require('../services/trackingService');
            const history = await getTrackingHistory(client, id);

            res.json({
                order_id: id,
                current_status: orderCheck.rows[0].status,
                current_codstatus: orderCheck.rows[0].codstatus,
                tracking: history
            });
        } catch (e) {
            console.error('getOrderTracking error:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }
}

module.exports = new OrderController();
