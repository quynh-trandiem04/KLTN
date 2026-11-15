"""
═══════════════════════════════════════════════════════════════
Delta Table Maintenance — OPTIMIZE + VACUUM
═══════════════════════════════════════════════════════════════
Usage:
  docker compose exec spark spark-submit /opt/spark-jobs/optimize_tables.py
═══════════════════════════════════════════════════════════════
"""

from pyspark.sql import SparkSession
from delta.tables import DeltaTable

BUCKET = "ecommerce-lakehouse"
TABLES = [
    f"s3a://{BUCKET}/delta/silver/tbl_order_events",
    f"s3a://{BUCKET}/delta/silver/tbl_orders_snapshot",
    f"s3a://{BUCKET}/delta/silver/quarantine",
    f"s3a://{BUCKET}/delta/silver/pipeline_metrics",
    f"s3a://{BUCKET}/delta/silver/audit_lineage",
    f"s3a://{BUCKET}/delta/gold/dim_seller",
    f"s3a://{BUCKET}/delta/gold/dim_shipper",
    f"s3a://{BUCKET}/delta/gold/fact_orders",
    f"s3a://{BUCKET}/delta/gold/fact_delivery",
    f"s3a://{BUCKET}/delta/gold/fact_tax",
    f"s3a://{BUCKET}/delta/gold/fact_customer_behavior",
    f"s3a://{BUCKET}/delta/gold/anomaly_alerts",
]

def run():
    spark = (SparkSession.builder
        .appName("Delta-Maintenance")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
        .getOrCreate())
    spark.sparkContext.setLogLevel("WARN")

    for path in TABLES:
        name = path.split("/")[-1]
        try:
            dt = DeltaTable.forPath(spark, path)
            print(f"  OPTIMIZE {name}...")
            dt.optimize().executeCompaction()
            print(f"  VACUUM {name} (168 hours)...")
            dt.vacuum(168)  # 7 days retention
            print(f"   {name} maintained")
        except Exception as e:
            print(f"   {name}: {e}")

    spark.stop()
    print("\n Maintenance complete!")

if __name__ == "__main__":
    run()


