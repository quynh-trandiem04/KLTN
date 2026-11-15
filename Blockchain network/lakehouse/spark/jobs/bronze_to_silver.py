"""
═══════════════════════════════════════════════════════════════
Bronze → Silver ETL Pipeline (V4 — Data Quality Framework)
═══════════════════════════════════════════════════════════════
V4 upgrades over V3:
  - Quality Rules Engine (declarative, configurable)
  - Quarantine Table (Dead Letter Queue for bad data)
  - Step-level Pipeline Metrics & Observability
  - Schema Evolution Detection
  - Data Lineage Tracking

Input:  s3a://ecommerce-lakehouse/structured/**/*.jsonl
Output: Delta tables:
  - delta.silver.tbl_order_events      (append-only, clean data only)
  - delta.silver.tbl_orders_snapshot    (upsert: trạng thái mới nhất)
  - delta.silver.quarantine             (append: dữ liệu lỗi bị cách ly)
  - delta.silver.pipeline_metrics       (append: metrics mỗi step)
  - delta.silver.audit_lineage          (append: ETL audit + lineage)

Usage:
  spark-submit /opt/spark-jobs/bronze_to_silver.py
  spark-submit /opt/spark-jobs/bronze_to_silver.py --mode streaming
═══════════════════════════════════════════════════════════════
"""

import sys
import uuid
import time
from datetime import datetime
from pyspark.sql import SparkSession, DataFrame
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType,
    BooleanType, ArrayType, LongType, DecimalType
)
from delta.tables import DeltaTable

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════

MINIO_BUCKET = "ecommerce-lakehouse"
BRONZE_PATH = f"s3a://{MINIO_BUCKET}/structured"
SILVER_BASE = f"s3a://{MINIO_BUCKET}/delta/silver"
CHECKPOINT_PATH = f"s3a://{MINIO_BUCKET}/_checkpoints/bronze_to_silver"

EVENTS_PATH = f"{SILVER_BASE}/tbl_order_events"
SNAPSHOT_PATH = f"{SILVER_BASE}/tbl_orders_snapshot"
AUDIT_PATH = f"{SILVER_BASE}/audit_lineage"
QUARANTINE_PATH = f"{SILVER_BASE}/quarantine"
METRICS_PATH = f"{SILVER_BASE}/pipeline_metrics"

# Valid statuses from Hyperledger Fabric chaincode
VALID_STATUSES = [
    "CREATED", "PAID", "SHIPPED", "DELIVERED", "SETTLED",
    "CANCELLED", "RETURN_REQUESTED", "RETURN_IN_TRANSIT", "RETURNED"
]


# ═══════════════════════════════════════════════════════════════
# SCHEMA — Matches actual JSONL structure
# ═══════════════════════════════════════════════════════════════

seller_data_schema = StructType([
    StructField("orderID", StringType()),
    StructField("customerID", StringType()),
    StructField("TotalAmount", LongType()),
    StructField("FinalPrice", LongType()),
    StructField("vatAmount", LongType()),
    StructField("platformDiscountAmount", LongType()),
    StructField("sellerNetIncome", LongType()),
    StructField("sellerTaxCode", StringType()),
    StructField("items", ArrayType(StructType([
        StructField("productID", StringType()),
        StructField("productName", StringType()),
        StructField("quantity", LongType()),
        StructField("unitPrice", LongType()),
        StructField("variantID", StringType()),
    ]))),
])

shipper_data_schema = StructType([
    StructField("orderID", StringType()),
    StructField("shippingAddress", StringType()),
    StructField("phone", StringType()),
    StructField("shippingFee", LongType()),
    StructField("codAmount", LongType()),
])

tax_data_schema = StructType([
    StructField("orderID", StringType()),
    StructField("sellerCompanyID", StringType()),
    StructField("sellerID", StringType()),
    StructField("sellerTaxCode", StringType()),
    StructField("taxableRevenue", LongType()),
    StructField("vatAmount", LongType()),
    StructField("transactionDate", StringType()),
    StructField("note", StringType()),
])

private_data_schema = StructType([
    StructField("seller_data", seller_data_schema),
    StructField("shipper_data", shipper_data_schema),
    StructField("tax_data", tax_data_schema),
    StructField("data_verified", BooleanType()),
])

