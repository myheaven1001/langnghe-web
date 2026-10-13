-- Quay lui 20261005094300_admin_platform_report.sql (xem README.md).
-- Chỉ bỏ 2 hàm đọc số liệu; không đụng dữ liệu. Quay lui web về bản trước
-- TRƯỚC khi chạy file này.
BEGIN;

DROP FUNCTION IF EXISTS public.admin_rfq_monitor(INT);
DROP FUNCTION IF EXISTS public.admin_platform_report(INT);

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005094300';

COMMIT;
