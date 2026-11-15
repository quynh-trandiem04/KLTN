FROM apache/superset:3.1.0

# Chuyển sang root để cài đặt package
USER root

# Cài đặt thư viện kết nối Trino cho SQLAlchemy
RUN pip install --no-cache-dir trino[sqlalchemy]

# Quay lại user mặc định của Superset
USER superset

