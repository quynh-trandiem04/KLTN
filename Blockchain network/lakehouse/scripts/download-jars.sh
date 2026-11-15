#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Download required JARs for Spark + Delta Lake + S3A
# Chạy script này trước khi docker compose up
# ═══════════════════════════════════════════════════════════════

set -e

JARS_DIR="$(dirname "$0")/../spark/jars"
mkdir -p "$JARS_DIR"

echo "═══════════════════════════════════════════"
echo " Downloading Lakehouse JARs..."
echo "═══════════════════════════════════════════"

# Delta Lake 3.1.0 (compatible with Spark 3.5)
echo "  [1/4] delta-spark_2.12-3.1.0.jar"
curl -fsSL -o "$JARS_DIR/delta-spark_2.12-3.1.0.jar" \
  "https://repo1.maven.org/maven2/io/delta/delta-spark_2.12/3.1.0/delta-spark_2.12-3.1.0.jar"

echo "  [2/4] delta-storage-3.1.0.jar"
curl -fsSL -o "$JARS_DIR/delta-storage-3.1.0.jar" \
  "https://repo1.maven.org/maven2/io/delta/delta-storage/3.1.0/delta-storage-3.1.0.jar"

# Hadoop AWS 3.3.6 (must match Spark's Hadoop version)
echo "  [3/4] hadoop-aws-3.3.6.jar"
curl -fsSL -o "$JARS_DIR/hadoop-aws-3.3.6.jar" \
  "https://repo1.maven.org/maven2/org/apache/hadoop/hadoop-aws/3.3.6/hadoop-aws-3.3.6.jar"

# AWS SDK Bundle
echo "  [4/4] aws-java-sdk-bundle-1.12.367.jar"
curl -fsSL -o "$JARS_DIR/aws-java-sdk-bundle-1.12.367.jar" \
  "https://repo1.maven.org/maven2/com/amazonaws/aws-java-sdk-bundle/1.12.367/aws-java-sdk-bundle-1.12.367.jar"

echo ""
echo "═══════════════════════════════════════════"
echo " ✅ All JARs downloaded to $JARS_DIR"
echo "═══════════════════════════════════════════"
ls -lh "$JARS_DIR"
