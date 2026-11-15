// backend-api/src/controllers/analyticsController.js
// ═══════════════════════════════════════════════════════════════
// Analytics Controller V3 — Multi-Org Dashboard APIs
// Query Trino Delta Lake gold layer for BI data
// ═══════════════════════════════════════════════════════════════

const fetch = require('node-fetch');

// ═══════════════════════════════════════════════════════════════
// TRINO CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const TRINO_HOST = process.env.TRINO_HOST || 'trino';
const TRINO_PORT = process.env.TRINO_PORT || '8080';
const TRINO_URL = `http://${TRINO_HOST}:${TRINO_PORT}/v1/statement`;

/**
 * Sanitize user input cho Trino SQL (không có parameterized queries)
 * Chỉ cho phép: chữ, số, dấu gạch ngang, gạch dưới, chấm
 */
function sanitize(value) {
    if (!value) return '';
    return String(value).replace(/[^a-zA-Z0-9\-_.]/g, '');
}


/**
 * Execute a query against Trino and return results
 */
async function queryTrino(sql) {
    try {
        const response = await fetch(TRINO_URL, {
            method: 'POST',
            headers: {
                'X-Trino-User': 'backend-api',
                'X-Trino-Catalog': 'delta',
                'X-Trino-Schema': 'gold',
                'Content-Type': 'text/plain',
            },
            body: sql,
        });

        if (!response.ok) {
            throw new Error(`Trino HTTP ${response.status}: ${await response.text()}`);
        }

        let result = await response.json();
        const allData = [];
        let columns = [];

        // Trino trả kết quả theo nhiều pages (nextUri).
        // Columns có thể xuất hiện ở BẤT KỲ response nào, không chỉ response đầu.
        if (result.columns) columns = result.columns;

        while (result.nextUri) {
            if (result.data) allData.push(...result.data);
            const nextResp = await fetch(result.nextUri, {
                headers: { 'X-Trino-User': 'backend-api' },
            });
            result = await nextResp.json();
            // Lấy columns từ response nào có
            if (result.columns && result.columns.length > 0) columns = result.columns;
        }
        if (result.data) allData.push(...result.data);

        if (result.error) {
            throw new Error(`Trino query error: ${result.error.message}`);
        }

        const columnNames = columns.map(c => c.name);
        const rows = allData.map(row => {
            const obj = {};
            columnNames.forEach((name, i) => { obj[name] = row[i]; });
            return obj;
        });

        return { columns: columnNames, rows, rowCount: rows.length };
    } catch (error) {
        console.error('[Analytics] Trino query failed:', error.message);
        throw error;
    }
}


// ═══════════════════════════════════════════════════════════════
// DATA FRESHNESS — cho biết data analytics cập nhật lần cuối khi nào
// Analytics dùng batch ETL (chạy 2h sáng), khác với DB (real-time)
// ═══════════════════════════════════════════════════════════════

let cachedFreshness = null;
let freshnessExpiry = 0;

/**
 * Lấy thời điểm pipeline chạy lần cuối (cache 60s để tránh query mỗi request)
 */
async function getDataFreshness() {
    const now = Date.now();
    if (cachedFreshness && now < freshnessExpiry) return cachedFreshness;

    try {
        const result = await queryTrino(`
            SELECT MAX(etl_processed_at) AS last_etl_at
            FROM delta.silver.tbl_orders_snapshot
        `);
        const lastEtl = result.rows[0]?.last_etl_at || null;
        cachedFreshness = {
            last_pipeline_run: lastEtl,
            source: 'Lakehouse (Trino → Delta Lake)',
            note: 'Dữ liệu được cập nhật theo batch ETL, không phải real-time. Chạy pipeline thủ công để cập nhật ngay.'
        };
        freshnessExpiry = now + 60_000; // cache 60 giây
    } catch (err) {
        cachedFreshness = {
            last_pipeline_run: null,
            source: 'Lakehouse (Trino → Delta Lake)',
            note: 'Không thể xác định thời điểm cập nhật'
        };
        freshnessExpiry = now + 10_000; // retry sau 10s nếu lỗi
    }
    return cachedFreshness;
}

/**
 * Helper: gửi response analytics kèm data_freshness
 */
async function sendAnalytics(res, data) {
    const freshness = await getDataFreshness();
    res.json({
        success: true,
        data,
        data_freshness: freshness,
    });
}


