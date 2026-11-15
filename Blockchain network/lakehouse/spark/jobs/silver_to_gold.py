"""
═══════════════════════════════════════════════════════════════
Silver → Gold ETL Pipeline (V4 — SCD1 + Customer Analytics)
═══════════════════════════════════════════════════════════════
V4 upgrades over V3:
  - SCD Type 1 for dim_seller & dim_shipper (ghi đè chỉ số thống kê)
  - fact_customer_behavior (phân tích hành vi khách hàng)
  - Anomaly Detection trên pipeline_metrics
  - Pipeline timing & observability

Input:  Delta silver tables (tbl_orders_snapshot, tbl_order_events)
Output: Delta gold tables:

  Dimensions:
    - dim_time          Calendar (2024-2027)
    - dim_seller        SCD Type 1 (ghi đè)
    - dim_shipper       SCD Type 1 (ghi đè)

  Facts:
    - fact_orders            Main order fact (all orgs)
    - fact_delivery          Delivery performance (Shipper org)
    - fact_tax               Tax compliance (Tax org)
    - fact_customer_behavior Customer analytics

Usage:
  spark-submit /opt/spark-jobs/silver_to_gold.py
═══════════════════════════════════════════════════════════════
"""

import sys
import time
import uuid
from datetime import datetime, timedelta
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType, DateType,
    DecimalType, BooleanType
)
from delta.tables import DeltaTable

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════

MINIO_BUCKET = "ecommerce-lakehouse"
SILVER_BASE = f"s3a://{MINIO_BUCKET}/delta/silver"
GOLD_BASE = f"s3a://{MINIO_BUCKET}/delta/gold"

SNAPSHOT_PATH = f"{SILVER_BASE}/tbl_orders_snapshot"
EVENTS_PATH = f"{SILVER_BASE}/tbl_order_events"

DIM_SELLER_PATH = f"{GOLD_BASE}/dim_seller"
DIM_SHIPPER_PATH = f"{GOLD_BASE}/dim_shipper"
DIM_TIME_PATH = f"{GOLD_BASE}/dim_time"
FACT_ORDERS_PATH = f"{GOLD_BASE}/fact_orders"
FACT_DELIVERY_PATH = f"{GOLD_BASE}/fact_delivery"
FACT_TAX_PATH = f"{GOLD_BASE}/fact_tax"
FACT_CUSTOMER_PATH = f"{GOLD_BASE}/fact_customer_behavior"

# Pipeline metrics (for anomaly detection)
METRICS_PATH = f"s3a://{MINIO_BUCKET}/delta/silver/pipeline_metrics"
ALERT_PATH = f"{GOLD_BASE}/anomaly_alerts"


def create_spark_session():
    return (SparkSession.builder
        .appName("Lakehouse-Silver-to-Gold")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
        .getOrCreate()
    )


def save_or_merge(spark, df, path, merge_key, partition_col=None):
    """Helper: MERGE nếu table tồn tại, ngược lại overwrite."""
    try:
        target = DeltaTable.forPath(spark, path)
        (target.alias("t")
            .merge(df.alias("s"), f"t.{merge_key} = s.{merge_key}")
            .whenMatchedUpdateAll()
            .whenNotMatchedInsertAll()
            .execute())
        return "merged"
    except Exception:
        writer = df.write.format("delta").mode("overwrite") \
            .option("mergeSchema", "true")
        if partition_col:
            writer = writer.partitionBy(partition_col)
        writer.save(path)
        return "created"


# ═══════════════════════════════════════════════════════════════
# DIMENSION: dim_time
# ═══════════════════════════════════════════════════════════════

def build_dim_time(spark):
    """Generate calendar dimension table (2024-2027)."""
    print("\n  Building dim_time...")

    start_date = datetime(2024, 1, 1)
    end_date = datetime(2027, 12, 31)
    dates = []
    current = start_date

    while current <= end_date:
        dates.append((
            int(current.strftime("%Y%m%d")),
            current.date(),
            current.year,
            (current.month - 1) // 3 + 1,
            current.month,
            current.strftime("%B"),
            current.isocalendar()[1],
            current.day,
            current.isoweekday(),
            current.strftime("%A"),
            1 if current.isoweekday() <= 5 else 0,
            current.strftime("%Y-%m"),
        ))
        current += timedelta(days=1)

    schema = StructType([
        StructField("date_key", IntegerType()),
        StructField("full_date", DateType()),
        StructField("year", IntegerType()),
        StructField("quarter", IntegerType()),
        StructField("month", IntegerType()),
        StructField("month_name", StringType()),
        StructField("week_of_year", IntegerType()),
        StructField("day_of_month", IntegerType()),
        StructField("day_of_week", IntegerType()),
        StructField("day_name", StringType()),
        StructField("is_weekday", IntegerType()),
        StructField("year_month", StringType()),
    ])

    dim_time = spark.createDataFrame(dates, schema)
    dim_time.write.format("delta").mode("overwrite").save(DIM_TIME_PATH)
    print(f"  dim_time created: {dim_time.count()} dates")


