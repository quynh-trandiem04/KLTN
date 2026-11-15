# KIẾN TRÚC DATA LAKEHOUSE

## 1. Tổng quan

Hệ thống Data Lakehouse được xây dựng theo mô hình **Medallion Architecture** (Bronze → Silver → Gold), kết hợp cùng bộ công cụ mã nguồn mở để thu thập, xử lý, lưu trữ và phân tích dữ liệu giao dịch từ mạng Blockchain Hyperledger Fabric.

### 1.1. Mục tiêu

- Thu thập **toàn bộ** sự kiện giao dịch từ Blockchain (bao gồm cả dữ liệu riêng tư — Private Data Collections).
- Biến đổi dữ liệu thô thành dạng có cấu trúc, đảm bảo chất lượng qua hệ thống **Quality Gates**.
- Xây dựng kho dữ liệu phân tích dạng **Star Schema** phục vụ Dashboard BI cho Admin, Seller, Shipper, và cơ quan Thuế.
- Phát hiện bất thường tự động (Anomaly Detection) trong luồng ETL.

### 1.2. Công nghệ sử dụng

| Thành phần | Công nghệ | Phiên bản | Vai trò |
|---|---|---|---|
| Object Storage | MinIO | RELEASE.2024 | Lưu trữ dữ liệu thô (tương thích S3) |
| Compute Engine | Apache Spark | 3.5.1 | Xử lý ETL phân tán |
| Table Format | Delta Lake | 3.1.0 | ACID transactions, time travel, schema evolution |
| Schema Registry | Hive Metastore | 3.1.3 | Quản lý metadata cho Trino |
| SQL Engine | Trino | 438 | Query engine (Federated SQL) |
| BI Dashboard | Apache Superset | latest | Trực quan hóa dữ liệu |
| Metastore DB | PostgreSQL | 15 | Lưu schema của Hive Metastore |

### 1.3. Hạ tầng Docker

Toàn bộ Lakehouse chạy trên **7 container** Docker, kết nối chung mạng `fabric_ecommerce_network` với Blockchain:

| # | Container | Image | Ports |
|---|-----------|-------|-------|
| 1 | `lakehouse-metastore-db` | postgres:15-alpine | — (internal) |
| 2 | `lakehouse-hive-metastore` | Custom build | 9083 (Thrift) |
| 3 | `lakehouse-spark` (Master) | Custom build | 7077, 8081, 4040 |
| 4 | `lakehouse-spark-worker` | Custom build | — |
| 5 | `lakehouse-trino` | trinodb/trino:438 | 8090 |
| 6 | `lakehouse-superset` | Custom build | 8088 |
| 7 | `minio-lakehouse` | minio/minio | 9000, 9001 |

---

## 2. Lớp Thu thập Dữ liệu (Data Ingestion)

### 2.1. Block Listener (`blockListener.js`)

Block Listener là dịch vụ Node.js chạy liên tục, lắng nghe **Block Events** từ mạng Hyperledger Fabric theo thời gian thực.

**Quy trình xử lý mỗi Block mới:**

| Bước | Hành động | Kết quả |
|------|-----------|---------|
| 1 | Lưu bản sao nguyên gốc (Raw Backup) | `raw/blocks/block_{N}.json` |
| 2 | Parse giao dịch (Structured Events) | Trích xuất `function_name`, `args`, `creator_msp`, `is_valid` |
| 3 | Enrichment — gọi `QueryOrder` | Lấy thêm `order_data` (Public State) + `private_data` (PDC) |
| 4 | Lưu file JSONL phân vùng theo ngày | `structured/YYYY/MM/DD/events_block_{N}.jsonl` |
| 5 | Lưu riêng Private Data snapshot | `private/{orderID}/block_{N}_{function}.json` |
| 6 | Lưu Block Metadata | `metadata/block_{N}.json` |

**Các hàm Chaincode được Enrichment:**

```
CreateOrder, ConfirmPayment, CancelOrder, ShipOrder,
ConfirmDelivery, ConfirmCODDelivery, RemitCOD,
PayoutToSeller, RequestReturn, ShipReturn, ConfirmReturnReceived
```

