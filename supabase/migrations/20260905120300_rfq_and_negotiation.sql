-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration sang Supabase (4/11)
-- RFQ & NEGOTIATION — không đổi so với schema_v1_mvp.sql gốc
-- MVP: buyer và supplier liên hệ qua email/Zalo sau khi match.
-- rfq_messages thêm vào Sprint 2 khi có in-app chat.
-- ============================================================

CREATE TABLE rfq_requests (
    id            UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id      UUID       NOT NULL REFERENCES buyer_profiles(id),
    product_id    UUID       REFERENCES products(id),
    category_id   UUID       REFERENCES categories(id), -- định tuyến Multi-RFQ
    title         VARCHAR(255) NOT NULL,
    requirements  TEXT,
    quantity      INT        NOT NULL,
    unit          VARCHAR(50),
    budget_min    DECIMAL(14,2),
    budget_max    DECIMAL(14,2),
    deadline_days INT,
    rfq_type      rfq_type   NOT NULL DEFAULT 'single',
    status        rfq_status NOT NULL DEFAULT 'published',
    expires_at    TIMESTAMP,
    created_at    TIMESTAMP  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rfq_budget CHECK (
        budget_max IS NULL OR budget_min IS NULL OR budget_max >= budget_min
    )
);

CREATE TABLE rfq_quotes (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id         UUID         NOT NULL REFERENCES rfq_requests(id),
    supplier_id    UUID         NOT NULL REFERENCES supplier_profiles(id),
    unit_price     DECIMAL(14,2) NOT NULL,
    min_qty        INT,
    lead_time_days INT,
    note           TEXT,
    valid_until    TIMESTAMP,
    status         quote_status  NOT NULL DEFAULT 'pending',
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Partial unique: chống spam báo giá, nhưng cho phép báo lại sau khi bị rejected
CREATE UNIQUE INDEX uq_quote_active_per_supplier
    ON rfq_quotes (rfq_id, supplier_id)
    WHERE status NOT IN ('rejected');