# ═══════════════════════════════════════════════════════════════
# DIMENSION: dim_seller (SCD Type 1)
# ═══════════════════════════════════════════════════════════════

def build_dim_seller(spark, snapshot_df):
    """
    Seller dimension — SCD Type 1 (ghi đè).

    Bảng dim_seller hiện tại không có thuộc tính danh mục thay đổi chậm
    (slowly changing attribute) — seller_tax_code được gán cố định từ
    lúc đăng ký và không thay đổi trong vòng đời hệ thống.

    Do đó chỉ áp dụng SCD Type 1: cập nhật đè toàn bộ chỉ số thống kê
    lên dòng hiện tại mà không tạo phiên bản mới.
    """
    print("\n  Building dim_seller (SCD Type 1)...")

    # Tính aggregate hiện tại từ snapshot
    current_agg = (snapshot_df
        .filter(F.col("seller_company_id").isNotNull()
                & (F.length(F.col("seller_company_id")) > 0))
        .groupBy("seller_company_id")
        .agg(
            F.first("seller_tax_code", ignorenulls=True).alias("seller_tax_code"),
            F.count("*").alias("total_orders"),
            F.sum("seller_total_amount").alias("total_revenue"),
            F.sum("seller_vat_amount").alias("total_vat"),
            F.sum("seller_net_income").alias("total_net_income"),
            F.sum("platform_discount").alias("total_platform_discount"),
            F.avg("seller_total_amount").alias("avg_order_value"),
            F.count(F.when(F.col("order_status") == "CANCELLED", True)).alias("cancelled_count"),
            F.count(F.when(F.col("order_status").isin("RETURN_REQUESTED", "RETURN_IN_TRANSIT",
                           "RETURN_COMPLETED"), True)).alias("return_count"),
            F.count(F.when(F.col("order_status") == "SETTLED", True)).alias("settled_count"),
            F.min("order_created_at").alias("first_order_at"),
            F.max("order_created_at").alias("last_order_at"),
        )
    )

    try:
        existing = spark.read.format("delta").load(DIM_SELLER_PATH)

        # Insert sellers hoàn toàn mới (chưa tồn tại)
        existing_ids = existing.select("seller_company_id").distinct()
        new_records = (current_agg
            .withColumn("seller_sk", F.lit(str(uuid.uuid4())).substr(1, 8))
            .withColumn("etl_updated_at", F.current_timestamp())
        )

        brand_new = new_records.join(existing_ids, "seller_company_id", "left_anti")
        if brand_new.count() > 0:
            brand_new.write.format("delta").mode("append") \
                .option("mergeSchema", "true").save(DIM_SELLER_PATH)
            print(f"  {brand_new.count()} new seller(s) added")

        # SCD Type 1: Cập nhật đè toàn bộ chỉ số thống kê cho sellers đã tồn tại
        target = DeltaTable.forPath(spark, DIM_SELLER_PATH)
        existing_agg = current_agg.join(existing_ids, "seller_company_id", "inner")
        if existing_agg.count() > 0:
            target.alias("t").merge(
                existing_agg.alias("s"),
                "t.seller_company_id = s.seller_company_id"
            ).whenMatchedUpdate(set={
                "total_orders": "s.total_orders",
                "total_revenue": "s.total_revenue",
                "total_vat": "s.total_vat",
                "total_net_income": "s.total_net_income",
                "total_platform_discount": "s.total_platform_discount",
                "avg_order_value": "s.avg_order_value",
                "cancelled_count": "s.cancelled_count",
                "return_count": "s.return_count",
                "settled_count": "s.settled_count",
                "last_order_at": "s.last_order_at",
                "etl_updated_at": "current_timestamp()"
            }).execute()

        final_count = spark.read.format("delta").load(DIM_SELLER_PATH).count()
        print(f"  dim_seller Type 1: {final_count} sellers (overwrite metrics)")

    except Exception:
        # First run — tạo mới
        dim_seller = (current_agg
            .withColumn("seller_sk", F.lit(str(uuid.uuid4())).substr(1, 8))
            .withColumn("etl_updated_at", F.current_timestamp())
        )
        dim_seller.write.format("delta").mode("overwrite") \
            .option("mergeSchema", "true").save(DIM_SELLER_PATH)
        print(f"  dim_seller created: {dim_seller.count()} sellers")


