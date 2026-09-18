-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration sang Supabase (7/11)
-- INTERACTION EVENTS + DOMAIN EVENTS — không đổi so với gốc
-- ============================================================

-- Khai báo sẵn để tránh migrate schema sau khi đã có data.
-- App KHÔNG ghi data vào bảng này cho đến Sprint 3.
CREATE TABLE interaction_events (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID        NOT NULL REFERENCES users(id),
    actor_type  VARCHAR(20) NOT NULL CHECK (actor_type IN ('buyer', 'supplier', 'admin', 'system', 'anonymous')),
    target_type VARCHAR(50) NOT NULL, -- 'product', 'supplier', 'rfq', 'quote'
    target_id   UUID        NOT NULL,
    event_type  VARCHAR(50) NOT NULL, -- 'view', 'rfq_sent', 'quote_accepted', 'reorder'
    metadata    JSONB,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
    -- GHI DỮ LIỆU TỪ SPRINT 3 · bảng này được tạo sẵn nhưng để trống trong MVP
);
COMMENT ON TABLE interaction_events IS
    'Khai báo sẵn để tránh migrate schema. App bắt đầu ghi từ Sprint 3.';
COMMENT ON COLUMN interaction_events.actor_type IS
    'buyer|supplier|admin|system|anonymous — rộng hơn message_role để cover mọi loại actor';

-- Event store tổng: mọi domain event đều append vào đây.
-- Dùng cho: notification trigger, analytics, audit, interaction graph, AI.
CREATE TABLE domain_events (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(50)  NOT NULL,   -- 'order', 'rfq', 'user', 'product'...
    aggregate_id   UUID         NOT NULL,
    event_type     VARCHAR(100) NOT NULL,   -- 'rfq.published', 'order.confirmed'...
    payload        JSONB,
    actor_id       UUID         REFERENCES users(id),  -- NULL = system event
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE domain_events IS
    'Append-only event store. Ghi từ Sprint 1 cho mọi domain event quan trọng.';

CREATE INDEX idx_domain_events_aggregate ON domain_events (aggregate_type, aggregate_id, created_at DESC);
CREATE INDEX idx_domain_events_type      ON domain_events (event_type, created_at DESC);