### 2.2. Backfill Script (`backfillBlocks.js`)

Dùng để quét lại toàn bộ Blockchain từ Block 0 (hoặc từ một block chỉ định) trong trường hợp:
- Khởi tạo Lakehouse lần đầu
- Khôi phục dữ liệu sau sự cố

### 2.3. Cấu trúc lưu trữ trên MinIO

```
ecommerce-lakehouse/
├── raw/blocks/                         ← Block gốc (JSON)
├── structured/YYYY/MM/DD/              ← Events đã parse (JSONL)
├── private/{orderID}/                  ← Private Data snapshots
├── metadata/                           ← Block summaries
└── delta/
    ├── silver/                         ← Delta tables (Silver layer)
    └── gold/                           ← Delta tables (Gold layer)
```

---

## 3. Lớp Bronze (Dữ liệu thô)

### 3.1. Định nghĩa

Lớp Bronze chính là **các file JSONL** được lưu trong thư mục `structured/` trên MinIO. Đây là dữ liệu đã được parse từ Block Events nhưng **chưa qua bất kỳ bước làm sạch hay biến đổi nào**.

### 3.2. Schema của mỗi Event

Mỗi dòng trong file JSONL chứa một sự kiện giao dịch với cấu trúc:

| Nhóm | Trường | Kiểu | Mô tả |
|------|--------|------|-------|
| **Block Info** | `block_number` | long | Số thứ tự block |
| | `tx_index` | int | Vị trí TX trong block |
| | `tx_id` | string | Transaction ID (SHA-256) |
| | `timestamp` | string | Thời gian block (ISO 8601) |
| **Chain Info** | `channel_id` | string | Tên channel (`orderchannel`) |
| | `chaincode_id` | string | Tên chaincode (`ecommerce`) |
| | `function_name` | string | Hàm được gọi (`CreateOrder`, `ShipOrder`,...) |
| | `args` | array[string] | Tham số đầu vào |
| **Creator** | `creator_msp` | string | Tổ chức tạo TX (`ECommercePlatformOrgMSP`) |
| | `creator_cn` | string | Common Name của chứng chỉ |
| **Endorsement** | `endorsers` | array[string] | Danh sách endorser |
| | `endorser_count` | int | Số lượng endorser |
| **Validation** | `validation_code` | string | Mã xác thực |
| | `is_valid` | boolean | Giao dịch hợp lệ? |
| **Order Data** | `order_data.order_id` | string | Mã đơn hàng |
| | `order_data.status` | string | Trạng thái đơn |
| | `order_data.payment_method` | string | `PREPAID` / `COD` |
| | `order_data.seller_company_id` | string | Mã công ty bán hàng |
| | `order_data.shipper_company_id` | string | Mã công ty vận chuyển |
| | `order_data.vat_rate` | decimal | Thuế suất VAT |
| | `order_data.created_at` ... `settled_at` | string | Các mốc thời gian vòng đời |
| **Private Data** | `private_data.seller_data` | object | Dữ liệu tài chính Seller (PDC) |
| | `private_data.shipper_data` | object | Dữ liệu vận chuyển Shipper (PDC) |
| | `private_data.tax_data` | object | Dữ liệu thuế Tax (PDC) |
| | `private_data.data_verified` | boolean | Hash PDC khớp với Public State? |

---

## 4. Lớp Silver (Dữ liệu đã làm sạch)

### 4.1. Pipeline: `bronze_to_silver.py`

Script PySpark thực hiện 3 giai đoạn chính:

#### Giai đoạn 1: Transform (Biến đổi)

- Đọc toàn bộ file JSONL từ MinIO (lần đầu) hoặc chỉ đọc file mới (incremental, dựa trên `block_number` cao nhất đã xử lý).
- Trích xuất, làm phẳng (flatten) các trường lồng nhau từ `order_data` và `private_data`.
- Chuyển đổi kiểu dữ liệu: `string → timestamp`, `long → decimal(18,2)`.
- Tính các trường phái sinh: `item_count`, `has_seller_data`, `has_shipper_data`, `has_tax_data`.

