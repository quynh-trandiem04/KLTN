#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Superset Initial Setup — Run ONCE after first deploy
# ═══════════════════════════════════════════════════════════════
# Usage: ./scripts/setup-superset.sh
# ═══════════════════════════════════════════════════════════════

set -e
LAKEHOUSE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$LAKEHOUSE_DIR"

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║     SUPERSET SETUP                                   ║"
echo "╚═══════════════════════════════════════════════════════╝"

# ── Step 1: Initialize Superset DB ──
echo ""
echo "═══ Step 1: Initialize Superset database ═══"
docker compose exec -T superset superset db upgrade
echo "  Database initialized"

# ── Step 2: Create admin user ──
echo ""
echo "═══ Step 2: Create admin user ═══"
docker compose exec -T superset superset fab create-admin \
  --username admin \
  --firstname Admin \
  --lastname Lakehouse \
  --email admin@lakehouse.local \
  --password admin123 \
  2>/dev/null && echo "  Admin user created" || echo "  Admin user already exists"

# ── Step 3: Initialize roles and permissions ──
echo ""
echo "═══ Step 3: Initialize roles ═══"
docker compose exec -T superset superset init
echo "  Roles initialized"

# ── Step 4: Install Trino driver ──
echo ""
echo "═══ Step 4: Install Trino driver ═══"
docker compose exec -T superset pip install trino sqlalchemy-trino 2>/dev/null
echo "  Trino driver installed"

# ── Step 5: Add Trino database connection ──
echo ""
echo "═══ Step 5: Add Trino connection ═══"
docker compose exec -T superset superset set-database-uri \
  --database-name "Lakehouse Delta" \
  --uri "trino://trino@trino:8080/delta" \
  2>/dev/null && echo "  Trino connection added" || echo "  Connection may already exist"

echo ""
echo "═══════════════════════════════════════════"
echo "  Superset ready!"
echo ""
echo "  URL:      http://localhost:8088"
echo "  Username: admin"
echo "  Password: admin123"
echo ""
echo "  Trino connection: trino://trino@trino:8080/delta"
echo "═══════════════════════════════════════════"
echo ""
echo "  Next: Open Superset UI and create datasets/charts"
echo "  See: scripts/superset-dashboards.sql for queries"
echo ""