# ═══════════════════════════════════════════════════════════════
# DIMENSION: dim_shipper (SCD Type 2)
# ═══════════════════════════════════════════════════════════════

def build_dim_shipper(spark, snapshot_df):
    """
    Shipper dimension — SCD Type 1 (ghi đè).

    Bảng dim_shipper hiện tại không có thuộc tính danh mục thay đổi chậm
    (slowly changing attribute) nên chỉ áp dụng SCD Type 1: cập nhật đè
    toàn bộ chỉ số thống kê lên dòng hiện tại mà không tạo phiên bản mới.
    """
    print("\n  Building dim_shipper (SCD Type 1)...")

    current_agg = (snapshot_df
        .filter(F.col("shipper_company_id").isNotNull()
                & (F.length(F.col("shipper_company_id")) > 0))
        .groupBy("shipper_company_id")
        .agg(
            F.count("*").alias("total_orders"),
            F.sum("shipping_fee").alias("total_shipping_revenue"),
            F.sum("cod_amount").alias("total_cod_collected"),
            F.avg("shipping_fee").alias("avg_shipping_fee"),
            F.count(F.when(F.col("delivery_timestamp").isNotNull(), True)).alias("delivered_count"),
            F.count(F.when(F.col("order_status") == "CANCELLED", True)).alias("cancelled_count"),
            F.count(F.when(F.col("order_status").isin("RETURN_REQUESTED", "RETURN_IN_TRANSIT",
                           "RETURN_COMPLETED"), True)).alias("return_count"),
            F.min("order_created_at").alias("first_order_at"),
            F.max("order_created_at").alias("last_order_at"),
        )
    )

    try:
        existing = spark.read.format("delta").load(DIM_SHIPPER_PATH)

        # Insert shippers hoàn toàn mới (chưa tồn tại)
        existing_ids = existing.select("shipper_company_id").distinct()
        new_records = (current_agg
            .withColumn("shipper_sk", F.lit(str(uuid.uuid4())).substr(1, 8))
            .withColumn("etl_updated_at", F.current_timestamp())
        )

        brand_new = new_records.join(existing_ids, "shipper_company_id", "left_anti")
        if brand_new.count() > 0:
            brand_new.write.format("delta").mode("append") \
                .option("mergeSchema", "true").save(DIM_SHIPPER_PATH)
            print(f"  {brand_new.count()} new shipper(s) added")

        # SCD Type 1: Cập nhật đè toàn bộ chỉ số thống kê cho shippers đã tồn tại
        target = DeltaTable.forPath(spark, DIM_SHIPPER_PATH)
        existing_agg = current_agg.join(existing_ids, "shipper_company_id", "inner")
        if existing_agg.count() > 0:
            target.alias("t").merge(
                existing_agg.alias("s"),
                "t.shipper_company_id = s.shipper_company_id"
            ).whenMatchedUpdate(set={
                "total_orders": "s.total_orders",
                "total_shipping_revenue": "s.total_shipping_revenue",
                "total_cod_collected": "s.total_cod_collected",
                "avg_shipping_fee": "s.avg_shipping_fee",
                "delivered_count": "s.delivered_count",
                "cancelled_count": "s.cancelled_count",
                "return_count": "s.return_count",
                "last_order_at": "s.last_order_at",
                "etl_updated_at": "current_timestamp()"
            }).execute()

        final_count = spark.read.format("delta").load(DIM_SHIPPER_PATH).count()
        print(f"  dim_shipper Type 1: {final_count} shippers (overwrite metrics)")

    except Exception:
        # First run — tạo mới
        dim_shipper = (current_agg
            .withColumn("shipper_sk", F.lit(str(uuid.uuid4())).substr(1, 8))
            .withColumn("etl_updated_at", F.current_timestamp())
        )
        dim_shipper.write.format("delta").mode("overwrite") \
            .option("mergeSchema", "true").save(DIM_SHIPPER_PATH)
        print(f"  dim_shipper created: {dim_shipper.count()} shippers")