#### Giai đoạn 2: Quality Gates (Kiểm tra chất lượng)

Hệ thống áp dụng **7 quy tắc kiểm tra chất lượng** theo 2 mức độ nghiêm trọng:

| # | Tên quy tắc | Mức độ | Điều kiện kiểm tra |
|---|-------------|--------|-------------------|
| 1 | `order_id_not_null` | CRITICAL | `order_id` phải tồn tại |
| 2 | `valid_order_status` | CRITICAL | `order_status` thuộc danh sách hợp lệ (CREATED, PAID, SHIPPED, DELIVERED, SETTLED, CANCELLED,...) |
| 3 | `seller_exists` | CRITICAL | `seller_company_id` không được rỗng |
| 4 | `positive_amount` | CRITICAL | `seller_total_amount >= 0` |
| 5 | `amount_not_null` | WARNING | `seller_total_amount` không được NULL |
| 6 | `timestamp_consistency` | WARNING | `order_created_at <= order_updated_at` |
| 7 | `block_number_valid` | CRITICAL | `block_number > 0` |

**Cơ chế xử lý:**
- Dữ liệu vi phạm quy tắc **CRITICAL** → đưa vào bảng `quarantine` (Dead Letter Queue), **không** ghi vào Silver.
- Dữ liệu vi phạm quy tắc **WARNING** → vẫn ghi vào Silver nhưng được đánh dấu (flag).
- Mỗi bản ghi bị quarantine được gắn thêm: `quarantine_reason`, `quarantine_severity`, `quarantine_description`, `quarantined_at`.

#### Giai đoạn 3: Write (Ghi kết quả)

Dữ liệu sạch được ghi vào 2 bảng Delta chính:
- **`tbl_order_events`**: Append-only — lưu toàn bộ sự kiện (event sourcing).
- **`tbl_orders_snapshot`**: MERGE (upsert) — mỗi `order_id` chỉ giữ bản ghi mới nhất (theo `block_number` cao nhất).

### 4.2. Các bảng Silver

| Bảng | Mô tả | Chiến lược ghi |
|------|-------|----------------|
| `tbl_order_events` | Toàn bộ sự kiện giao dịch (append-only, event log) | Append |
| `tbl_orders_snapshot` | Trạng thái mới nhất của mỗi đơn hàng | MERGE (upsert by `order_id`) |
| `quarantine` | Dữ liệu bị loại bỏ bởi Quality Gates | Append |
| `pipeline_metrics` | Thống kê mỗi lần chạy pipeline (số dòng, tỷ lệ sạch, thời gian,...) | Append |
| `audit_lineage` | Metadata kiểm toán (run_id, batch_id, events_count, clean_rate) | Append |

### 4.3. Incremental Processing

Pipeline hỗ trợ xử lý gia tăng (incremental):
- Trước khi đọc dữ liệu từ MinIO, hệ thống kiểm tra `max(block_number)` đã xử lý trong `tbl_order_events`.
- Chỉ đọc và xử lý các file JSONL chứa block mới hơn.
- Lần chạy đầu tiên sẽ xử lý toàn bộ (full load).

---

## 5. Lớp Gold (Kho dữ liệu phân tích — Star Schema)

### 5.1. Pipeline: `silver_to_gold.py`

Script PySpark đọc dữ liệu từ Silver (`tbl_orders_snapshot`) và tạo ra mô hình **Star Schema** gồm 3 bảng Dimension + 4 bảng Fact + 1 bảng Anomaly.

### 5.2. Bảng Dimension

#### 5.2.1. `dim_time` — Dimension Thời gian

Bảng lịch sinh sẵn từ 01/01/2024 đến 31/12/2027 (1.461 dòng).

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `date_key` (PK) | int | Khóa chính dạng YYYYMMDD (VD: 20260601) |
| `full_date` | date | Ngày đầy đủ |
| `year` | int | Năm |
| `quarter` | int | Quý (1-4) |
| `month` | int | Tháng (1-12) |
| `month_name` | string | Tên tháng (January,...) |
| `week_of_year` | int | Tuần trong năm |
| `day_of_month` | int | Ngày trong tháng |
| `day_of_week` | int | Thứ trong tuần (1=Thứ 2) |
| `day_name` | string | Tên thứ (Monday,...) |
| `is_weekday` | int | Ngày làm việc? (1/0) |
| `year_month` | string | Năm-Tháng (VD: 2026-06) |