event_schema = StructType([
    StructField("block_number", LongType()),
    StructField("tx_index", IntegerType()),
    StructField("tx_id", StringType()),
    StructField("timestamp", StringType()),
    StructField("channel_id", StringType()),
    StructField("chaincode_id", StringType()),
    StructField("function_name", StringType()),
    StructField("args", ArrayType(StringType())),
    StructField("creator_msp", StringType()),
    StructField("creator_cn", StringType()),
    StructField("endorsers", ArrayType(StringType())),
    StructField("endorser_count", IntegerType()),
    StructField("validation_code", StringType()),
    StructField("is_valid", BooleanType()),
    StructField("order_data", StructType([
        StructField("order_id", StringType()),
        StructField("status", StringType()),
        StructField("payment_method", StringType()),
        StructField("cod_status", StringType()),
        StructField("seller_company_id", StringType()),
        StructField("shipper_company_id", StringType()),
        StructField("vat_rate", DecimalType(10, 4)),
        StructField("created_at", StringType()),
        StructField("updated_at", StringType()),
        StructField("delivery_timestamp", StringType()),
        StructField("paid_at", StringType()),
        StructField("shipped_at", StringType()),
        StructField("settled_at", StringType()),
        StructField("cancelled_at", StringType()),
        StructField("return_requested_at", StringType()),
        StructField("return_completed_at", StringType()),
        StructField("history_count", IntegerType()),
        StructField("last_action", StringType()),
    ])),
    StructField("private_data", private_data_schema),
    StructField("private_data_hashes", ArrayType(StringType())),
])


# ═══════════════════════════════════════════════════════════════
# SPARK SESSION
# ═══════════════════════════════════════════════════════════════

def create_spark_session():
    return (SparkSession.builder
        .appName("Lakehouse-Bronze-to-Silver")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
        .getOrCreate()
    )


# ═══════════════════════════════════════════════════════════════
# TRANSFORM — V3: Direct extraction (data đã đầy đủ)
# ═══════════════════════════════════════════════════════════════

