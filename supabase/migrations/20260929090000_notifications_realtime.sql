-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Giai đoạn 5.3 — Trang thông báo (/notifications): bật Supabase Realtime
-- cho bảng notifications, cùng cách đã làm cho rfq_messages ở
-- 20260928090000_rfq_messages_realtime.sql (5.2) — không cần RLS/cột mới,
-- bảng notifications + RLS (notifications_own, FOR ALL) đã có sẵn từ
-- 20260905120500_notifications.sql / 20260905121000_rls_policies.sql.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
    ) THEN
        RAISE EXCEPTION 'notifications đã bật Realtime rồi. Migration này đã chạy rồi.';
    END IF;
END $$;

-- Postgres Changes chỉ phát event cho bảng đã thêm vào publication này.
-- RLS (notifications_own) vẫn áp dụng cho stream — client chỉ nhận được
-- INSERT/UPDATE của đúng notification của chính mình (user_id = auth.uid()).
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — notifications Realtime bật cho INSERT/UPDATE';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- ALTER PUBLICATION supabase_realtime DROP TABLE notifications;
-- COMMIT;
