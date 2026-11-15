const pool = require('../config/database');

const MAJOR_CITIES = ['hồ chí minh', 'ho chi minh', 'hcm', 'tp.hcm', 'tp hcm', 'hà nội', 'ha noi', 'hanoi', 'đà nẵng', 'da nang'];

function determineZone(destProvince, originProvince) {
    if (!destProvince || !originProvince) return 'lien_tinh';
    const dest = destProvince.trim().toLowerCase();
    const origin = originProvince.trim().toLowerCase();
    if (dest === origin || dest.includes(origin) || origin.includes(dest)) {
        const isMajor = MAJOR_CITIES.some(c => dest.includes(c) || origin.includes(c));
        return isMajor ? 'noi_thanh' : 'noi_tinh';
    }
    return 'lien_tinh';
}

class ShippingController {

    // GET /v1/shipping/carriers
    async getCarriers(req, res) {
        const client = await pool.connect();
        try {
            const carriersRes = await client.query(
                `SELECT sp.user_id, sp.display_name, sp.description, sp.logo_url,
                        sp.estimated_days_local, sp.estimated_days_national, sp.origin_province,
                        (SELECT json_agg(
                          json_build_object(
                            'id', s.id,
                            'service_code', s.service_code,
                            'service_name', s.service_name,
                            'is_active', s.is_active,
                            'estimated_days_noi_thanh', s.estimated_days_noi_thanh,
                            'estimated_days_noi_tinh', s.estimated_days_noi_tinh,
                            'estimated_days_lien_tinh', s.estimated_days_lien_tinh,
                            'sort_order', s.sort_order,
                            'rates', (SELECT json_agg(r ORDER BY r.zone_type, r.weight_from)
                                      FROM shipping_rates r WHERE r.service_id = s.id)
                          ) ORDER BY s.sort_order, s.id
                        ) FROM shipping_services s WHERE s.carrier_id::text = sp.user_id::text AND s.is_active = true) AS services,
                        (SELECT row_to_json(sc) FROM shipping_surcharges sc WHERE sc.carrier_id::text = sp.user_id::text) AS surcharges,
                        (SELECT json_agg(sr ORDER BY sr.zone, sr.weight_from)
                         FROM shipping_rates sr WHERE sr.shipper_id::text = sp.user_id::text AND sr.service_id IS NULL) AS legacy_rates
                 FROM shipper_profiles sp
                 WHERE sp.is_active = true
                 ORDER BY sp.display_name`
            );
            res.json({ carriers: carriersRes.rows });
        } catch (e) {
            console.error('getCarriers error:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // GET /v1/shipping/calculate?carrier_id=X&service_id=Y&weight=Z&dest_province=A&order_value=N&payment=COD&use_insurance=false
    async calculateFee(req, res) {
        const { carrier_id, service_id, weight, dest_province, destination_city, origin_city, order_value, payment, use_insurance } = req.query;
        if (!carrier_id) return res.status(400).json({ detail: 'Thiếu carrier_id' });

        const w = parseFloat(weight) || 0.5;
        const orderVal = parseInt(order_value) || 0;
        const useIns = use_insurance === 'true';
        const isCOD = (payment || '').toUpperCase() === 'COD';

        const client = await pool.connect();
        try {
            const profileRes = await client.query(`SELECT origin_province FROM shipper_profiles WHERE user_id = $1`, [carrier_id]);
            const originProv = profileRes.rows[0]?.origin_province || 'Hồ Chí Minh';

            const destProv = dest_province || destination_city || '';
            const zoneType = determineZone(destProv, originProv);

            let baseFee = 30000;
            let serviceInfo = null;

            if (service_id) {
                const rateRes = await client.query(
                    `SELECT sr.base_fee, sr.per_kg_fee, sr.weight_from,
                            ss.service_name, ss.estimated_days_noi_thanh, ss.estimated_days_noi_tinh, ss.estimated_days_lien_tinh
                     FROM shipping_rates sr
                     JOIN shipping_services ss ON ss.id = sr.service_id
                     WHERE sr.service_id = $1 AND sr.zone_type = $2
                       AND sr.weight_from <= $3 AND (sr.weight_to IS NULL OR sr.weight_to > $3)
                     ORDER BY sr.weight_from DESC LIMIT 1`,
                    [service_id, zoneType, w]
                );
                if (rateRes.rows.length > 0) {
                    const r = rateRes.rows[0];
                    baseFee = Number(r.base_fee) + Math.max(0, w - Number(r.weight_from)) * Number(r.per_kg_fee);
                    const days = zoneType === 'noi_thanh' ? r.estimated_days_noi_thanh : (zoneType === 'noi_tinh' ? r.estimated_days_noi_tinh : r.estimated_days_lien_tinh);
                    serviceInfo = { service_name: r.service_name, estimated_days: days };
                }
            } else {
                const legacyZone = zoneType === 'lien_tinh' ? 'national' : 'local';
                const rateRes = await client.query(
                    `SELECT base_fee, per_kg_fee, weight_from FROM shipping_rates
                     WHERE shipper_id = $1 AND zone = $2 AND service_id IS NULL
                       AND weight_from <= $3 AND (weight_to IS NULL OR weight_to > $3)
                     ORDER BY weight_from DESC LIMIT 1`,
                    [carrier_id, legacyZone, w]
                );
                if (rateRes.rows.length > 0) {
                    const r = rateRes.rows[0];
                    baseFee = Number(r.base_fee) + Math.max(0, w - Number(r.weight_from)) * Number(r.per_kg_fee);
                }
            }

            const surchargeRes = await client.query(`SELECT * FROM shipping_surcharges WHERE carrier_id = $1`, [carrier_id]);
            const sc = surchargeRes.rows[0] || {};

            let codSurcharge = 0;
            if (isCOD && orderVal > 0 && Number(sc.cod_fee_percent) > 0) {
                codSurcharge = Math.ceil(orderVal * Number(sc.cod_fee_percent) / 100);
                if (Number(sc.cod_fee_min) > 0) codSurcharge = Math.max(codSurcharge, Number(sc.cod_fee_min));
                if (Number(sc.cod_fee_max) > 0) codSurcharge = Math.min(codSurcharge, Number(sc.cod_fee_max));
            }

            let insuranceFee = 0;
            if (useIns && orderVal > 0 && Number(sc.insurance_fee_percent) > 0) {
                insuranceFee = Math.ceil(orderVal * Number(sc.insurance_fee_percent) / 100);
            }

            const fuelSurcharge = Number(sc.fuel_surcharge_percent) > 0 ? Math.ceil(baseFee * Number(sc.fuel_surcharge_percent) / 100) : 0;
            const totalFee = Math.round(baseFee) + codSurcharge + insuranceFee + fuelSurcharge;

            res.json({
                carrier_id,
                service_id: service_id || null,
                zone_type: zoneType,
                weight: w,
                base_shipping_fee: Math.round(baseFee),
                cod_surcharge: codSurcharge,
                insurance_fee: insuranceFee,
                fuel_surcharge: fuelSurcharge,
                total_fee: totalFee,
                // legacy field for backwards compat
                fee: totalFee,
                ...(serviceInfo || {})
            });
        } catch (e) {
            console.error('calculateFee error:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // GET /v1/shipping/shippers - Get active shippers with basic info
    async getActiveShippers(req, res) {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT sp.user_id as shipper_id, sp.display_name, sp.logo_url, 
                       sp.description, sp.service_description,
                       sp.estimated_days_local, sp.estimated_days_national
                FROM shipper_profiles sp
                WHERE sp.is_active = true
                ORDER BY sp.display_name
            `);
            res.json({ shippers: result.rows });
        } catch (e) {
            console.error('getActiveShippers error:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }

    // GET /v1/shipping/calculate-all - Calculate shipping fees for all active shippers
    async calculateAllShippers(req, res) {
        const { weight, dest_province, order_value, payment_method } = req.query;
        
        const w = parseFloat(weight) || 0.5;
        const orderVal = parseInt(order_value) || 0;
        const isCOD = (payment_method || '').toUpperCase() === 'COD';
        
        const client = await pool.connect();
        try {
            // Get all active shippers
            const shippersRes = await client.query(`
                SELECT sp.user_id, sp.display_name, sp.logo_url, sp.description,
                       sp.origin_province, sp.estimated_days_local, sp.estimated_days_national
                FROM shipper_profiles sp
                WHERE sp.is_active = true
                ORDER BY sp.display_name
            `);
            
            if (shippersRes.rows.length === 0) {
                return res.json({ shippers: [] });
            }
            
            const results = [];
            
            for (const shipper of shippersRes.rows) {
                const originProv = shipper.origin_province || 'Hồ Chí Minh';
                const zoneType = determineZone(dest_province, originProv);
                
                // Get services for this shipper
                const servicesRes = await client.query(`
                    SELECT id, service_code, service_name, 
                           estimated_days_noi_thanh, estimated_days_noi_tinh, estimated_days_lien_tinh
                    FROM shipping_services
                    WHERE carrier_id::text = $1::text AND is_active = true
                    ORDER BY sort_order, id
                `, [shipper.user_id]);
                
                const services = [];
                
                for (const service of servicesRes.rows) {
                    // Get rate for this service and zone
                    const rateRes = await client.query(`
                        SELECT base_fee, per_kg_fee, weight_from
                        FROM shipping_rates
                        WHERE service_id = $1 AND zone_type = $2
                          AND weight_from <= $3 AND (weight_to IS NULL OR weight_to > $3)
                        ORDER BY weight_from DESC LIMIT 1
                    `, [service.id, zoneType, w]);
                    
                    let baseFee = 30000; // Default
                    if (rateRes.rows.length > 0) {
                        const r = rateRes.rows[0];
                        baseFee = Number(r.base_fee) + Math.max(0, w - Number(r.weight_from)) * Number(r.per_kg_fee);
                    }
                    
                    // Get surcharges
                    const surchargeRes = await client.query(`
                        SELECT cod_fee_percent, cod_fee_min, cod_fee_max,
                               insurance_fee_percent, fuel_surcharge_percent
                        FROM shipping_surcharges
                        WHERE carrier_id::text = $1::text
                    `, [shipper.user_id]);
                    
                    let totalFee = baseFee;
                    const breakdown = { base_fee: baseFee };
                    
                    if (surchargeRes.rows.length > 0) {
                        const sc = surchargeRes.rows[0];
                        
                        // COD fee
                        if (isCOD && orderVal > 0) {
                            let codFee = (orderVal * Number(sc.cod_fee_percent || 0)) / 100;
                            if (sc.cod_fee_min) codFee = Math.max(codFee, Number(sc.cod_fee_min));
                            if (sc.cod_fee_max) codFee = Math.min(codFee, Number(sc.cod_fee_max));
                            totalFee += codFee;
                            breakdown.cod_fee = codFee;
                        }
                        
                        // Fuel surcharge
                        if (sc.fuel_surcharge_percent) {
                            const fuelFee = (baseFee * Number(sc.fuel_surcharge_percent)) / 100;
                            totalFee += fuelFee;
                            breakdown.fuel_surcharge = fuelFee;
                        }
                    }
                    
                    // Determine delivery time
                    const deliveryTime = zoneType === 'noi_thanh' 
                        ? service.estimated_days_noi_thanh 
                        : (zoneType === 'noi_tinh' ? service.estimated_days_noi_tinh : service.estimated_days_lien_tinh);
                    
                    services.push({
                        service_code: service.service_code,
                        service_name: service.service_name,
                        fee: Math.round(totalFee),
                        delivery_time: deliveryTime || '3-5 ngày',
                        breakdown: breakdown
                    });
                }
                
                // If no services found, create default service
                if (services.length === 0) {
                    console.warn(`Warning: Shipper ${shipper.display_name} has no services, using default`);
                    
                    // Create default standard service
                    const defaultFee = 30000; // Base fee
                    services.push({
                        service_code: 'STANDARD',
                        service_name: 'Tiêu chuẩn',
                        fee: defaultFee,
                        delivery_time: shipper.estimated_days_national || '3-5 ngày',
                        breakdown: { base_fee: defaultFee }
                    });
                }
                
                results.push({
                    shipper_id: shipper.user_id,
                    shipper_name: shipper.display_name,
                    logo_url: shipper.logo_url,
                    description: shipper.description,
                    services: services
                });
            }
            
            res.json({ shippers: results });
            
        } catch (e) {
            console.error('calculateAllShippers error:', e.message);
            res.status(500).json({ detail: 'Lỗi server: ' + e.message });
        } finally {
            client.release();
        }
    }
}

module.exports = new ShippingController();