// ═══════════════════════════════════════════════════════════════
// ADMIN / PLATFORM ANALYTICS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/v1/analytics/admin/overview
 * Platform-wide KPIs
 */
const getAdminOverview = async (req, res) => {
    try {
        const result = await queryTrino(`
            SELECT
                COUNT(*)                                       AS total_orders,
                COUNT(CASE WHEN is_delivered THEN 1 END)       AS delivered_orders,
                COUNT(CASE WHEN is_cancelled THEN 1 END)       AS cancelled_orders,
                COUNT(CASE WHEN is_returned THEN 1 END)        AS returned_orders,
                COUNT(CASE WHEN is_settled THEN 1 END)         AS settled_orders,
                COALESCE(SUM(seller_total_amount), 0)          AS total_revenue,
                COALESCE(SUM(seller_vat_amount), 0)            AS total_vat,
                COALESCE(SUM(seller_net_income), 0)            AS total_net_income,
                COALESCE(SUM(shipping_fee), 0)                 AS total_shipping_fee,
                COALESCE(SUM(platform_discount), 0)            AS total_platform_discount,
                COALESCE(AVG(seller_total_amount), 0)          AS avg_order_value,
                COUNT(CASE WHEN is_prepaid THEN 1 END)         AS prepaid_count,
                COUNT(CASE WHEN is_cod THEN 1 END)             AS cod_count
            FROM delta.gold.fact_orders
        `);

        const taxSummary = await queryTrino(`
            SELECT
                COUNT(*)                           AS settled_count,
                COALESCE(SUM(taxable_revenue), 0)  AS total_taxable_revenue,
                COALESCE(SUM(tax_vat_amount), 0)   AS total_tax_collected
            FROM delta.gold.fact_tax
        `);

        await sendAnalytics(res, {
                orders: result.rows[0] || {},
                tax: taxSummary.rows[0] || {},
            });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/v1/analytics/admin/revenue-by-month
 */
const getRevenueByMonth = async (req, res) => {
    try {
        const result = await queryTrino(`
            SELECT
                year_month,
                SUM(seller_total_amount)  AS revenue,
                SUM(seller_vat_amount)    AS vat,
                SUM(seller_net_income)    AS net_income,
                SUM(platform_discount)    AS discount,
                COUNT(*)                  AS order_count
            FROM delta.gold.fact_orders
            WHERE year_month IS NOT NULL
            GROUP BY year_month
            ORDER BY year_month
        `);

        await sendAnalytics(res, result.rows);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/v1/analytics/admin/order-status
 */
const getOrderStatusDistribution = async (req, res) => {
    try {
        const result = await queryTrino(`
            SELECT
                order_status,
                COUNT(*)                  AS count,
                SUM(seller_total_amount)  AS revenue,
                SUM(seller_vat_amount)    AS vat
            FROM delta.gold.fact_orders
            GROUP BY order_status
            ORDER BY count DESC
        `);

        await sendAnalytics(res, result.rows);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/v1/analytics/admin/payment-methods
 */
const getPaymentMethodStats = async (req, res) => {
    try {
        const result = await queryTrino(`
            SELECT
                payment_method,
                COUNT(*)                  AS order_count,
                SUM(seller_total_amount)  AS total_revenue,
                AVG(seller_total_amount)  AS avg_value,
                SUM(cod_amount)           AS total_cod
            FROM delta.gold.fact_orders
            WHERE payment_method IS NOT NULL AND payment_method <> ''
            GROUP BY payment_method
            ORDER BY order_count DESC
        `);

        await sendAnalytics(res, result.rows);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


// ═══════════════════════════════════════════════════════════════
// SELLER ANALYTICS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/v1/analytics/seller/overview
 * All sellers summary (admin view)
 */
const getSellerOverview = async (req, res) => {
    try {
        const result = await queryTrino(`
            SELECT
                seller_company_id,
                seller_tax_code,
                total_orders,
                total_revenue,
                total_vat,
                total_net_income,
                total_platform_discount,
                avg_order_value,
                cancelled_count,
                return_count,
                settled_count,
                first_order_at,
                last_order_at
            FROM delta.gold.dim_seller
            ORDER BY total_revenue DESC
        `);

        await sendAnalytics(res, result.rows);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/v1/analytics/seller/revenue?seller_id=xxx
 * Seller-specific orders + summary (RLS filter)
 */
const getSellerRevenue = async (req, res) => {
    try {
        const sellerId = req.query.seller_id || req.user?.companyId;
        if (!sellerId) {
            return res.status(400).json({ success: false, error: 'seller_id required' });
        }

        const orders = await queryTrino(`
            SELECT
                order_id,
                order_status,
                payment_method,
                seller_total_amount,
                seller_final_price,
                seller_vat_amount,
                seller_net_income,
                platform_discount,
                shipping_fee,
                item_count,
                order_created_at,
                settled_at,
                processing_hours,
                delivery_hours,
                total_lifecycle_hours
            FROM delta.gold.fact_orders
            WHERE seller_company_id = '${sanitize(sellerId)}'
            ORDER BY order_created_at DESC
        `);

        const summary = await queryTrino(`
            SELECT
                COUNT(*)                           AS total_orders,
                COALESCE(SUM(seller_total_amount), 0) AS total_revenue,
                COALESCE(SUM(seller_vat_amount), 0)   AS total_vat,
                COALESCE(SUM(seller_net_income), 0)   AS total_net_income,
                COALESCE(SUM(platform_discount), 0)   AS total_discount,
                COALESCE(AVG(total_lifecycle_hours), 0) AS avg_lifecycle_hours,
                COUNT(CASE WHEN is_settled THEN 1 END) AS settled_count,
                COUNT(CASE WHEN is_cancelled THEN 1 END) AS cancelled_count,
                COUNT(CASE WHEN is_returned THEN 1 END) AS returned_count
            FROM delta.gold.fact_orders
            WHERE seller_company_id = '${sanitize(sellerId)}'
        `);

        await sendAnalytics(res, {
                orders: orders.rows,
                summary: summary.rows[0] || {},
            });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


// ═══════════════════════════════════════════════════════════════
// SHIPPER ANALYTICS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/v1/analytics/shipper/overview
 * All shippers summary
 */
const getShipperOverview = async (req, res) => {
    try {
        const result = await queryTrino(`
            SELECT
                shipper_company_id,
                total_orders,
                total_shipping_revenue,
                total_cod_collected,
                avg_shipping_fee,
                delivered_count,
                cancelled_count,
                return_count,
                first_order_at,
                last_order_at
            FROM delta.gold.dim_shipper
            ORDER BY total_orders DESC
        `);

        await sendAnalytics(res, result.rows);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/v1/analytics/shipper/delivery?shipper_id=xxx
 * Shipper delivery performance details
 */
const getShipperDelivery = async (req, res) => {
    try {
        const shipperId = req.query.shipper_id || req.user?.companyId;
        if (!shipperId) {
            return res.status(400).json({ success: false, error: 'shipper_id required' });
        }

        const deliveries = await queryTrino(`
            SELECT
                order_id,
                order_status,
                payment_method,
                shipping_fee,
                cod_amount,
                cod_collected,
                shipped_at,
                delivery_timestamp,
                delivery_hours,
                is_delivered,
                is_returned,
                shipping_address
            FROM delta.gold.fact_delivery
            WHERE shipper_company_id = '${sanitize(shipperId)}'
            ORDER BY shipped_at DESC
        `);

        const summary = await queryTrino(`
            SELECT
                COUNT(*)                              AS total_shipments,
                COUNT(CASE WHEN is_delivered THEN 1 END)  AS delivered_count,
                COUNT(CASE WHEN is_returned THEN 1 END)   AS returned_count,
                COALESCE(SUM(shipping_fee), 0)        AS total_shipping_revenue,
                COALESCE(SUM(cod_collected), 0)       AS total_cod_collected,
                COALESCE(AVG(delivery_hours), 0)      AS avg_delivery_hours,
                COUNT(CASE WHEN is_cod THEN 1 END)    AS cod_orders
            FROM delta.gold.fact_delivery
            WHERE shipper_company_id = '${sanitize(shipperId)}'
        `);

        await sendAnalytics(res, {
                deliveries: deliveries.rows,
                summary: summary.rows[0] || {},
            });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


// ═══════════════════════════════════════════════════════════════
// TAX ANALYTICS (No risk scoring — tax auto-calculated)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/v1/analytics/tax/report
 * Tax compliance — settled orders only
 */
const getTaxReport = async (req, res) => {
    try {
        const records = await queryTrino(`
            SELECT
                order_id,
                seller_company_id,
                COALESCE(seller_tax_code, tax_seller_code) AS tax_code,
                taxable_revenue,
                tax_vat_amount,
                vat_rate,
                effective_vat_rate,
                seller_total_amount,
                seller_net_income,
                platform_discount,
                payment_method,
                order_status,
                order_created_at,
                settled_at,
                transaction_date
            FROM delta.gold.fact_tax
            ORDER BY settled_at DESC
        `);

        const summary = await queryTrino(`
            SELECT
                COUNT(*)                           AS total_settled,
                COALESCE(SUM(taxable_revenue), 0)  AS total_taxable_revenue,
                COALESCE(SUM(tax_vat_amount), 0)   AS total_vat_collected,
                COALESCE(AVG(effective_vat_rate), 0) AS avg_vat_rate
            FROM delta.gold.fact_tax
        `);

        // Per-seller tax summary
        const bySeller = await queryTrino(`
            SELECT
                seller_company_id,
                COALESCE(seller_tax_code, tax_seller_code) AS tax_code,
                COUNT(*)                           AS order_count,
                SUM(taxable_revenue)               AS taxable_revenue,
                SUM(tax_vat_amount)                AS vat_collected,
                AVG(effective_vat_rate)            AS avg_vat_rate
            FROM delta.gold.fact_tax
            GROUP BY seller_company_id, COALESCE(seller_tax_code, tax_seller_code)
            ORDER BY taxable_revenue DESC
        `);

        await sendAnalytics(res, {
                records: records.rows,
                summary: summary.rows[0] || {},
                bySeller: bySeller.rows,
                totalRecords: records.rowCount,
            });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


// ═══════════════════════════════════════════════════════════════
// BLOCKCHAIN AUDIT
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/v1/analytics/audit/events
 * Blockchain event timeline
 */
const getAuditEvents = async (req, res) => {
    try {
        const { order_id, limit = 50 } = req.query;

        let whereClause = '';
        if (order_id) {
            whereClause = `WHERE order_id = '${sanitize(order_id)}'`;
        }

        const result = await queryTrino(`
            SELECT
                order_id,
                order_status,
                function_name,
                block_number,
                tx_id,
                creator_msp,
                event_timestamp,
                seller_company_id,
                payment_method,
                seller_total_amount,
                seller_vat_amount,
                has_seller_data,
                has_shipper_data,
                has_tax_data
            FROM delta.silver.tbl_order_events
            ${whereClause}
            ORDER BY block_number DESC, tx_index DESC
            LIMIT ${parseInt(limit)}
        `);

        const freshness = await getDataFreshness();
        res.json({
            success: true,
            data: result.rows,
            totalEvents: result.rowCount,
            data_freshness: freshness,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/v1/analytics/audit/order/:orderId
 * Full lifecycle of a specific order
 */
const getOrderLifecycle = async (req, res) => {
    try {
        const { orderId } = req.params;

        const events = await queryTrino(`
            SELECT
                order_id,
                order_status,
                function_name,
                block_number,
                tx_id,
                creator_msp,
                event_timestamp,
                payment_method,
                seller_company_id,
                shipper_company_id,
                seller_total_amount,
                seller_vat_amount,
                shipping_fee,
                cod_amount,
                has_seller_data,
                has_shipper_data,
                has_tax_data
            FROM delta.silver.tbl_order_events
            WHERE order_id = '${sanitize(orderId)}'
            ORDER BY block_number ASC, tx_index ASC
        `);

        const snapshot = await queryTrino(`
            SELECT *
            FROM delta.silver.tbl_orders_snapshot
            WHERE order_id = '${sanitize(orderId)}'
        `);

        const freshness = await getDataFreshness();
        res.json({
            success: true,
            data: {
                orderId,
                currentState: snapshot.rows[0] || null,
                lifecycle: events.rows,
                eventCount: events.rowCount,
            },
            data_freshness: freshness,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


module.exports = {
    // Admin / Platform
    getAdminOverview,
    getRevenueByMonth,
    getOrderStatusDistribution,
    getPaymentMethodStats,
    // Seller
    getSellerOverview,
    getSellerRevenue,
    // Shipper
    getShipperOverview,
    getShipperDelivery,
    // Tax
    getTaxReport,
    // Audit
    getAuditEvents,
    getOrderLifecycle,
};
