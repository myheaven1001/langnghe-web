-- Quay lui 20261005091700_platform_settings_and_audit_log.sql (xem README.md).
-- XOÁ cả cài đặt đã nhập và nhật ký admin — chỉ dùng khi chưa có code/migration
-- nào sau đó phụ thuộc (3.3, 3.6, 3.7 đều dùng các bảng/hàm này).
BEGIN;

DROP FUNCTION IF EXISTS public.admin_set_setting(TEXT, JSONB);
DROP FUNCTION IF EXISTS public.get_setting(TEXT);
DROP TABLE IF EXISTS public.platform_settings;
DROP FUNCTION IF EXISTS public.log_admin_action(TEXT, TEXT, TEXT, JSONB);
DROP TABLE IF EXISTS public.admin_audit_log;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005091700';

COMMIT;
