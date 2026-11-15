#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Lakehouse Health Check — Verify all services
# ═══════════════════════════════════════════════════════════════

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║     LAKEHOUSE HEALTH CHECK                           ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# ── 1. Docker containers ──
echo "═══ 1. Docker Containers ═══"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

# ── 2. Trino connectivity ──
echo ""
echo "═══ 2. Trino Catalogs ═══"
docker compose exec -T trino trino --execute "SHOW CATALOGS" 2>&1

# ── 3. HMS check ──
echo ""
echo "═══ 3. Hive Metastore Status ═══"
echo -n "  HMS port 9083: "
docker compose exec -T hive-metastore nc -z localhost 9083 2>/dev/null && echo "✅ Listening" || echo "❌ Not listening"
echo "  HMS restart count: $(docker inspect lakehouse-hive-metastore --format='{{.RestartCount}}' 2>/dev/null || echo 'unknown')"
echo "  HMS last 5 log lines:"
docker compose logs hive-metastore --tail 5 2>/dev/null | sed 's/^/    /'

# ── 4. Delta catalog schemas ──
echo ""
echo "═══ 4. Delta Schemas ═══"
SCHEMA_RESULT=$(docker compose exec -T trino trino --execute "SHOW SCHEMAS FROM delta" 2>&1)
if echo "$SCHEMA_RESULT" | grep -q "default"; then
    echo "$SCHEMA_RESULT"
    echo "  ✅ Delta catalog working"
else
    echo "  ❌ Delta catalog error: $SCHEMA_RESULT"
    echo ""
    echo "  Attempting schema creation..."
    docker compose exec -T trino trino --execute "
        CREATE SCHEMA IF NOT EXISTS delta.bronze WITH (location = 's3a://ecommerce-lakehouse/delta/bronze');
        CREATE SCHEMA IF NOT EXISTS delta.silver WITH (location = 's3a://ecommerce-lakehouse/delta/silver');
        CREATE SCHEMA IF NOT EXISTS delta.gold   WITH (location = 's3a://ecommerce-lakehouse/delta/gold');
    " 2>&1
fi

# ── 5. Spark Master ──
echo ""
echo "═══ 5. Spark Master ═══"
# Try both common ports (8080 mapped to 8081 in user's compose)
for PORT in 8081 8080; do
    SPARK_JSON=$(curl -s "http://localhost:${PORT}/json/" 2>/dev/null)
    if [ -n "$SPARK_JSON" ] && echo "$SPARK_JSON" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
        echo "$SPARK_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f'  Status: {d.get(\"status\",\"unknown\")}')
print(f'  Workers: {len(d.get(\"workers\",[]))}')
print(f'  Port: ${PORT}')
"
        break
    fi
done 2>/dev/null || echo "  ⚠️ Spark Master UI not reachable"

# ── 6. MinIO from Trino ──
echo ""
echo "═══ 6. MinIO Connectivity (via Trino) ═══"
TABLES_RESULT=$(docker compose exec -T trino trino --execute "SHOW TABLES FROM delta.silver" 2>&1)
if echo "$TABLES_RESULT" | grep -q "does not exist\|not exist"; then
    echo "  ⚠️ Schema delta.silver not yet created (run schema creation first)"
elif [ -z "$TABLES_RESULT" ]; then
    echo "  ✅ Connected! No tables yet (expected, Spark will create them)"
else
    echo "  ✅ Tables found:"
    echo "$TABLES_RESULT" | sed 's/^/    /'
fi

# ── 7. Superset ──
echo ""
echo "═══ 7. Superset ═══"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/health 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
    echo "  ✅ Superset healthy (http://localhost:8088)"
else
    echo "  ⚠️ Superset HTTP $HTTP_CODE"
fi

echo ""
echo "═══════════════════════════════════════════"
echo " Health check complete!"
echo "═══════════════════════════════════════════"
