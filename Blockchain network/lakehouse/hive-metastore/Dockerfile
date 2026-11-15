# ═══════════════════════════════════════════════════════════════
# Hive Metastore Standalone — Stable Build (3.1.3)
# ═══════════════════════════════════════════════════════════════

FROM eclipse-temurin:11-jre-jammy

ENV HADOOP_VERSION=3.3.6
ENV HIVE_VERSION=3.1.3

# ── System deps ──
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl netcat-openbsd procps postgresql-client gettext \
    && rm -rf /var/lib/apt/lists/*
    
# ── Hadoop ──
COPY hadoop-3.3.6.tar.gz /tmp/

RUN tar -xzf /tmp/hadoop-3.3.6.tar.gz -C /opt && \
    mv /opt/hadoop-3.3.6 /opt/hadoop && \
    rm /tmp/hadoop-3.3.6.tar.gz

ENV HADOOP_HOME=/opt/hadoop
ENV HADOOP_CLASSPATH=${HADOOP_HOME}/share/hadoop/tools/lib/*

# ── Hive Metastore ──
COPY hive-standalone-metastore-3.1.3-bin.tar.gz /tmp/

RUN tar -xzf /tmp/hive-standalone-metastore-3.1.3-bin.tar.gz -C /opt && \
    mv /opt/apache-hive-metastore-3.1.3-bin /opt/hive-metastore && \
    rm /tmp/hive-standalone-metastore-3.1.3-bin.tar.gz

ENV HIVE_HOME=/opt/hive-metastore
ENV PATH=$HIVE_HOME/bin:$PATH

# ── JDBC ──
RUN curl -fsSL https://jdbc.postgresql.org/download/postgresql-42.7.1.jar \
    -o ${HIVE_HOME}/lib/postgresql.jar

# ── AWS + Hive libs ──
RUN cp ${HADOOP_HOME}/share/hadoop/tools/lib/hadoop-aws-${HADOOP_VERSION}.jar ${HIVE_HOME}/lib/ && \
    cp ${HADOOP_HOME}/share/hadoop/tools/lib/aws-java-sdk-bundle-*.jar ${HIVE_HOME}/lib/

# ── Fix guava conflict ──
RUN rm -f ${HIVE_HOME}/lib/guava-*.jar && \
    cp ${HADOOP_HOME}/share/hadoop/common/lib/guava-*.jar ${HIVE_HOME}/lib/

# ── Config (CHỈ TEMPLATE) ──
COPY conf/metastore-site.xml.template \
     /opt/hive-metastore/conf/metastore-site.xml.template

# ── Entrypoint ──
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 9083

ENTRYPOINT ["/entrypoint.sh"]