#### 5.2.2. `dim_seller` — Dimension Nhà bán hàng (SCD Type 1)

Bảng `dim_seller` hiện tại **không có thuộc tính danh mục thay đổi chậm** (slowly changing attribute) — `seller_tax_code` được gán cố định từ lúc đăng ký và không thay đổi trong vòng đời hệ thống. Do đó chỉ áp dụng **SCD Type 1** — toàn bộ chỉ số thống kê được cập nhật đè trực tiếp lên dòng hiện tại mà không tạo phiên bản mới.

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `seller_sk` (PK) | string | Surrogate Key |
| `seller_company_id` | string | Mã công ty bán hàng (Business Key) |
| `seller_tax_code` | string | Mã số thuế (cố định, không thay đổi) |
| `total_orders` | bigint | Tổng số đơn hàng |
| `total_revenue` | decimal | Tổng doanh thu |
| `total_vat` | decimal | Tổng thuế VAT |
| `total_net_income` | decimal | Tổng thu nhập ròng |
| `total_platform_discount` | decimal | Tổng chiết khấu sàn |
| `avg_order_value` | decimal | Giá trị đơn hàng trung bình |
| `cancelled_count` | bigint | Số đơn bị hủy |
| `return_count` | bigint | Số đơn bị hoàn |
| `settled_count` | bigint | Số đơn đã đối soát |
| `first_order_at` | timestamp | Đơn hàng đầu tiên |
| `last_order_at` | timestamp | Đơn hàng gần nhất |
| `etl_updated_at` | timestamp | Thời điểm ETL cập nhật |

#### 5.2.3. `dim_shipper` — Dimension Đơn vị vận chuyển (SCD Type 1)

Bảng `dim_shipper` hiện tại **không có thuộc tính danh mục thay đổi chậm** (slowly changing attribute) nên chỉ áp dụng **SCD Type 1** — toàn bộ chỉ số thống kê được cập nhật đè trực tiếp lên dòng hiện tại mà không tạo phiên bản mới.

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `shipper_sk` (PK) | string | Surrogate Key |
| `shipper_company_id` | string | Mã công ty vận chuyển (Business Key) |
| `total_orders` | bigint | Tổng số đơn |
| `total_shipping_revenue` | decimal | Tổng doanh thu vận chuyển |
| `total_cod_collected` | decimal | Tổng COD đã thu |
| `avg_shipping_fee` | decimal | Phí ship trung bình |
| `delivered_count` | bigint | Số đơn giao thành công |
| `cancelled_count` | bigint | Số đơn bị hủy |
| `return_count` | bigint | Số đơn bị hoàn |
| `first_order_at` | timestamp | Đơn hàng đầu tiên |
| `last_order_at` | timestamp | Đơn hàng gần nhất |
| `etl_updated_at` | timestamp | Thời điểm ETL cập nhật |

### 5.3. Bảng Fact

#### 5.3.1. `fact_orders` — Bảng Fact chính (Đơn hàng)

