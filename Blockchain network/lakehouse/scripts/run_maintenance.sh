#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Delta Lake Maintenance — Run weekly (Sunday 3AM)
# ═══════════════════════════════════════════════════════════════
# Crontab: 0 3 * * 0 /home/hadoopquynhthu/lakehouse/scripts/run_maintenance.sh
# ═══════════════════════════════════════════════════════════════

set -e
LAKEHOUSE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$LAKEHOUSE_DIR"

echo ""
echo "═══ Delta Maintenance — $(date '+%Y-%m-%d %H:%M:%S') ═══"
docker compose exec -T spark /opt/spark/bin/spark-submit /opt/spark-jobs/optimize_tables.py
echo "  Maintenance complete — $(date '+%Y-%m-%d %H:%M:%S')"


