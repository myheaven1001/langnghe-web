-- Quay lui 20261005092300_supplier_dashboard_stats.sql (xem README.md).
-- Quay lui web về bản trước 4.4 TRƯỚC (dashboard nhà bán mới gọi hàm này).
BEGIN;

DROP FUNCTION IF EXISTS public.supplier_dashboard_stats();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005092300';

COMMIT;
