#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Debug HMS — Kiểm tra tại sao Hive Metastore crash
# ═══════════════════════════════════════════════════════════════

echo "═══ HMS Container Restart Count ═══"
docker inspect lakehouse-hive-metastore --format='{{.RestartCount}}' 2>/dev/null || echo "Container not found"

echo ""
echo "═══ HMS Last 50 Log Lines ═══"
docker compose logs hive-metastore --tail 50 2>/dev/null

echo ""
echo "═══ HMS Connectivity Tests ═══"
echo -n "  HMS → PostgreSQL: "
docker compose exec -T hive-metastore nc -z metastore-db 5432 2>/dev/null && echo "✅ OK" || echo "❌ FAIL"

echo -n "  HMS → MinIO (S3): "
docker compose exec -T hive-metastore nc -z minio-lakehouse 9000 2>/dev/null && echo "✅ OK" || echo "❌ FAIL"

echo ""
echo "═══ Trino → HMS Test ═══"
docker compose exec -T trino trino --execute "SHOW CATALOGS" 2>&1
echo ""
docker compose exec -T trino trino --execute "SHOW SCHEMAS FROM delta" 2>&1