# ═══════════════════════════════════════════════════════════════
# FACT: fact_orders (Main — cho Admin + Seller)
# ═══════════════════════════════════════════════════════════════

def build_fact_orders(spark, snapshot_df):
    """
    Main order fact table.
    Dùng cho: Admin overview, Seller revenue, Platform analytics.
    """
    print("\n  Building fact_orders...")

    fact_orders = (snapshot_df
        # Date key từ order_created_at
        .withColumn("date_key",
            F.date_format(F.col("order_created_at"), "yyyyMMdd").cast(IntegerType()))
        .withColumn("year_month",
            F.date_format(F.col("order_created_at"), "yyyy-MM"))

        # ── Lifecycle durations (hours) ──
        .withColumn("processing_hours",
            F.when(
                F.col("order_created_at").isNotNull() & F.col("shipped_at").isNotNull(),
                (F.unix_timestamp("shipped_at") - F.unix_timestamp("order_created_at")) / 3600
            )
        )
        .withColumn("delivery_hours",
            F.when(
                F.col("shipped_at").isNotNull() & F.col("delivery_timestamp").isNotNull(),
                (F.unix_timestamp("delivery_timestamp") - F.unix_timestamp("shipped_at")) / 3600
            )
        )
        .withColumn("total_lifecycle_hours",
            F.when(
                F.col("order_created_at").isNotNull() & F.col("settled_at").isNotNull(),
                (F.unix_timestamp("settled_at") - F.unix_timestamp("order_created_at")) / 3600
            )
        )

        # ── Status flags ──
        .withColumn("is_prepaid", F.col("payment_method") == "PREPAID")
        .withColumn("is_cod", F.col("payment_method") == "COD")
        .withColumn("is_cancelled", F.col("order_status") == "CANCELLED")
        .withColumn("is_returned",
            F.col("order_status").isin("RETURN_REQUESTED", "RETURN_IN_TRANSIT", "RETURN_COMPLETED"))
        .withColumn("is_delivered", F.col("delivery_timestamp").isNotNull())
        .withColumn("is_settled", F.col("order_status") == "SETTLED")

        .select(
            "order_id",
            "date_key",
            "year_month",
            "order_status",
            "payment_method",
            "cod_status",
            "seller_company_id",
            "shipper_company_id",
            # Financial
            "seller_total_amount",
            "seller_final_price",
            "seller_vat_amount",
            "seller_net_income",
            "shipping_fee",
            "cod_amount",
            "platform_discount",
            "item_count",
            "customer_id",
            "vat_rate",
            # Lifecycle timestamps
            "order_created_at",
            "paid_at",
            "shipped_at",
            "delivery_timestamp",
            "settled_at",
            "cancelled_at",
            "return_requested_at",
            "return_completed_at",
            # Computed durations
            "processing_hours",
            "delivery_hours",
            "total_lifecycle_hours",
            # Flags
            "is_prepaid",
            "is_cod",
            "is_cancelled",
            "is_returned",
            "is_delivered",
            "is_settled",
            # Data integrity (Hash verification from Blockchain)
            "data_verified",
            # Meta
            "history_count",
            "last_action",
            "event_timestamp",
            F.current_timestamp().alias("etl_updated_at"),
        )
    )

    action = save_or_merge(spark, fact_orders, FACT_ORDERS_PATH,
                           "order_id", "year_month")
    print(f"  fact_orders {action}: {fact_orders.count()} orders")


# ═══════════════════════════════════════════════════════════════
# FACT: fact_delivery (Shipper org)
# ═══════════════════════════════════════════════════════════════

