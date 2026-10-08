-- Quay lui 20261005092800_buyer_dashboard_stats.sql (xem README.md).
-- Dashboard buyer mới vẫn mở được khi thiếu hàm (số liệu hiện 0).
BEGIN;

DROP FUNCTION IF EXISTS public.buyer_dashboard_stats();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005092800';

COMMIT;
