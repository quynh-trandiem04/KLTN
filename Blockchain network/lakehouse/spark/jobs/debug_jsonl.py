"""
Debug: Đọc JSONL không dùng schema enforcement → xem cấu trúc thực tế
"""
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

spark = (SparkSession.builder
    .appName("Debug-JSONL")
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
    .getOrCreate())
spark.sparkContext.setLogLevel("WARN")

BRONZE_PATH = "s3a://ecommerce-lakehouse/structured"

# Đọc KHÔNG CÓ SCHEMA (tự suy luận)
print("═══ Reading JSONL (schema inferred) ═══")
df = spark.read.option("multiLine", "false").json(f"{BRONZE_PATH}/*/*/*/*.jsonl")

print(f"\n═══ INFERRED SCHEMA ═══")
df.printSchema()

print(f"\n═══ SAMPLE DATA (first 2 rows) ═══")
df.show(2, truncate=False, vertical=True)

# Check order_data specifically
print(f"\n═══ order_data STRUCTURE ═══")
if "order_data" in df.columns:
    od = df.select("order_data.*").limit(2)
    od.printSchema()
    od.show(2, truncate=False, vertical=True)
else:
    print("  ❌ 'order_data' column NOT FOUND!")
    print(f"  Available columns: {df.columns}")

# Check a CreateOrder event
print(f"\n═══ CreateOrder EVENT ═══")
create = df.filter(F.col("function_name") == "CreateOrder")
if create.count() > 0:
    create.select("order_data", "args", "function_name").show(1, truncate=False, vertical=True)
else:
    create2 = df.filter(F.col("function") == "CreateOrder")
    if create2.count() > 0:
        print("  Found via 'function' column (not 'function_name')!")
        create2.show(1, truncate=False, vertical=True)

spark.stop()