Bảng fact trung tâm, phục vụ Dashboard Admin và Seller. Mỗi dòng là một đơn hàng.

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `order_id` (PK) | string | Mã đơn hàng |
| `date_key` (FK → dim_time) | int | Khóa thời gian |
| `year_month` | string | Partition key (VD: 2026-05) |
| `order_status` | string | Trạng thái hiện tại |
| `payment_method` | string | PREPAID / COD |
| `cod_status` | string | Trạng thái COD |
| `seller_company_id` (FK → dim_seller) | string | Mã nhà bán hàng |
| `shipper_company_id` (FK → dim_shipper) | string | Mã đơn vị vận chuyển |
| `seller_total_amount` | decimal | Tổng tiền hàng |
| `seller_final_price` | decimal | Giá sau chiết khấu |
| `seller_vat_amount` | decimal | Thuế VAT |
| `seller_net_income` | decimal | Thu nhập ròng seller |
| `shipping_fee` | decimal | Phí vận chuyển |
| `cod_amount` | decimal | Số tiền COD |
| `platform_discount` | decimal | Chiết khấu sàn |
| `item_count` | int | Số lượng sản phẩm |
| `customer_id` | string | Mã khách hàng |
| `vat_rate` | float | Thuế suất VAT |
| `order_created_at` | timestamp | Thời điểm tạo đơn |
| `paid_at` | timestamp | Thời điểm thanh toán |
| `shipped_at` | timestamp | Thời điểm giao cho shipper |
| `delivery_timestamp` | timestamp | Thời điểm giao hàng thành công |
| `settled_at` | timestamp | Thời điểm đối soát |
| `cancelled_at` | timestamp | Thời điểm hủy |
| `return_requested_at` | timestamp | Thời điểm yêu cầu hoàn |
| `return_completed_at` | timestamp | Thời điểm hoàn thành hoàn |
| `processing_hours` | float | Thời gian xử lý (giờ): created → shipped |
| `delivery_hours` | float | Thời gian giao hàng (giờ): shipped → delivered |
| `total_lifecycle_hours` | float | Vòng đời đơn (giờ): created → settled |
| `is_prepaid` | boolean | Thanh toán trước? |
| `is_cod` | boolean | Thanh toán COD? |
| `is_cancelled` | boolean | Đã hủy? |
| `is_returned` | boolean | Đã hoàn? |
| `is_delivered` | boolean | Đã giao? |
| `is_settled` | boolean | Đã đối soát? |
| `history_count` | int | Số bước trong lịch sử giao dịch |
| `last_action` | string | Hành động cuối cùng trên Blockchain |
| `etl_updated_at` | timestamp | Thời điểm ETL cập nhật |

**Partition:** theo `year_month` để tối ưu hiệu năng truy vấn theo tháng.

#### 5.3.2. `fact_delivery` — Bảng Fact Giao hàng

Phục vụ Dashboard Shipper — theo dõi hiệu suất giao hàng, COD. Chỉ chứa đơn hàng đã giao (`shipped_at IS NOT NULL`).

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `order_id` (PK) | string | Mã đơn hàng |
| `date_key` (FK) | int | Khóa thời gian (ngày ship) |
| `year_month` | string | Partition key |
| `shipper_company_id` (FK) | string | Mã đơn vị vận chuyển |
| `seller_company_id` (FK) | string | Mã nhà bán hàng |
| `order_status` | string | Trạng thái đơn |
| `payment_method` | string | PREPAID / COD |
| `shipping_fee` | decimal | Phí vận chuyển |
| `cod_amount` | decimal | Số tiền COD |
| `cod_collected` | decimal | COD đã thu (chỉ khi REMITTED) |
| `is_cod` | boolean | Đơn COD? |
| `delivery_hours` | float | Thời gian giao (giờ) |
| `is_delivered` | boolean | Giao thành công? |
| `is_returned` | boolean | Bị hoàn? |
| `shipping_address` | string | Địa chỉ giao hàng |
| `shipped_at` | timestamp | Thời điểm bắt đầu giao |
| `delivery_timestamp` | timestamp | Thời điểm giao thành công |
| `etl_updated_at` | timestamp | Thời điểm ETL cập nhật |

#### 5.3.3. `fact_tax` — Bảng Fact Thuế

