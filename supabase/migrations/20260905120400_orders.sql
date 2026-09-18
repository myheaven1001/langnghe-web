-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration sang Supabase (5/11)
-- ORDERS — không đổi so với schema_v1_mvp.sql gốc
-- MVP: Không có escrow. Buyer chuyển khoản trực tiếp → supplier.
-- Admin xác nhận thanh toán và chuyển status sang 'confirmed'.
-- Dispute xử lý thủ công qua admin panel.
-- ============================================================

CREATE TABLE orders (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_quote_id      UUID         NOT NULL REFERENCES rfq_quotes(id),
    buyer_id          UUID         NOT NULL REFERENCES buyer_profiles(id),
    supplier_id       UUID         NOT NULL REFERENCES supplier_profiles(id),
    quantity          INT          NOT NULL,
    unit_price        DECIMAL(14,2) NOT NULL,  -- snapshot giá chốt (incl. variant adj.)
    -- GENERATED ALWAYS thay CHECK để tránh sai số làm tròn floating point
    total_amount      DECIMAL(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    currency          VARCHAR(3)   NOT NULL DEFAULT 'VND',
    status            order_status NOT NULL DEFAULT 'pending_payment',
    -- Thông tin thanh toán thủ công (MVP không có escrow)
    payment_note      TEXT,                    -- "Đã CK 50tr, ref: MB2025..."
    payment_confirmed_by UUID REFERENCES users(id),
    shipping_address  TEXT,
    logistics_provider VARCHAR(50),
    tracking_number   VARCHAR(100),
    confirmed_at      TIMESTAMP,
    shipped_at        TIMESTAMP,
    delivered_at      TIMESTAMP,
    completed_at      TIMESTAMP,
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW()
);
