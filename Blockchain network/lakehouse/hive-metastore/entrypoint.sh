#!/bin/bash
set -euo pipefail

export HIVE_CONF_DIR=/opt/hive-metastore/conf
export HADOOP_CONF_DIR=/opt/hive-metastore/conf

echo "Starting Hive Metastore"

until nc -z "${METASTORE_DB_HOST}" "${METASTORE_DB_PORT}"; do
  sleep 2
done

echo "Postgres ready"

envsubst < /opt/hive-metastore/conf/metastore-site.xml.template \
  > /opt/hive-metastore/conf/metastore-site.xml

SCHEMA_URL="jdbc:postgresql://${METASTORE_DB_HOST}:${METASTORE_DB_PORT}/${METASTORE_DB_NAME}"
SCHEMA_TOOL="/opt/hive-metastore/bin/schematool"

export HADOOP_CLASSPATH=$HIVE_HOME/lib/*:$HADOOP_CLASSPATH

$SCHEMA_TOOL -dbType postgres \
  -url "${SCHEMA_URL}" \
  -userName "${METASTORE_DB_USER}" \
  -passWord "${METASTORE_DB_PASSWORD}" \
  -info || \
$SCHEMA_TOOL -dbType postgres \
  -url "${SCHEMA_URL}" \
  -userName "${METASTORE_DB_USER}" \
  -passWord "${METASTORE_DB_PASSWORD}" \
  -initSchema -verbose

exec /opt/hive-metastore/bin/start-metastore
