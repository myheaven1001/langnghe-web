-- Quay lui 20261005094700_notification_overrides.sql (xem README.md).
-- XOÁ các mẫu thông báo admin đã đặt; thông báo trở lại nội dung gốc và lựa
-- chọn tắt thông báo của người dùng lại không có hiệu lực như trước. Thông báo
-- đã ghi giữ nguyên. Quay lui web về bản trước TRƯỚC khi chạy file này.
BEGIN;

DROP TRIGGER IF EXISTS trg_apply_notification_rules ON public.notifications;
DROP FUNCTION IF EXISTS public.apply_notification_rules();
DROP FUNCTION IF EXISTS public.admin_save_notification_template(TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.render_notification_template(TEXT, TEXT, TEXT, JSONB);
DROP TABLE IF EXISTS public.notification_overrides;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005094700';

COMMIT;