def transform_events(df: DataFrame) -> DataFrame:
    """
    Transform raw JSONL events — V3 simplified:
    - order_data.status dùng trực tiếp (không derive từ function_name)
    - Tất cả trường từ order_data + private_data
    """
    transformed = (df
        # Only valid ecommerce transactions
        .filter(F.col("is_valid") == True)
        .filter(F.col("chaincode_id") == "ecommerce")

        # Parse timestamp
        .withColumn("event_timestamp", F.to_timestamp(F.col("timestamp")))

        # ── ORDER ID ──
        .withColumn("order_id",
            F.coalesce(
                F.col("order_data.order_id"),
                F.when(
                    (F.size("args") > 0) & F.col("args")[0].startswith("ORD-"),
                    F.col("args")[0]
                ),
                F.col("private_data.seller_data.orderID")
            )
        )

        # ── ORDER STATUS (trực tiếp từ sổ cái) ──
        .withColumn("order_status", F.col("order_data.status"))

        # ── ORDER DATA (Public State) ──
        .withColumn("payment_method", F.col("order_data.payment_method"))
        .withColumn("cod_status", F.col("order_data.cod_status"))
        .withColumn("vat_rate", F.col("order_data.vat_rate"))
        .withColumn("seller_company_id", F.col("order_data.seller_company_id"))
        .withColumn("shipper_company_id", F.col("order_data.shipper_company_id"))
        .withColumn("order_created_at", F.to_timestamp(F.col("order_data.created_at")))
        .withColumn("order_updated_at", F.to_timestamp(F.col("order_data.updated_at")))
        .withColumn("delivery_timestamp", F.to_timestamp(F.col("order_data.delivery_timestamp")))
        .withColumn("paid_at", F.to_timestamp(F.col("order_data.paid_at")))
        .withColumn("shipped_at", F.to_timestamp(F.col("order_data.shipped_at")))
        .withColumn("settled_at", F.to_timestamp(F.col("order_data.settled_at")))
        .withColumn("cancelled_at", F.to_timestamp(F.col("order_data.cancelled_at")))
        .withColumn("return_requested_at", F.to_timestamp(F.col("order_data.return_requested_at")))
        .withColumn("return_completed_at", F.to_timestamp(F.col("order_data.return_completed_at")))
        .withColumn("history_count", F.col("order_data.history_count"))
        .withColumn("last_action", F.col("order_data.last_action"))

        # ── SELLER DATA (from private_data.seller_data) ──
        .withColumn("seller_total_amount",
            F.col("private_data.seller_data.TotalAmount").cast(DecimalType(18, 2)))
        .withColumn("seller_final_price",
            F.col("private_data.seller_data.FinalPrice").cast(DecimalType(18, 2)))
        .withColumn("seller_vat_amount",
            F.col("private_data.seller_data.vatAmount").cast(DecimalType(18, 2)))
        .withColumn("seller_net_income",
            F.col("private_data.seller_data.sellerNetIncome").cast(DecimalType(18, 2)))
        .withColumn("platform_discount",
            F.col("private_data.seller_data.platformDiscountAmount").cast(DecimalType(18, 2)))
        .withColumn("seller_tax_code",
            F.col("private_data.seller_data.sellerTaxCode"))
        .withColumn("customer_id",
            F.col("private_data.seller_data.customerID"))
        .withColumn("item_count",
            F.when(F.col("private_data.seller_data.items").isNotNull(),
                   F.size(F.col("private_data.seller_data.items"))
            ).otherwise(0)
        )

        # ── SHIPPER DATA (from private_data.shipper_data) ──
        .withColumn("shipping_fee",
            F.col("private_data.shipper_data.shippingFee").cast(DecimalType(18, 2)))
        .withColumn("cod_amount",
            F.col("private_data.shipper_data.codAmount").cast(DecimalType(18, 2)))
        .withColumn("shipping_address",
            F.col("private_data.shipper_data.shippingAddress"))

        # ── TAX DATA (chỉ có khi status = SETTLED) ──
        .withColumn("taxable_revenue",
            F.col("private_data.tax_data.taxableRevenue").cast(DecimalType(18, 2)))
        .withColumn("tax_vat_amount",
            F.col("private_data.tax_data.vatAmount").cast(DecimalType(18, 2)))
        .withColumn("tax_seller_code",
            F.col("private_data.tax_data.sellerTaxCode"))
        .withColumn("transaction_date",
            F.to_timestamp(F.col("private_data.tax_data.transactionDate")))

        # ── FLAGS ──
        .withColumn("has_seller_data",
            F.col("private_data.seller_data").isNotNull())
        .withColumn("has_shipper_data",
            F.col("private_data.shipper_data").isNotNull())
        .withColumn("has_tax_data",
            F.col("private_data.tax_data").isNotNull())
        .withColumn("data_verified",
            F.col("private_data.data_verified"))

        # ── ETL metadata ──
        .withColumn("etl_run_id", F.lit(str(uuid.uuid4())))
        .withColumn("etl_processed_at", F.current_timestamp())

        # Filter: keep only events with order_id
        .filter(F.col("order_id").isNotNull())

        # Drop raw nested columns
        .drop("private_data", "private_data_hashes", "args",
              "endorsers", "timestamp", "order_data")
    )

    return transformed


# ═══════════════════════════════════════════════════════════════
# DELTA TABLE WRITERS
# ═══════════════════════════════════════════════════════════════

def write_events_append(df: DataFrame, path: str):
    count = df.count()
    (df.write.format("delta").mode("append")
        .option("mergeSchema", "true").save(path))
    print(f"  Events appended: {count} rows")


def upsert_snapshot(spark: SparkSession, df: DataFrame, path: str):
    """
    Snapshot V3 — Simplified: latest event per order_id (by block_number DESC).
    Data đã đầy đủ, không cần fill-gaps aggregation.
    """
    w = Window.partitionBy("order_id").orderBy(
        F.desc("block_number"), F.desc("tx_index")
    )
    latest = (df
        .withColumn("rn", F.row_number().over(w))
        .filter(F.col("rn") == 1)
        .drop("rn")
    )

    print(f"  Snapshot preview:")
    latest.select("order_id", "order_status", "seller_company_id",
                  "seller_total_amount", "payment_method", "block_number"
                  ).show(10, truncate=False)

    try:
        target = DeltaTable.forPath(spark, path)
        (target.alias("t")
            .merge(latest.alias("s"), "t.order_id = s.order_id")
            .whenMatchedUpdateAll(condition="s.block_number >= t.block_number")
            .whenNotMatchedInsertAll()
            .execute())
        print(f"  Snapshot merged: {latest.count()} orders")
    except Exception:
        latest.write.format("delta").mode("overwrite")  \
            .option("mergeSchema", "true").save(path)
        print(f"  Snapshot created: {latest.count()} orders")


