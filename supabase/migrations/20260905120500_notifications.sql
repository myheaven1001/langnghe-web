-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration sang Supabase (6/11)
-- NOTIFICATIONS — không đổi so với schema_v1_mvp.sql gốc
-- BullMQ + Redis xử lý gửi bất đồng bộ.
-- In-app: đọc từ bảng này. Email: gửi qua Resend/SendGrid.
-- ============================================================

CREATE TABLE notifications (
    id         UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID                 NOT NULL REFERENCES users(id),
    type       notification_type    NOT NULL,
    title      VARCHAR(255)         NOT NULL,
    body       TEXT,
    payload    JSONB,               -- order_id, rfq_id, quote_id... để link đúng trang
    channel    notification_channel NOT NULL,
    status     VARCHAR(20)          NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'sent', 'failed')),
    is_read    BOOLEAN              NOT NULL DEFAULT FALSE,
    read_at    TIMESTAMP,
    sent_at    TIMESTAMP,
    failed_reason TEXT,             -- lý do failed nếu status = 'failed'
    created_at TIMESTAMP            NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_preferences (
    id                UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID                 NOT NULL REFERENCES users(id),
    notification_type notification_type    NOT NULL,
    channel           notification_channel NOT NULL,
    enabled           BOOLEAN              NOT NULL DEFAULT TRUE,
    updated_at        TIMESTAMP            NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_notif_pref UNIQUE (user_id, notification_type, channel)
);
