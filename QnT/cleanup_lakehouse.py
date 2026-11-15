from pyspark.sql import SparkSession
from delta.tables import DeltaTable

spark = SparkSession.builder.appName("Cleanup").getOrCreate()

print("Cleaning tbl_order_events...")
try:
    events_table = DeltaTable.forPath(spark, "s3a://ecommerce-lakehouse/delta/silver/tbl_order_events")
    events_table.delete("block_number > 900000")
    print("Deleted fake blocks from tbl_order_events.")
except Exception as e:
    print("Error tbl_order_events:", e)

print("Cleaning tbl_orders_snapshot...")
try:
    snapshot_table = DeltaTable.forPath(spark, "s3a://ecommerce-lakehouse/delta/silver/tbl_orders_snapshot")
    snapshot_table.delete("block_number > 900000")
    print("Deleted fake blocks from tbl_orders_snapshot.")
except Exception as e:
    print("Error tbl_orders_snapshot:", e)

print("Cleanup complete!")