def write_audit(spark, run_id, batch_id, events_count, snapshot_count, path,
                quarantine_count=0, clean_count=None, quality_report=None):
    """Enhanced audit with lineage tracking (V4)."""
    if clean_count is None:
        clean_count = events_count
    clean_rate = round(clean_count / max(events_count, 1) * 100, 2)

    audit_data = [{
        "run_id": run_id,
        "batch_id": batch_id,
        "processed_at": datetime.now().isoformat(),
        "events_count": events_count,
        "clean_count": clean_count,
        "quarantine_count": quarantine_count,
        "snapshot_count": snapshot_count,
        "clean_rate": clean_rate,
        "quality_summary": str(quality_report["rules"]) if quality_report else None,
        "status": "SUCCESS",
        "pipeline_version": "V4",
    }]

    audit = spark.createDataFrame(audit_data)
    audit.write.format("delta").mode("append")  \
        .option("mergeSchema", "true").save(path)
    print(f"  Audit logged: batch={batch_id} | clean_rate={clean_rate}%")


# ═══════════════════════════════════════════════════════════════
# INCREMENTAL PROCESSING — chỉ xử lý blocks mới
# ═══════════════════════════════════════════════════════════════

def get_max_processed_block(spark):
    """Lấy block_number lớn nhất đã xử lý từ tbl_order_events."""
    try:
        events_df = spark.read.format("delta").load(EVENTS_PATH)
        max_block = events_df.agg(F.max("block_number")).collect()[0][0]
        return max_block if max_block is not None else -1
    except Exception:
        return -1  # Table chưa tồn tại


# ═══════════════════════════════════════════════════════════════
# DATA QUALITY FRAMEWORK (V4)
# ═══════════════════════════════════════════════════════════════

# ── Quality Rules Engine (Declarative) ──
# Mỗi rule gồm: tên, severity (CRITICAL/WARNING), filter expression.
# CRITICAL: dữ liệu bị đưa vào Quarantine (không vào Silver)
# WARNING: dữ liệu vẫn vào Silver nhưng được đánh dấu flag

QUALITY_RULES = [
    {
        "name": "order_id_not_null",
        "description": "Order ID phải tồn tại",
        "severity": "CRITICAL",
        "filter": lambda df: df.filter(F.col("order_id").isNull()),
    },
    {
        "name": "valid_order_status",
        "description": "Order status phải nằm trong danh sách hợp lệ",
        "severity": "CRITICAL",
        "filter": lambda df: df.filter(
            F.col("order_status").isNull() |
            ~F.col("order_status").isin(VALID_STATUSES)
        ),
    },
    {
        "name": "seller_exists",
        "description": "Seller company ID phải có giá trị",
        "severity": "CRITICAL",
        "filter": lambda df: df.filter(
            F.col("seller_company_id").isNull() |
            (F.col("seller_company_id") == "")
        ),
    },
    {
        "name": "positive_amount",
        "description": "Seller total amount không được âm",
        "severity": "CRITICAL",
        "filter": lambda df: df.filter(F.col("seller_total_amount") < 0),
    },
    {
        "name": "amount_not_null",
        "description": "Seller total amount phải tồn tại",
        "severity": "WARNING",
        "filter": lambda df: df.filter(F.col("seller_total_amount").isNull()),
    },
    {
        "name": "timestamp_consistency",
        "description": "Thời gian tạo đơn phải <= thời gian cập nhật",
        "severity": "WARNING",
        "filter": lambda df: df.filter(
            F.col("order_created_at").isNotNull() &
            F.col("order_updated_at").isNotNull() &
            (F.col("order_created_at") > F.col("order_updated_at"))
        ),
    },
    {
        "name": "block_number_valid",
        "description": "Block number phải > 0",
        "severity": "CRITICAL",
        "filter": lambda df: df.filter(
            F.col("block_number").isNull() | (F.col("block_number") < 0)
        ),
    },
]


