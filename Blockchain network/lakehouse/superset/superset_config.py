# ═══════════════════════════════════════════════════════════════
# Superset Configuration — V2
# Kết nối Trino cho BI Dashboard + Embedded Support
# ═══════════════════════════════════════════════════════════════

import os

# ── Security ──
SECRET_KEY = os.environ.get('SUPERSET_SECRET_KEY', 'lakehouse-secret-key-change-me')

# ── Database (Superset metadata) ──
SQLALCHEMY_DATABASE_URI = 'sqlite:////app/superset_home/superset.db'

# ── CSRF + iframe ──
WTF_CSRF_ENABLED = False
TALISMAN_ENABLED = False
HTTP_HEADERS = {
    'X-Frame-Options': 'ALLOWALL'
}

# ── CORS (cho React app gọi embedded API) ──
ENABLE_CORS = True
CORS_OPTIONS = {
    'supports_credentials': True,
    'allow_headers': ['*'],
    'resources': ['*'],
    'origins': ['*'],
}

# ── Guest Token (embedded dashboards in React) ──
GUEST_ROLE_NAME = 'Public'
GUEST_TOKEN_JWT_SECRET = SECRET_KEY
GUEST_TOKEN_JWT_ALGO = 'HS256'
GUEST_TOKEN_HEADER_NAME = 'X-GuestToken'

# ── Feature Flags ──
FEATURE_FLAGS = {
    'EMBEDDED_SUPERSET': True,
    'ENABLE_TEMPLATE_PROCESSING': True,
    'DASHBOARD_RBAC': True,
    'DASHBOARD_CROSS_FILTERS': True,
    'ENABLE_EXPLORE_DRAG_AND_DROP': True,
}

# ── Trino connection (auto-registered via setup script) ──
# URI: trino://trino@trino:8080/delta
# Schemas: gold, silver

# ── Row Level Security (RLS) example ──
# In Superset UI → Security → Row Level Security:
# Table: fact_orders
# Clause: seller_company_id = '{{ current_username() }}'
# Role: Seller
# This ensures sellers only see their own data

# ── Superset Webserver ──
SUPERSET_WEBSERVER_PORT = 8088
SUPERSET_WEBSERVER_TIMEOUT = 120