Phục vụ Dashboard cơ quan Thuế — thuế GTGT tự động tính bởi hệ thống. Chỉ chứa đơn hàng đã đối soát (`has_tax_data = true`).

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `order_id` (PK) | string | Mã đơn hàng |
| `date_key` (FK) | int | Khóa thời gian (ngày đối soát) |
| `year_month` | string | Partition key |
| `seller_company_id` (FK) | string | Mã nhà bán hàng |
| `seller_tax_code` | string | Mã số thuế (từ Seller PDC) |
| `tax_seller_code` | string | Mã số thuế (từ Tax PDC) |
| `taxable_revenue` | decimal | Doanh thu chịu thuế (VNĐ) |
| `tax_vat_amount` | decimal | Thuế GTGT phải nộp |
| `vat_rate` | float | Thuế suất VAT (từ On-chain Config) |
| `effective_vat_rate` | float | Thuế suất thực tế = `vat_amount / taxable_revenue * 100` |
| `seller_total_amount` | decimal | Tổng tiền đơn hàng |
| `seller_net_income` | decimal | Thu nhập ròng seller |
| `platform_discount` | decimal | Chiết khấu sàn |
| `payment_method` | string | PREPAID / COD |
| `order_status` | string | Trạng thái đơn |
| `order_created_at` | timestamp | Thời điểm tạo đơn |
| `settled_at` | timestamp | Thời điểm đối soát |
| `transaction_date` | timestamp | Ngày phát sinh doanh thu |
| `etl_updated_at` | timestamp | Thời điểm ETL cập nhật |

#### 5.3.4. `fact_customer_behavior` — Bảng Fact Hành vi Khách hàng

Phân tích RFM (Recency - Frequency - Monetary) và phân nhóm khách hàng.

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `customer_id` (PK) | string | Mã khách hàng |
| `total_orders` | bigint | Tổng số đơn hàng |
| `total_spent` | decimal | Tổng chi tiêu |
| `avg_order_value` | decimal | Giá trị đơn trung bình |
| `max_order_value` | decimal | Đơn hàng lớn nhất |
| `min_order_value` | decimal | Đơn hàng nhỏ nhất |
| `unique_sellers` | bigint | Số seller đã mua |
| `unique_shippers` | bigint | Số shipper đã dùng |
| `payment_methods_used` | bigint | Số phương thức thanh toán |
| `cod_orders` | bigint | Số đơn COD |
| `prepaid_orders` | bigint | Số đơn trả trước |
| `cancel_count` | bigint | Số đơn hủy |
| `return_count` | bigint | Số đơn hoàn |
| `settled_count` | bigint | Số đơn đã đối soát |
| `delivered_count` | bigint | Số đơn đã giao |
| `first_order_at` | timestamp | Đơn hàng đầu tiên |
| `last_order_at` | timestamp | Đơn hàng gần nhất |
| `total_vat_paid` | decimal | Tổng VAT đã trả |
| `total_shipping_paid` | decimal | Tổng phí ship |
| `total_discounts_received` | decimal | Tổng chiết khấu nhận được |
| `total_items_purchased` | bigint | Tổng sản phẩm đã mua |
| `cancel_rate` | float | Tỷ lệ hủy (%) |
| `return_rate` | float | Tỷ lệ hoàn (%) |
| `preferred_payment` | string | Phương thức ưa thích (COD/PREPAID) |
| `customer_lifetime_days` | int | Số ngày từ đơn đầu → đơn cuối |
| `customer_segment` | string | Phân nhóm (PREMIUM / REGULAR / ACTIVE / NEW) |
| `risk_flag` | string | Cờ rủi ro (HIGH_CANCEL / HIGH_RETURN / NORMAL) |
| `etl_updated_at` | timestamp | Thời điểm ETL cập nhật |

**Quy tắc phân nhóm:**

| Phân nhóm | Điều kiện |
|-----------|-----------|
| PREMIUM | Tổng chi tiêu > 5.000.000 VNĐ |
| REGULAR | Tổng chi tiêu > 1.000.000 VNĐ |
| ACTIVE | Tổng chi tiêu > 200.000 VNĐ |
| NEW | Còn lại |

**Quy tắc cờ rủi ro:**

| Cờ | Điều kiện |
|----|-----------|
| HIGH_CANCEL | Tỷ lệ hủy > 50% |
| HIGH_RETURN | Tỷ lệ hoàn > 30% |
| NORMAL | Còn lại |

### 5.4. Bảng `anomaly_alerts` — Cảnh báo bất thường

Hệ thống tự động phát hiện bất thường bằng cách so sánh lần chạy pipeline hiện tại với lịch sử (cần tối thiểu 3 lần chạy):