def build_fact_delivery(spark, snapshot_df):
    """
    Delivery performance fact table.
    Dùng cho: Shipper dashboard — delivery time, COD, shipping revenue.
    Chỉ orders đã được giao (shipped_at IS NOT NULL).
    """
    print("\n  Building fact_delivery...")

    shipped_df = snapshot_df.filter(F.col("shipped_at").isNotNull())

    if shipped_df.rdd.isEmpty():
        print("  No shipped orders. Skipping fact_delivery.")
        return

    fact_delivery = (shipped_df
        .withColumn("date_key",
            F.date_format(F.col("shipped_at"), "yyyyMMdd").cast(IntegerType()))
        .withColumn("year_month",
            F.date_format(F.col("shipped_at"), "yyyy-MM"))

        # Delivery duration (hours)
        .withColumn("delivery_hours",
            F.when(
                F.col("delivery_timestamp").isNotNull(),
                (F.unix_timestamp("delivery_timestamp") - F.unix_timestamp("shipped_at")) / 3600
            )
        )

        # COD metrics
        .withColumn("is_cod", F.col("payment_method") == "COD")
        .withColumn("cod_collected",
            F.when(F.col("cod_status") == "REMITTED", F.col("cod_amount")).otherwise(F.lit(0)))

        # Delivery outcome
        .withColumn("is_delivered", F.col("delivery_timestamp").isNotNull())
        .withColumn("is_returned",
            F.col("order_status").isin("RETURN_REQUESTED", "RETURN_IN_TRANSIT", "RETURN_COMPLETED"))

        .select(
            "order_id",
            "date_key",
            "year_month",
            "shipper_company_id",
            "seller_company_id",
            "order_status",
            "payment_method",
            # Shipping metrics
            "shipping_fee",
            "cod_amount",
            "cod_collected",
            "is_cod",
            # Delivery performance
            "shipped_at",
            "delivery_timestamp",
            "delivery_hours",
            "is_delivered",
            "is_returned",
            # Location
            "shipping_address",
            F.current_timestamp().alias("etl_updated_at"),
        )
    )

    action = save_or_merge(spark, fact_delivery, FACT_DELIVERY_PATH,
                           "order_id", "year_month")
    print(f"  fact_delivery {action}: {fact_delivery.count()} records")


# ═══════════════════════════════════════════════════════════════
# FACT: fact_tax (Tax org — chỉ settled orders)
# ═══════════════════════════════════════════════════════════════

def build_fact_tax(spark, snapshot_df):
    """
    Tax compliance fact table.
    Dùng cho: Tax officer dashboard — thuế tự tính bởi hệ thống.
    Chỉ orders đã settled (has_tax_data = true).
    """
    print("\n  Building fact_tax...")

    # tax_data chỉ có khi status = SETTLED (đã PayoutToSeller)
    tax_df = snapshot_df.filter(F.col("has_tax_data") == True)

    if tax_df.rdd.isEmpty():
        print("  No settled orders with tax data. Skipping fact_tax.")
        return

    fact_tax = (tax_df
        .withColumn("date_key",
            F.date_format(F.col("settled_at"), "yyyyMMdd").cast(IntegerType()))
        .withColumn("year_month",
            F.date_format(F.col("settled_at"), "yyyy-MM"))

        # Effective VAT rate (computed)
        .withColumn("effective_vat_rate",
            F.when(
                F.col("taxable_revenue").isNotNull() & (F.col("taxable_revenue") > 0),
                F.round(F.col("tax_vat_amount") / F.col("taxable_revenue") * 100, 2)
            )
        )

        .select(
            "order_id",
            "date_key",
            "year_month",
            "seller_company_id",
            "seller_tax_code",
            "tax_seller_code",
            # Tax amounts (auto-calculated by system)
            "taxable_revenue",
            "tax_vat_amount",
            "vat_rate",
            "effective_vat_rate",
            # Order context
            "seller_total_amount",
            "seller_net_income",
            "platform_discount",
            "payment_method",
            "order_status",
            # Settlement timing
            "order_created_at",
            "settled_at",
            "transaction_date",
            F.current_timestamp().alias("etl_updated_at"),
        )
    )

    action = save_or_merge(spark, fact_tax, FACT_TAX_PATH,
                           "order_id", "year_month")
    print(f"  fact_tax {action}: {fact_tax.count()} records")

    # Summary
    total_tax = fact_tax.agg(F.sum("tax_vat_amount")).collect()[0][0]
    total_revenue = fact_tax.agg(F.sum("taxable_revenue")).collect()[0][0]
    print(f"  Total taxable revenue: {total_revenue} | Total VAT: {total_tax}")


# ═══════════════════════════════════════════════════════════════
# FACT: fact_customer_behavior (NEW V4)
# ═══════════════════════════════════════════════════════════════

