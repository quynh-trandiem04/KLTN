#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Lakehouse ETL Pipeline V4 — Production (Quality Gates)
# ═══════════════════════════════════════════════════════════════
# Crontab:
#   0 2 * * * /home/hadoopquynhthu/lakehouse/scripts/run_pipeline.sh >> /var/log/lakehouse-etl.log 2>&1
#   0 3 * * 0 /home/hadoopquynhthu/lakehouse/scripts/run_maintenance.sh >> /var/log/lakehouse-maint.log 2>&1
# ═══════════════════════════════════════════════════════════════

set -e
LAKEHOUSE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$LAKEHOUSE_DIR"

LOG_DATE=$(date '+%Y-%m-%d %H:%M:%S')
START_TIME=$(date +%s)
PIPELINE_STATUS="SUCCESS"

echo ""
echo "═══════════════════════════════════════════"
echo " Lakehouse ETL Pipeline — $LOG_DATE"
echo "═══════════════════════════════════════════"

# ── Error handler ──
handle_error() {
    PIPELINE_STATUS="FAILED at Step $1"
    echo ""
    echo "  ❌ Pipeline FAILED at Step $1: $2"
    echo "  ❌ Error time: $(date '+%Y-%m-%d %H:%M:%S')"
    # Có thể thêm webhook/email alert ở đây:
    # curl -X POST "https://hooks.slack.com/..." -d '{"text":"❌ Lakehouse pipeline failed"}'
}

# ── Step 0: Ensure schemas exist ──
echo ""
echo "═══ Step 0: Ensure Trino schemas ═══"
docker compose exec -T trino trino --execute "
  CREATE SCHEMA IF NOT EXISTS delta.silver WITH (location = 's3a://ecommerce-lakehouse/delta/silver');
  CREATE SCHEMA IF NOT EXISTS delta.gold   WITH (location = 's3a://ecommerce-lakehouse/delta/gold');
" 2>/dev/null && echo "  Schemas ready" || echo "  Schema creation failed (check HMS)"

# ── Step 1: Bronze → Silver (Incremental) ──
echo ""
echo "═══ Step 1: Bronze → Silver (Spark) ═══"
if ! docker compose exec -T spark /opt/spark/bin/spark-submit /opt/spark-jobs/bronze_to_silver.py; then
    handle_error "1" "bronze_to_silver.py failed"
fi

# ── Step 2: Silver → Gold ──
echo ""
echo "═══ Step 2: Silver → Gold (Spark) ═══"
if ! docker compose exec -T spark /opt/spark/bin/spark-submit /opt/spark-jobs/silver_to_gold.py; then
    handle_error "2" "silver_to_gold.py failed"
fi

# ── Step 3: Register tables in Trino ──
echo ""
echo "═══ Step 3: Register Delta tables in Trino ═══"
TABLES=(
  "silver:tbl_order_events:s3a://ecommerce-lakehouse/delta/silver/tbl_order_events"
  "silver:tbl_orders_snapshot:s3a://ecommerce-lakehouse/delta/silver/tbl_orders_snapshot"
  "silver:audit_lineage:s3a://ecommerce-lakehouse/delta/silver/audit_lineage"
  "silver:quarantine:s3a://ecommerce-lakehouse/delta/silver/quarantine"
  "silver:pipeline_metrics:s3a://ecommerce-lakehouse/delta/silver/pipeline_metrics"
  # Gold — Dimensions
  "gold:dim_time:s3a://ecommerce-lakehouse/delta/gold/dim_time"
  "gold:dim_seller:s3a://ecommerce-lakehouse/delta/gold/dim_seller"
  "gold:dim_shipper:s3a://ecommerce-lakehouse/delta/gold/dim_shipper"
  # Gold — Facts
  "gold:fact_orders:s3a://ecommerce-lakehouse/delta/gold/fact_orders"
  "gold:fact_delivery:s3a://ecommerce-lakehouse/delta/gold/fact_delivery"
  "gold:fact_tax:s3a://ecommerce-lakehouse/delta/gold/fact_tax"
  "gold:fact_customer_behavior:s3a://ecommerce-lakehouse/delta/gold/fact_customer_behavior"
  "gold:anomaly_alerts:s3a://ecommerce-lakehouse/delta/gold/anomaly_alerts"
)
for entry in "${TABLES[@]}"; do
  IFS=':' read -r schema table location <<< "$entry"
  docker compose exec -T trino trino --execute \
    "CALL delta.system.register_table(schema_name => '$schema', table_name => '$table', table_location => '$location')" \
    2>/dev/null && echo "  Registered: $schema.$table" || echo "  Exists: $schema.$table"
done

# ── Step 4: Quick Validation ──
echo ""
echo "═══ Step 4: Data Validation ═══"
docker compose exec -T trino trino --execute "
  SELECT
    'fact_orders' AS tbl, COUNT(*) AS cnt FROM delta.gold.fact_orders
  UNION ALL
  SELECT
    'fact_delivery', COUNT(*) FROM delta.gold.fact_delivery
  UNION ALL
  SELECT
    'fact_tax', COUNT(*) FROM delta.gold.fact_tax
  UNION ALL
  SELECT
    'fact_customer', COUNT(*) FROM delta.gold.fact_customer_behavior
  UNION ALL
  SELECT
    'dim_seller', COUNT(*) FROM delta.gold.dim_seller
  UNION ALL
  SELECT
    'dim_shipper', COUNT(*) FROM delta.gold.dim_shipper
  UNION ALL
  SELECT
    'quarantine', COUNT(*) FROM delta.silver.quarantine
" 2>/dev/null && echo "  Validation complete" || echo "  ⚠️  Validation skipped"

# ── Summary ──
END_TIME=$(date +%s)
DURATION=$(( END_TIME - START_TIME ))
MINUTES=$(( DURATION / 60 ))
SECONDS=$(( DURATION % 60 ))

echo ""
echo "═══════════════════════════════════════════"
echo "  Status: $PIPELINE_STATUS"
echo "  Duration: ${MINUTES}m ${SECONDS}s"
echo "  Completed: $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════"