def apply_quality_gates(df: DataFrame) -> tuple:
    """
    Quality Gates Engine — V4.
    Áp dụng tất cả rules, tách dữ liệu thành:
      - clean_df:      dữ liệu đạt chất lượng → ghi vào Silver
      - quarantine_df: dữ liệu lỗi → ghi vào Quarantine table
      - report:        dict tổng hợp kết quả kiểm tra

    Returns: (clean_df, quarantine_df, report)
    """
    total = df.count()
    if total == 0:
        return df, None, {"total": 0, "clean": 0, "quarantine": 0, "rules": {}}

    quarantine_parts = []
    critical_ids_to_remove = set()
    report = {"total": total, "rules": {}}

    print(f"\n  ── Data Quality Gates (V4) ──")
    print(f"  Total events: {total}")
    print(f"  Rules: {len(QUALITY_RULES)}")
    print(f"")

    all_ok = True
    for rule in QUALITY_RULES:
        name = rule["name"]
        severity = rule["severity"]
        bad_rows = rule["filter"](df)
        bad_count = bad_rows.count()
        rate = bad_count / total * 100

        report["rules"][name] = {
            "severity": severity,
            "count": bad_count,
            "rate": round(rate, 2),
            "description": rule["description"],
        }

        if bad_count > 0:
            all_ok = False
            symbol = "❌" if severity == "CRITICAL" else "⚠️"
            print(f"    {symbol} [{severity}] {name}: {bad_count}/{total} ({rate:.1f}%) — {rule['description']}")

            if severity == "CRITICAL":
                # Đánh dấu dữ liệu lỗi với lý do quarantine
                quarantine_batch = (
                    bad_rows
                    .withColumn("quarantine_reason", F.lit(name))
                    .withColumn("quarantine_severity", F.lit(severity))
                    .withColumn("quarantine_description", F.lit(rule["description"]))
                    .withColumn("quarantined_at", F.current_timestamp())
                )
                quarantine_parts.append(quarantine_batch)
        else:
            print(f"    ✅ [{severity}] {name}: OK")

    # Gộp tất cả quarantine rows (loại bỏ trùng lặp)
    quarantine_df = None
    if quarantine_parts:
        quarantine_df = quarantine_parts[0]
        for part in quarantine_parts[1:]:
            quarantine_df = quarantine_df.unionByName(part, allowMissingColumns=True)
        # Loại trùng (1 row có thể vi phạm nhiều rule → giữ rule đầu tiên)
        quarantine_df = quarantine_df.dropDuplicates(["tx_id"])

    # Tạo clean_df: loại bỏ tất cả rows vi phạm CRITICAL rules
    if quarantine_df is not None and quarantine_df.count() > 0:
        quarantine_tx_ids = quarantine_df.select("tx_id").distinct()
        clean_df = df.join(quarantine_tx_ids, on="tx_id", how="left_anti")
    else:
        clean_df = df

    clean_count = clean_df.count()
    quarantine_count = quarantine_df.count() if quarantine_df else 0

    report["clean"] = clean_count
    report["quarantine"] = quarantine_count
    report["clean_rate"] = round(clean_count / max(total, 1) * 100, 2)

    print(f"")
    if all_ok:
        print(f"  ✅ All {len(QUALITY_RULES)} quality gates passed!")
    print(f"  📊 Result: {clean_count} clean ({report['clean_rate']}%) | {quarantine_count} quarantined")

    return clean_df, quarantine_df, report


def write_quarantine(df: DataFrame, path: str):
    """Ghi dữ liệu lỗi vào Quarantine table (append-only)."""
    if df is None:
        return 0
    count = df.count()
    if count == 0:
        return 0
    df.write.format("delta").mode("append") \
        .option("mergeSchema", "true").save(path)
    print(f"  ⛔ Quarantine written: {count} rows → {path.split('/')[-1]}")
    return count


# ═══════════════════════════════════════════════════════════════
# SCHEMA EVOLUTION DETECTION
# ═══════════════════════════════════════════════════════════════

def detect_schema_evolution(spark, new_df, table_path, table_name):
    """
    So sánh schema của batch mới với Delta table hiện có.
    Phát hiện: cột mới thêm, cột bị mất, thay đổi data type.
    """
    try:
        existing = spark.read.format("delta").load(table_path)
        existing_fields = {f.name: str(f.dataType) for f in existing.schema.fields}
        new_fields = {f.name: str(f.dataType) for f in new_df.schema.fields}

        added = {k: new_fields[k] for k in new_fields if k not in existing_fields}
        removed = {k: existing_fields[k] for k in existing_fields if k not in new_fields}
        type_changed = {
            k: {"old": existing_fields[k], "new": new_fields[k]}
            for k in new_fields
            if k in existing_fields and new_fields[k] != existing_fields[k]
        }

        if added or removed or type_changed:
            print(f"\n  ── Schema Evolution: {table_name} ──")
            if added:
                print(f"    🆕 New columns: {added}")
            if removed:
                print(f"    ⚠️  Removed columns: {list(removed.keys())}")
            if type_changed:
                print(f"    🔄 Type changes: {type_changed}")
            return {"added": added, "removed": removed, "type_changed": type_changed}
        return None
    except Exception:
        # Table chưa tồn tại — first run
        return None


