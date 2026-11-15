# 🔐 Security Setup Guide

This document explains how to configure environment variables instead of using hardcoded secrets in the KLTN project.

## ⚠️ Important

**Never commit `.env` files to git.** They are listed in `.gitignore`. Only `.env.example` files (with placeholder values) are committed.

---

## Quick Start

### 1. Root project

```bash
cp .env.example .env
# Edit .env and replace placeholder values with real secrets
```

### 2. Lakehouse stack

```bash
cp "Blockchain network/lakehouse/.env.example" "Blockchain network/lakehouse/.env"
# Edit the file with real values
```

---

## Required Environment Variables

### MinIO (S3-compatible Object Storage)

| Variable | Description | Used in |
|---|---|---|
| `MINIO_ACCESS_KEY` | MinIO access key (username) | spark-defaults.conf, delta.properties, debug_jsonl.sh |
| `MINIO_SECRET_KEY` | MinIO secret key (password) | spark-defaults.conf, delta.properties, debug_jsonl.sh |

### Apache Superset

| Variable | Description | Used in |
|---|---|---|
| `SUPERSET_SECRET_KEY` | Flask secret key for session encryption | docker-compose.yml |
| `SUPERSET_ADMIN_PASSWORD` | Superset web UI admin password | setup-superset.sh |

### CouchDB (Hyperledger Fabric)

| Variable | Description | Used in |
|---|---|---|
| `COUCHDB_PASSWORD` | CouchDB admin password | compose-couch.yaml |

---

## Generating Strong Secrets

```bash
# Generate a random 32-byte hex secret key (Linux/macOS)
openssl rand -hex 32

# Or using Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## Notes on `spark-defaults.conf` and `trino/catalog/delta.properties`

These files use `${VAR}` syntax for variable substitution. Spark reads them from the container environment. Make sure the variables are set in the Docker Compose service or passed via `--env-file` when starting the stack.

```bash
# Start lakehouse with env file
cd "Blockchain network/lakehouse"
docker compose --env-file .env up -d
```

---

## Files Changed

| File | Change |
|---|---|
| `Blockchain network/lakehouse/docker-compose.yml` | `SUPERSET_SECRET_KEY` → env var |
| `Blockchain network/lakehouse/spark/conf/spark-defaults.conf` | MinIO credentials → env vars |
| `Blockchain network/lakehouse/trino/catalog/delta.properties` | MinIO credentials → env vars |
| `Blockchain network/lakehouse/scripts/debug_jsonl.sh` | MinIO credentials → env vars with defaults |
| `Blockchain network/lakehouse/scripts/setup-superset.sh` | Superset password → env var with default |
| `Blockchain network/my-ecommerce-network/compose/compose-couch.yaml` | CouchDB password → env var with default |
