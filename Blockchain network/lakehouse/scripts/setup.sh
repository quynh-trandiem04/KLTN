#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAKEHOUSE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$LAKEHOUSE_DIR"

echo ""
echo " LAKEHOUSE SETUP (OPTIMIZED)"
echo ""

# ─────────────────────────────────────────────

# CONFIG

# ─────────────────────────────────────────────

TIMEOUT=120

wait_for_port() {
NAME=$1
HOST=$2
PORT=$3

echo -n "  Waiting for $NAME..."

for i in $(seq 1 $TIMEOUT); do
if nc -z $HOST $PORT 2>/dev/null; then
echo " Done"
return 0
fi
    echo -n "."
sleep 1
done

echo "  TIMEOUT"
return 1
}

wait_for_http() {
NAME=$1
URL=$2

echo -n "  Waiting for $NAME..."

for i in $(seq 1 $TIMEOUT); do
if curl -s $URL >/dev/null 2>&1; then
echo " Done"
return 0
fi
    echo -n "."
    sleep 2
done

echo "  TIMEOUT"
return 1
}

# ─────────────────────────────────────────────

# STEP 1

# ─────────────────────────────────────────────

echo "═══ Step 1: Download JARs ═══"
bash scripts/download-jars.sh

# ─────────────────────────────────────────────

# STEP 2

# ─────────────────────────────────────────────

echo "═══ Step 2: Prepare directories ═══"
mkdir -p spark/jobs spark/jars trino/catalog trino/etc

# ─────────────────────────────────────────────

# STEP 3

# ─────────────────────────────────────────────

echo "═══ Step 3: Build Hive Metastore ═══"
docker compose build hive-metastore

# ─────────────────────────────────────────────

# STEP 4: START THEO THỨ TỰ (QUAN TRỌNG)

# ─────────────────────────────────────────────

echo "═══ Step 4: Start core services ═══"

docker compose up -d metastore-db

echo -n "  Waiting for Postgres..."
until docker compose exec -T metastore-db pg_isready -U ${METASTORE_DB_USER} -d ${METASTORE_DB_NAME} >/dev/null 2>&1; do
    echo -n "."
    sleep 2
done
echo " Done"

docker compose up -d hive-metastore

echo -n "  Waiting for Hive Metastore..."
until docker compose exec -T hive-metastore nc -z localhost 9083 >/dev/null 2>&1; do
    echo -n "."
    sleep 2
done
echo " Done"

docker compose up -d trino

echo -n "  Waiting for Trino..."
until curl -s http://localhost:8090/v1/info | grep -q '"starting":false'; do
    echo -n "."
    sleep 2
done
echo " Done"

docker compose up -d spark

echo -n "  Waiting for Spark Master..."
until curl -s http://localhost:8081 | grep -q "Spark Master"; do
    echo -n "."
    sleep 2
done
echo " Done"

docker compose up -d spark-worker superset

# ─────────────────────────────────────────────

# STEP 5: INIT SCHEMA

# ─────────────────────────────────────────────

echo ""
echo "═══ Step 5: Initialize Lakehouse ═══"

docker compose exec -T trino trino --execute "
    CREATE SCHEMA IF NOT EXISTS delta.bronze WITH (location = 's3a://ecommerce-lakehouse/delta/bronze');
    CREATE SCHEMA IF NOT EXISTS delta.silver WITH (location = 's3a://ecommerce-lakehouse/delta/silver');
    CREATE SCHEMA IF NOT EXISTS delta.gold   WITH (location = 's3a://ecommerce-lakehouse/delta/gold');
"

# ─────────────────────────────────────────────

# STEP 6: VERIFY

# ─────────────────────────────────────────────

echo ""
echo "═══ Step 6: Verify ═══"

docker compose exec -T trino trino --execute "SHOW SCHEMAS FROM delta"

IP=$(hostname -I | awk '{print $1}')

echo ""
echo "════════════════════════════════════════"
echo " LAKEHOUSE READY"
echo "════════════════════════════════════════"
echo "Spark UI:    http://$IP:8081"
echo "Trino UI:    http://$IP:8090"
echo "Superset:    http://$IP:8088"
echo "Metastore:   thrift://localhost:9083"
echo ""