# ═══════════════════════════════════════════════════════════════
# PIPELINE METRICS & OBSERVABILITY
# ═══════════════════════════════════════════════════════════════

def record_step_metrics(spark, run_id, step_name, input_count, output_count,
                        quarantine_count, duration_seconds, path,
                        schema_changes=None, quality_report=None):
    """
    Ghi metrics chi tiết cho mỗi bước pipeline.
    Cho phép monitoring & anomaly detection.
    """
    success_rate = round(output_count / max(input_count, 1) * 100, 2)

    metrics_data = [{
        "run_id": run_id,
        "step_name": step_name,
        "input_rows": input_count,
        "output_rows": output_count,
        "quarantine_rows": quarantine_count,
        "success_rate": success_rate,
        "duration_seconds": float(round(duration_seconds, 2)),
        "schema_changes": str(schema_changes) if schema_changes else "",
        "quality_summary": str(quality_report) if quality_report else "",
        "processed_at": datetime.now().isoformat(),
    }]

    metrics_df = spark.createDataFrame(metrics_data)
    metrics_df.write.format("delta").mode("append") \
        .option("mergeSchema", "true").save(path)

    symbol = "✅" if success_rate >= 99 else ("⚠️" if success_rate >= 90 else "❌")
    print(f"  {symbol} [{step_name}] {input_count}→{output_count} rows "
          f"({success_rate}% clean) in {duration_seconds:.1f}s")


# ═══════════════════════════════════════════════════════════════
# BATCH MODE (V4 — Incremental + Quality Gates)
# ═══════════════════════════════════════════════════════════════

def run_batch(spark):
    run_id = str(uuid.uuid4())
    pipeline_start = time.time()

    print(f"\n{'='*60}")
    print(f" BRONZE -> SILVER V4 (Quality Gates + Observability)")
    print(f" Run ID: {run_id}")
    print(f" Started: {datetime.now().isoformat()}")
    print(f"{'='*60}\n")

    # ── Step 0: Incremental — tìm block đã xử lý ──
    max_block = get_max_processed_block(spark)
    if max_block >= 0:
        print(f"  Last processed block: {max_block}")
        print(f"  Reading only new events (block > {max_block})...")
    else:
        print(f"  First run — reading all events...")

    raw_df = spark.read.schema(event_schema).json(f"{BRONZE_PATH}/*/*/*/*.jsonl")
    total_raw = raw_df.count()
    print(f"  Total events in MinIO: {total_raw}")

    # Filter: chỉ block mới
    if max_block >= 0:
        raw_df = raw_df.filter(F.col("block_number") > max_block)
        new_count = raw_df.count()
        print(f"  New events (block > {max_block}): {new_count}")
        if new_count == 0:
            print("  No new events. Pipeline is up-to-date.")
            return
    elif total_raw == 0:
        print("  No events found. Exiting.")
        return

    # ── Step 1: Transform ──
    step1_start = time.time()
    print("\n  ═══ Step 1: Transform ═══")
    print("  Transforming (V4: direct extraction)...")
    transformed = transform_events(raw_df)
    transformed.cache()
    events_count = transformed.count()
    step1_duration = time.time() - step1_start
    print(f"  Transformed: {events_count} valid events in {step1_duration:.1f}s")

    if events_count == 0:
        print("  No valid events after transform. Exiting.")
        transformed.unpersist()
        return

    # Show sample
    print("\n  Sample transformed data:")
    transformed.select("order_id", "order_status", "function_name",
                       "seller_company_id", "payment_method",
                       "seller_total_amount", "block_number"
                       ).show(5, truncate=False)

    # ── Step 2: Quality Gates ──
    step2_start = time.time()
    print("\n  ═══ Step 2: Quality Gates ═══")
    clean_df, quarantine_df, quality_report = apply_quality_gates(transformed)
    clean_df.cache()
    clean_count = clean_df.count()
    quarantine_count = quality_report["quarantine"]
    step2_duration = time.time() - step2_start

    record_step_metrics(spark, run_id, "quality_gates",
                        events_count, clean_count, quarantine_count,
                        step2_duration, METRICS_PATH,
                        quality_report=quality_report)

    # Ghi quarantine
    if quarantine_df is not None:
        write_quarantine(quarantine_df, QUARANTINE_PATH)

    if clean_count == 0:
        print("  ❌ All events quarantined. No clean data to write.")
        transformed.unpersist()
        clean_df.unpersist()
        return

    # ── Step 3: Schema Evolution Check ──
    schema_changes = detect_schema_evolution(
        spark, clean_df, EVENTS_PATH, "tbl_order_events")

    # ── Step 4: Write Silver Tables ──
    step4_start = time.time()
    print("\n  ═══ Step 3: Write Silver Tables ═══")
    write_events_append(clean_df, EVENTS_PATH)

    # Snapshot: cần đọc ALL events (cũ + mới) để xác định latest state
    all_events = spark.read.format("delta").load(EVENTS_PATH)
    upsert_snapshot(spark, all_events, SNAPSHOT_PATH)
    step4_duration = time.time() - step4_start

    s_count = clean_df.select("order_id").distinct().count()
    record_step_metrics(spark, run_id, "write_silver",
                        clean_count, clean_count, 0,
                        step4_duration, METRICS_PATH,
                        schema_changes=schema_changes)

    # ── Step 5: Audit Lineage ──
    write_audit(spark, run_id, 0, events_count, s_count, AUDIT_PATH,
                quarantine_count=quarantine_count,
                clean_count=clean_count,
                quality_report=quality_report)

    total_duration = time.time() - pipeline_start
    transformed.unpersist()
    clean_df.unpersist()

    print(f"\n{'='*60}")
    print(f" BATCH V4 COMPLETE")
    print(f"  Input events:  {events_count}")
    print(f"  Clean (→Silver): {clean_count} ({quality_report['clean_rate']}%)")
    print(f"  Quarantined:     {quarantine_count}")
    print(f"  Orders touched:  {s_count}")
    print(f"  Total duration:  {total_duration:.1f}s")
    print(f"{'='*60}\n")


