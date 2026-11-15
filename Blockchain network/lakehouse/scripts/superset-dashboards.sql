-- ═══════════════════════════════════════════════════════════════
-- Superset Dashboard Queries V3 — Multi-Org
-- ═══════════════════════════════════════════════════════════════
-- Chạy trong Superset SQL Lab (Database: Trino-Lakehouse)
-- Sau đó Save as Dataset → tạo Chart → tạo Dashboard
-- ═══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════
-- 1. ADMIN: Order Overview KPIs
-- Save as: ds_admin_overview
-- Chart: Big Number / KPI
-- ══════════════════════════════════════
SELECT
    COUNT(*)                                   AS total_orders,
    COUNT(CASE WHEN is_delivered THEN 1 END)   AS delivered,
    COUNT(CASE WHEN is_settled THEN 1 END)     AS settled,
    COUNT(CASE WHEN is_cancelled THEN 1 END)   AS cancelled,
    COUNT(CASE WHEN is_returned THEN 1 END)    AS returned,
    COALESCE(SUM(seller_total_amount), 0)      AS total_revenue,
    COALESCE(SUM(seller_vat_amount), 0)        AS total_vat,
    COALESCE(SUM(seller_net_income), 0)        AS total_net_income,
    COALESCE(SUM(platform_discount), 0)        AS total_discount,
    COALESCE(AVG(seller_total_amount), 0)      AS avg_order_value
FROM delta.gold.fact_orders;

-- ══════════════════════════════════════
-- 2. ADMIN: Revenue by Month
-- Save as: ds_revenue_by_month
-- Chart: Line/Area Chart
-- ══════════════════════════════════════
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
ORDER BY year_month;

-- ══════════════════════════════════════
-- 3. ADMIN: Order Status Distribution
-- Save as: ds_order_status
-- Chart: Pie/Donut Chart
-- ══════════════════════════════════════
SELECT
    order_status,
    COUNT(*)                  AS order_count,
    SUM(seller_total_amount)  AS revenue
FROM delta.gold.fact_orders
GROUP BY order_status
ORDER BY order_count DESC;

-- ══════════════════════════════════════
-- 4. ADMIN: Payment Method Breakdown
-- Save as: ds_payment_methods
-- Chart: Bar Chart
-- ══════════════════════════════════════
SELECT
    payment_method,
    COUNT(*)                  AS order_count,
    SUM(seller_total_amount)  AS total_revenue,
    SUM(cod_amount)           AS total_cod
FROM delta.gold.fact_orders
WHERE payment_method IS NOT NULL AND payment_method <> ''
GROUP BY payment_method
ORDER BY order_count DESC;

-- ══════════════════════════════════════
-- 5. SELLER: Revenue per Seller
-- Save as: ds_seller_revenue
-- Chart: Bar Chart (grouped)
-- ══════════════════════════════════════
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
    settled_count
FROM delta.gold.dim_seller
ORDER BY total_revenue DESC;

-- ══════════════════════════════════════
-- 6. SELLER: Orders Detail
-- Save as: ds_seller_orders
-- Chart: Table
-- ══════════════════════════════════════
SELECT
    order_id,
    seller_company_id,
    order_status,
    payment_method,
    seller_total_amount,
    seller_vat_amount,
    seller_net_income,
    platform_discount,
    processing_hours,
    delivery_hours,
    total_lifecycle_hours,
    order_created_at,
    settled_at
FROM delta.gold.fact_orders
ORDER BY order_created_at DESC;

-- ══════════════════════════════════════
-- 7. SHIPPER: Delivery Performance
-- Save as: ds_shipper_overview
-- Chart: Bar Chart
-- ══════════════════════════════════════
SELECT
    shipper_company_id,
    total_orders,
    total_shipping_revenue,
    total_cod_collected,
    avg_shipping_fee,
    delivered_count,
    cancelled_count,
    return_count
FROM delta.gold.dim_shipper
ORDER BY total_orders DESC;

-- ══════════════════════════════════════
-- 8. SHIPPER: Delivery Details
-- Save as: ds_delivery_details
-- Chart: Table + Avg Delivery Hours KPI
-- ══════════════════════════════════════
SELECT
    order_id,
    shipper_company_id,
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
ORDER BY shipped_at DESC;

-- ══════════════════════════════════════
-- 9. TAX: Compliance Report
-- Save as: ds_tax_compliance
-- Chart: Table + Summary KPIs
-- ══════════════════════════════════════
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
    order_created_at,
    settled_at,
    transaction_date
FROM delta.gold.fact_tax
ORDER BY settled_at DESC;

-- ══════════════════════════════════════
-- 10. TAX: Per-Seller Tax Summary
-- Save as: ds_tax_by_seller
-- Chart: Bar/Table
-- ══════════════════════════════════════
SELECT
    seller_company_id,
    COALESCE(seller_tax_code, tax_seller_code) AS tax_code,
    COUNT(*)                 AS order_count,
    SUM(taxable_revenue)     AS taxable_revenue,
    SUM(tax_vat_amount)      AS vat_collected,
    AVG(effective_vat_rate)  AS avg_vat_rate
FROM delta.gold.fact_tax
GROUP BY seller_company_id, COALESCE(seller_tax_code, tax_seller_code)
ORDER BY taxable_revenue DESC;

-- ══════════════════════════════════════
-- 11. AUDIT: Blockchain Event Log
-- Save as: ds_blockchain_events
-- Chart: Table (drill-down)
-- ══════════════════════════════════════
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
    seller_total_amount
FROM delta.silver.tbl_order_events
ORDER BY block_number DESC;

