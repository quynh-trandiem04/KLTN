-- ============================================================
-- Migration 001: Blockchain Outbox + Reconciliation
-- Mục đích: Đảm bảo data consistency giữa PostgreSQL và Blockchain
-- ============================================================

-- 1. Bảng Outbox — lưu trữ các tác vụ cần đồng bộ sang Blockchain
CREATE TABLE IF NOT EXISTS blockchain_outbox (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,            -- CREATE_ORDER, CANCEL_ORDER, CONFIRM_PAYMENT, REQUEST_RETURN, ...
    payload JSONB NOT NULL,                 -- Full payload gửi tới blockchain-adapter
    status VARCHAR(20) DEFAULT 'PENDING',   -- PENDING → PROCESSING → SYNCED | FAILED
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 5,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    synced_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON blockchain_outbox(status);
CREATE INDEX IF NOT EXISTS idx_outbox_order_id ON blockchain_outbox(order_id);
CREATE INDEX IF NOT EXISTS idx_outbox_created_at ON blockchain_outbox(created_at);

-- 2. Bảng Reconciliation Log — ghi nhận kết quả đối chiếu
CREATE TABLE IF NOT EXISTS reconciliation_log (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    mismatch_type VARCHAR(30) NOT NULL,     -- CHAIN_ONLY, DB_ONLY, STATUS_MISMATCH
    db_status VARCHAR(30),
    chain_status VARCHAR(30),
    db_data JSONB,                          -- Snapshot dữ liệu DB tại thời điểm phát hiện
    chain_data JSONB,                       -- Snapshot dữ liệu Chain tại thời điểm phát hiện
    resolved BOOLEAN DEFAULT FALSE,
    resolution_action TEXT,
    detected_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recon_order_id ON reconciliation_log(order_id);
CREATE INDEX IF NOT EXISTS idx_recon_resolved ON reconciliation_log(resolved);

-- 3. Thêm cột sync tracking vào bảng orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS blockchain_sync_status VARCHAR(20) DEFAULT 'PENDING';
-- Giá trị: PENDING (chưa sync), SYNCED (đã sync), FAILED (sync thất bại)

CREATE INDEX IF NOT EXISTS idx_orders_sync_status ON orders(blockchain_sync_status);
