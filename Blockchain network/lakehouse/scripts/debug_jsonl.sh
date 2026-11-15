#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Debug: Xem 1 file JSONL mẫu từ MinIO
# Giúp hiểu cấu trúc dữ liệu thực tế
# ═══════════════════════════════════════════════════════════════

echo "═══ JSONL Sample from MinIO ═══"
echo ""

# Tìm 1 file JSONL
SAMPLE=$(docker compose exec -T spark bash -c "
  export HADOOP_CONF_DIR=/opt/spark/conf
  /opt/hadoop/bin/hdfs dfs \
    -Dfs.s3a.endpoint=http://minio-lakehouse:9000 \
    -Dfs.s3a.access.key=admin \
    -Dfs.s3a.secret.key=password123 \
    -Dfs.s3a.path.style.access=true \
    -Dfs.s3a.impl=org.apache.hadoop.fs.s3a.S3AFileSystem \
    -ls -R s3a://ecommerce-lakehouse/structured/ 2>/dev/null | grep '.jsonl' | head -1 | awk '{print \$NF}'
")

if [ -z "$SAMPLE" ]; then
  echo "  No JSONL files found. Trying mc approach..."
  # Alternative: use MinIO mc client if available
  docker run --rm --network=fabric_ecommerce_network \
    minio/mc:latest sh -c "
      mc alias set myminio http://minio-lakehouse:9000 admin password123 2>/dev/null
      FIRST=\$(mc ls --recursive myminio/ecommerce-lakehouse/structured/ 2>/dev/null | head -1 | awk '{print \$NF}')
      mc cat myminio/ecommerce-lakehouse/structured/\$FIRST 2>/dev/null | head -2 | python3 -m json.tool
    "
else
  echo "  File: $SAMPLE"
  docker compose exec -T spark bash -c "
    /opt/hadoop/bin/hdfs dfs \
      -Dfs.s3a.endpoint=http://minio-lakehouse:9000 \
      -Dfs.s3a.access.key=admin \
      -Dfs.s3a.secret.key=password123 \
      -Dfs.s3a.path.style.access=true \
      -Dfs.s3a.impl=org.apache.hadoop.fs.s3a.S3AFileSystem \
      -cat $SAMPLE 2>/dev/null | head -2
  " | python3 -m json.tool 2>/dev/null || echo "  (raw output above)"
fi