| Loại cảnh báo | Điều kiện | Mức độ |
|---------------|-----------|--------|
| `VOLUME_SPIKE` / `VOLUME_DROP` | Số sự kiện đầu vào lệch > 2σ so với trung bình | WARNING |
| `QUALITY_DROP` | Tỷ lệ sạch giảm > 5% so với trung bình (< 90% → CRITICAL) | WARNING / CRITICAL |
| `DURATION_SPIKE` | Thời gian chạy > 3σ so với trung bình | WARNING |
| `HIGH_QUARANTINE_RATE` | Tỷ lệ quarantine > 5% (> 20% → CRITICAL) | WARNING / CRITICAL |

---

## 6. Lớp Truy vấn và Phân tích (Serving Layer)

### 6.1. Hive Metastore

- Đóng vai trò **Schema Registry** — lưu thông tin cấu trúc bảng (tên cột, kiểu dữ liệu, vị trí lưu trữ trên MinIO).
- Trino kết nối đến Hive Metastore để biết schema của các bảng Delta Lake.
- Backend: PostgreSQL 15.

### 6.2. Trino 438

- Đóng vai trò **SQL Engine** — cho phép truy vấn SQL chuẩn trên các bảng Delta Lake.
- Hỗ trợ query liên schema: `SELECT * FROM delta.gold.fact_orders JOIN delta.gold.dim_seller ...`
- Expose port `8090` để Superset và các ứng dụng bên ngoài kết nối.

### 6.3. Apache Superset

- Đóng vai trò **BI Dashboard** — trực quan hóa dữ liệu thành biểu đồ, bảng, dashboard tương tác.
- Kết nối đến Trino qua driver `trino://`.
- Expose port `8088`.

---

## 7. Pipeline Orchestration

### 7.1. Script `run_pipeline.sh`

Pipeline ETL được tự động hóa qua shell script, thực hiện 5 bước tuần tự:

| Bước | Hành động | Chi tiết |
|------|-----------|---------|
| 0 | Ensure Trino schemas | Tạo schema `silver` và `gold` nếu chưa tồn tại |
| 1 | Bronze → Silver | `spark-submit bronze_to_silver.py` |
| 2 | Silver → Gold | `spark-submit silver_to_gold.py` |
| 3 | Register tables | Đăng ký 13 bảng Delta vào Trino catalog |
| 4 | Validation | Kiểm tra số dòng mỗi bảng qua Trino |

### 7.2. Lập lịch chạy

```bash
# Chạy ETL hàng ngày lúc 2h sáng
0 2 * * * /home/hadoopquynhthu/lakehouse/scripts/run_pipeline.sh >> /var/log/lakehouse-etl.log 2>&1

# Bảo trì hàng tuần (Chủ nhật 3h sáng) — VACUUM, OPTIMIZE
0 3 * * 0 /home/hadoopquynhthu/lakehouse/scripts/run_maintenance.sh >> /var/log/lakehouse-maint.log 2>&1
```

---

## 8. Mối liên kết giữa các bảng (Galaxy Schema / Fact Constellation)

Tầng Gold của hệ thống Data Lakehouse được thiết kế theo mô hình **Galaxy Schema** (hoặc **Fact Constellation Schema**) thay vì một Star Schema đơn lẻ. Mô hình này bao gồm nhiều bảng Fact chia sẻ chung một số bảng Dimension (Conformed Dimensions) và có các bảng Fact tổng hợp đặc thù phục vụ phân tích.

### 8.1. Sơ đồ liên kết các bảng

```
                    ┌──────────────┐
                    │   dim_time   │
                    │  (date_key)  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
      ┌───────▼───────┐ ┌─▼──────────┐ ┌▼────────────┐
      │  fact_orders  │ │fact_delivery│ │  fact_tax   │
      │  (order_id)   │ │ (order_id) │ │ (order_id)  │
      └───┬───────┬───┘ └──┬─────────┘ └──┬──────────┘
          │       │        │               │
   ┌──────▼──┐ ┌──▼────────▼──┐   ┌───────▼────────┐
   │dim_seller│ │ dim_shipper  │   │   dim_seller    │
   │(company) │ │  (company)   │   │   (company)     │
   └─────────┘ └──────────────┘   └────────────────┘

 ┌───────────────────────────────────────────────────┐
 │             fact_customer_behavior                │
 │    (Aggregate Fact Table - Degenerate Dimension)  │
 └───────────────────────────────────────────────────┘
```