def build_fact_customer(spark, snapshot_df):
    """
    Customer behavior analytics — phân tích hành vi mua hàng.
    Segments: Premium / Regular / New dựa trên tổng chi tiêu.
    """
    print("\n  Building fact_customer_behavior...")

    customer_df = snapshot_df.filter(F.col("customer_id").isNotNull())

    if customer_df.rdd.isEmpty():
        print("  No customer data. Skipping fact_customer_behavior.")
        return

    fact_customer = (customer_df
        .groupBy("customer_id")
        .agg(
            # Order metrics
            F.count("*").alias("total_orders"),
            F.sum("seller_final_price").alias("total_spent"),
            F.avg("seller_final_price").alias("avg_order_value"),
            F.max("seller_final_price").alias("max_order_value"),
            F.min("seller_final_price").alias("min_order_value"),
            # Diversity
            F.countDistinct("seller_company_id").alias("unique_sellers"),
            F.countDistinct("shipper_company_id").alias("unique_shippers"),
            F.countDistinct("payment_method").alias("payment_methods_used"),
            # Payment preference
            F.count(F.when(F.col("payment_method") == "COD", True)).alias("cod_orders"),
            F.count(F.when(F.col("payment_method") == "PREPAID", True)).alias("prepaid_orders"),
            # Order outcomes
            F.count(F.when(F.col("order_status") == "CANCELLED", True)).alias("cancel_count"),
            F.count(F.when(F.col("order_status").isin(
                "RETURN_REQUESTED", "RETURN_IN_TRANSIT", "RETURN_COMPLETED"
            ), True)).alias("return_count"),
            F.count(F.when(F.col("order_status") == "SETTLED", True)).alias("settled_count"),
            F.count(F.when(F.col("order_status") == "DELIVERED", True)).alias("delivered_count"),
            # Timing
            F.min("order_created_at").alias("first_order_at"),
            F.max("order_created_at").alias("last_order_at"),
            # Financial
            F.sum("seller_vat_amount").alias("total_vat_paid"),
            F.sum("shipping_fee").alias("total_shipping_paid"),
            F.sum("platform_discount").alias("total_discounts_received"),
            # Items
            F.sum("item_count").alias("total_items_purchased"),
        )
        # Computed fields
        .withColumn("cancel_rate",
            F.round(F.col("cancel_count") / F.col("total_orders") * 100, 2))
        .withColumn("return_rate",
            F.round(F.col("return_count") / F.col("total_orders") * 100, 2))
        .withColumn("preferred_payment",
            F.when(F.col("cod_orders") > F.col("prepaid_orders"), "COD")
             .otherwise("PREPAID"))
        .withColumn("customer_lifetime_days",
            F.when(
                F.col("first_order_at").isNotNull() & F.col("last_order_at").isNotNull(),
                F.datediff(F.col("last_order_at"), F.col("first_order_at"))
            ).otherwise(0))
        # Segmentation
        .withColumn("customer_segment",
            F.when(F.col("total_spent") > 5000000, "PREMIUM")
             .when(F.col("total_spent") > 1000000, "REGULAR")
             .when(F.col("total_spent") > 200000, "ACTIVE")
             .otherwise("NEW"))
        .withColumn("risk_flag",
            F.when(F.col("cancel_rate") > 50, "HIGH_CANCEL")
             .when(F.col("return_rate") > 30, "HIGH_RETURN")
             .otherwise("NORMAL"))
        .withColumn("etl_updated_at", F.current_timestamp())
    )

    action = save_or_merge(spark, fact_customer, FACT_CUSTOMER_PATH, "customer_id")
    print(f"  fact_customer_behavior {action}: {fact_customer.count()} customers")

    # Segment summary
    fact_customer.groupBy("customer_segment").agg(
        F.count("*").alias("count"),
        F.round(F.avg("total_spent"), 0).alias("avg_spent"),
        F.round(F.avg("total_orders"), 1).alias("avg_orders"),
    ).orderBy("customer_segment").show(truncate=False)


# ═══════════════════════════════════════════════════════════════
# ANOMALY DETECTION (V4)
# ═══════════════════════════════════════════════════════════════