# ═══════════════════════════════════════════════════════════════
# STREAMING MODE (V4 — with Quality Gates)
# ═══════════════════════════════════════════════════════════════

def run_streaming(spark):
    run_id = str(uuid.uuid4())
    print(f"\n BRONZE -> SILVER V4 (Streaming + Quality Gates)")
    print(f" Watching: {BRONZE_PATH}\n")

    def process_batch(batch_df, batch_id):
        if batch_df.rdd.isEmpty():
            return
        print(f"\n  -- Batch #{batch_id} --")
        transformed = transform_events(batch_df)
        if transformed.rdd.isEmpty():
            return

        # V4: Quality Gates trong streaming
        clean_df, quarantine_df, quality_report = apply_quality_gates(transformed)

        if quarantine_df is not None:
            write_quarantine(quarantine_df, QUARANTINE_PATH)

        clean_count = clean_df.count()
        if clean_count == 0:
            return

        write_events_append(clean_df, EVENTS_PATH)
        upsert_snapshot(spark, clean_df, SNAPSHOT_PATH)
        write_audit(spark, run_id, batch_id, transformed.count(),
                    clean_df.select("order_id").distinct().count(),
                    AUDIT_PATH,
                    quarantine_count=quality_report["quarantine"],
                    clean_count=clean_count,
                    quality_report=quality_report)

    query = (spark.readStream
        .schema(event_schema)
        .option("maxFilesPerTrigger", 10)
        .json(f"{BRONZE_PATH}/*/*/*/*.jsonl")
        .writeStream
        .foreachBatch(process_batch)
        .option("checkpointLocation", CHECKPOINT_PATH)
        .trigger(processingTime="30 seconds")
        .start())

    print("  Streaming started. Ctrl+C to stop.\n")
    query.awaitTermination()


# ═══════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    spark = create_spark_session()
    spark.sparkContext.setLogLevel("WARN")

    mode = "batch"
    if "--mode" in sys.argv:
        idx = sys.argv.index("--mode")
        mode = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else "batch"

    try:
        if mode == "streaming":
            run_streaming(spark)
        else:
            run_batch(spark)
    except Exception as e:
        print(f"\n  ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        spark.stop()