### 8.2. Khóa liên kết giữa các bảng giao dịch

| Bảng Fact (Fact Table) | Bảng Dimension liên kết | Khóa liên kết (Join Key) |
|-----------------------|-------------------------|--------------------------|
| `fact_orders` | `dim_time` | `date_key` |
| `fact_orders` | `dim_seller` | `seller_company_id` |
| `fact_orders` | `dim_shipper` | `shipper_company_id` |
| `fact_delivery` | `dim_time` | `date_key` |
| `fact_delivery` | `dim_seller` | `seller_company_id` |
| `fact_delivery` | `dim_shipper` | `shipper_company_id` |
| `fact_tax` | `dim_time` | `date_key` |
| `fact_tax` | `dim_seller` | `seller_company_id` |

> [!NOTE]
> Khi thực hiện JOIN với `dim_seller` hoặc `dim_shipper` (đây là các chiều áp dụng **SCD Type 1**), không cần lọc điều kiện phiên bản do mỗi đối tượng chỉ có một bản ghi duy nhất.

### 8.3. Giải thích thiết kế của `fact_customer_behavior`

Bảng `fact_customer_behavior` được thiết kế hoàn toàn đứng độc lập và không liên kết trực tiếp với các bảng Dimension trên vì những lý do kỹ thuật sau:

1. **Bản chất là Bảng Fact tổng hợp (Aggregate Fact Table / Profile Table):**
   - Hạt (grain) của bảng này là **mỗi dòng ứng với một khách hàng (`customer_id`)**, không phải từng sự kiện giao dịch. Bảng này lưu trữ hồ sơ tích lũy (Customer Profile) từ trước đến nay phục vụ phân tích RFM (Recency, Frequency, Monetary).
2. **Không thể map vào các Dimension dùng chung (Conformed Dimensions):**
   - **Không có `date_key` (Thời gian):** Hành vi của một khách hàng tích lũy qua toàn bộ vòng đời của họ (từ đơn hàng đầu tiên `first_order_at` đến đơn hàng gần nhất `last_order_at`), do đó không thể neo vào một khóa ngày cụ thể trong `dim_time`.
   - **Không có `seller_company_id` / `shipper_company_id`:** Một khách hàng có thể mua sắm từ nhiều nhà bán hàng khác nhau (`unique_sellers`) và nhận hàng qua nhiều đơn vị vận chuyển (`unique_shippers`). Việc liên kết trực tiếp khóa ngoại của seller/shipper vào bảng này sẽ vi phạm tính đúng đắn dữ liệu (quan hệ nhiều-nhiều bị phá vỡ).
3. **Áp dụng kỹ thuật Chiều thoái hóa (Degenerate Dimension) để bảo mật:**
   - Để tuân thủ quyền riêng tư dữ liệu của khách hàng trên Blockchain, hệ thống không lưu các thông tin định danh cá nhân nhạy cảm (PII) như Họ tên, SĐT, Email trên Data Lakehouse. 
   - Mã định danh `customer_id` đóng vai trò là một **Degenerate Dimension**. Các thuộc tính định tính của khách hàng (như phân nhóm `customer_segment` và cờ rủi ro `risk_flag`) được tính toán động bằng Spark và lưu trực tiếp trong bảng để phục vụ phân tích mà không cần bảng `dim_customer` riêng biệt.
4. **Tối ưu hóa hiệu năng truy vấn:**
   - Việc gom tất cả metrics hành vi và phân nhóm vào một bảng duy nhất giúp công cụ query (Trino) và BI Dashboard (Superset) truy xuất báo cáo cực nhanh mà không phải thực hiện các phép JOIN phức tạp và tốn kém tài nguyên.
