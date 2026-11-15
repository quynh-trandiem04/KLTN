FROM apache/spark:3.5.1

# Chuyển sang quyền root để cài đặt pip package và tải file
USER root

# Cài đặt thư viện delta-spark cho Python
RUN pip3 install --no-cache-dir delta-spark==3.1.0

# Tải các JAR cần thiết cho Spark 3.5.1 (chạy Hadoop 3.3.4) thẳng vào /opt/spark/jars
RUN curl -O https://repo1.maven.org/maven2/org/apache/hadoop/hadoop-aws/3.3.4/hadoop-aws-3.3.4.jar \
    && curl -O https://repo1.maven.org/maven2/com/amazonaws/aws-java-sdk-bundle/1.12.262/aws-java-sdk-bundle-1.12.262.jar \
    && curl -O https://repo1.maven.org/maven2/io/delta/delta-spark_2.12/3.1.0/delta-spark_2.12-3.1.0.jar \
    && curl -O https://repo1.maven.org/maven2/io/delta/delta-storage/3.1.0/delta-storage-3.1.0.jar \
    && mv *.jar /opt/spark/jars/

# Quay lại user mặc định của Spark
USER spark