def detect_anomalies(spark):
    """
    So sánh pipeline run hiện tại với lịch sử.
    Phát hiện: volume spike/drop, quality drift, duration spike.
    Ghi alerts vào anomaly_alerts table.
    """
    print("\n  Running Anomaly Detection...")

    try:
        metrics = spark.read.format("delta").load(METRICS_PATH)
        total_runs = metrics.count()

        if total_runs < 3:
            print(f"  Not enough history ({total_runs} records). Need 3+. Skipping.")
            return

        # Tính thống kê lịch sử
        stats = metrics.filter(F.col("step_name") == "quality_gates").agg(
            F.avg("input_rows").alias("avg_input"),
            F.stddev("input_rows").alias("std_input"),
            F.avg("success_rate").alias("avg_success_rate"),
            F.stddev("success_rate").alias("std_success_rate"),
            F.avg("duration_seconds").alias("avg_duration"),
            F.stddev("duration_seconds").alias("std_duration"),
            F.max("processed_at").alias("latest_run"),
        ).collect()[0]

        # Lấy run gần nhất
        latest = (metrics
            .filter(F.col("step_name") == "quality_gates")
            .orderBy(F.desc("processed_at"))
            .first()
        )

        if latest is None:
            print("  No quality_gates metrics found. Skipping.")
            return

        alerts = []
        avg_input = stats.avg_input or 0
        std_input = stats.std_input or 1
        avg_sr = stats.avg_success_rate or 100
        std_sr = stats.std_success_rate or 1
        avg_dur = stats.avg_duration or 1
        std_dur = stats.std_duration or 1

        # Check 1: Volume anomaly (>2σ)
        if std_input > 0 and abs(latest.input_rows - avg_input) > 2 * std_input:
            direction = "SPIKE" if latest.input_rows > avg_input else "DROP"
            alerts.append({
                "alert_type": f"VOLUME_{direction}",
                "severity": "WARNING",
                "message": f"Input rows={latest.input_rows} (avg={avg_input:.0f}, σ={std_input:.0f})",
                "metric_value": float(latest.input_rows),
                "threshold": float(avg_input + 2 * std_input),
            })

        # Check 2: Quality drop
        if latest.success_rate < avg_sr - 5:
            alerts.append({
                "alert_type": "QUALITY_DROP",
                "severity": "CRITICAL" if latest.success_rate < 90 else "WARNING",
                "message": f"Success rate={latest.success_rate}% (avg={avg_sr:.1f}%)",
                "metric_value": float(latest.success_rate),
                "threshold": float(avg_sr - 5),
            })

        # Check 3: Duration spike (>3σ)
        if std_dur > 0 and latest.duration_seconds > avg_dur + 3 * std_dur:
            alerts.append({
                "alert_type": "DURATION_SPIKE",
                "severity": "WARNING",
                "message": f"Duration={latest.duration_seconds:.1f}s (avg={avg_dur:.1f}s)",
                "metric_value": float(latest.duration_seconds),
                "threshold": float(avg_dur + 3 * std_dur),
            })

        # Check 4: Quarantine rate
        if latest.quarantine_rows > 0 and latest.input_rows > 0:
            q_rate = latest.quarantine_rows / latest.input_rows * 100
            if q_rate > 5:
                alerts.append({
                    "alert_type": "HIGH_QUARANTINE_RATE",
                    "severity": "CRITICAL" if q_rate > 20 else "WARNING",
                    "message": f"Quarantine rate={q_rate:.1f}% ({latest.quarantine_rows}/{latest.input_rows})",
                    "metric_value": float(q_rate),
                    "threshold": 5.0,
                })

        if alerts:
            print(f"  🚨 {len(alerts)} anomaly alert(s) detected:")
            for a in alerts:
                symbol = "🔴" if a["severity"] == "CRITICAL" else "🟡"
                print(f"    {symbol} [{a['alert_type']}] {a['message']}")

            # Ghi alerts vào Delta table
            alert_records = [{
                **a,
                "run_id": latest.run_id,
                "detected_at": datetime.now().isoformat(),
            } for a in alerts]
            alert_df = spark.createDataFrame(alert_records)
            alert_df.write.format("delta").mode("append") \
                .option("mergeSchema", "true").save(ALERT_PATH)
        else:
            print(f"  ✅ No anomalies detected (based on {total_runs} historical runs)")
            print(f"     Volume: {latest.input_rows} rows (avg={avg_input:.0f})")
            print(f"     Quality: {latest.success_rate}% (avg={avg_sr:.1f}%)")
            print(f"     Duration: {latest.duration_seconds:.1f}s (avg={avg_dur:.1f}s)")

    except Exception as e:
        print(f"  Anomaly detection skipped: {e}")


def detect_data_integrity(spark):
    """
    Phát hiện đơn hàng có data_verified = false (Hash PDC không khớp).
    Đây là dấu hiệu dữ liệu Private Data Collection trên Blockchain
    đã bị can thiệp / giả mạo tại 1 node.
    Ghi alert vào anomaly_alerts table.
    """
    print("\n  Running Data Integrity Check...")

    try:
        snapshot = spark.read.format("delta").load(SNAPSHOT_PATH)

        # Tìm đơn hàng có data_verified = false
        tampered = snapshot.filter(
            (F.col("data_verified") == False) &
            F.col("data_verified").isNotNull()
        )

        tampered_count = tampered.count()
        total_count = snapshot.count()

        if tampered_count > 0:
            tampered_rate = round(tampered_count / max(total_count, 1) * 100, 2)
            print(f"  🔴 DATA INTEGRITY VIOLATION: {tampered_count}/{total_count} orders "
                  f"({tampered_rate}%) have data_verified = false")

            # Lấy danh sách order_id bị ảnh hưởng
            tampered_ids = [row.order_id for row in
                           tampered.select("order_id").limit(20).collect()]

            severity = "CRITICAL" if tampered_count > 5 else "WARNING"

            alert_records = [{
                "alert_type": "DATA_INTEGRITY_VIOLATION",
                "severity": severity,
                "message": (f"{tampered_count} order(s) with data_verified=false "
                           f"(PDC hash mismatch). "
                           f"Affected: {', '.join(tampered_ids[:10])}"
                           f"{'...' if tampered_count > 10 else ''}"),
                "metric_value": float(tampered_count),
                "threshold": 0.0,
                "run_id": f"integrity-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
                "detected_at": datetime.now().isoformat(),
            }]

            alert_df = spark.createDataFrame(alert_records)
            alert_df.write.format("delta").mode("append") \
                .option("mergeSchema", "true").save(ALERT_PATH)

            print(f"  Alert saved to anomaly_alerts table")
            print(f"  Affected order IDs: {', '.join(tampered_ids)}")
        else:
            print(f"  ✅ All {total_count} orders passed data integrity check "
                  f"(data_verified = true)")

    except Exception as e:
        print(f"  Data integrity check skipped: {e}")


# ═══════════════════════════════════════════════════════════════
# MAIN (V4)
# ═══════════════════════════════════════════════════════════════

def run(spark):
    pipeline_start = time.time()

    print(f"\n{'='*60}")
    print(f" SILVER -> GOLD V4 (SCD1 + Customer Analytics + Anomaly)")
    print(f" {datetime.now().isoformat()}")
    print(f"{'='*60}\n")

    print("  Reading Silver snapshot...")
    try:
        snapshot_df = spark.read.format("delta").load(SNAPSHOT_PATH)
        count = snapshot_df.count()
        print(f"  Found {count} orders in snapshot")
    except Exception as e:
        print(f"  Silver snapshot not found: {e}")
        print(f"  Run bronze_to_silver.py first!")
        return

    if count == 0:
        print("  No orders to process. Exiting.")
        return

    snapshot_df.cache()

    # ── Dimensions (SCD Type 1) ──
    build_dim_time(spark)
    build_dim_seller(spark, snapshot_df)
    build_dim_shipper(spark, snapshot_df)

    # ── Facts ──
    build_fact_orders(spark, snapshot_df)
    build_fact_delivery(spark, snapshot_df)
    build_fact_tax(spark, snapshot_df)
    build_fact_customer(spark, snapshot_df)

    snapshot_df.unpersist()

    # ── Anomaly Detection ──
    detect_anomalies(spark)

    # ── Data Integrity Check (Hash verification) ──
    detect_data_integrity(spark)

    total_duration = time.time() - pipeline_start

    print(f"\n{'='*60}")
    print(f" GOLD LAYER V4 COMPLETE")
    print(f"  Dimensions: dim_time, dim_seller (SCD1), dim_shipper (SCD1)")
    print(f"  Facts:      fact_orders, fact_delivery, fact_tax, fact_customer")
    print(f"  Anomaly:    detection + data integrity check completed")
    print(f"  Duration:   {total_duration:.1f}s")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    spark = create_spark_session()
    spark.sparkContext.setLogLevel("WARN")

    try:
        run(spark)
    except Exception as e:
        print(f"\n  ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        spark.stop()


