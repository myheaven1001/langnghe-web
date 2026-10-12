-- Quay lui 20261005094200_bulk_products.sql (xem README.md).
-- Sản phẩm đã nhập giữ nguyên. Quay lui web về bản trước TRƯỚC khi chạy file này.
BEGIN;

DROP FUNCTION IF EXISTS public.bulk_update_products(UUID[], TEXT, NUMERIC);
DROP FUNCTION IF EXISTS public.bulk_save_products(JSONB);
DROP FUNCTION IF EXISTS public.parse_flag(TEXT);

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005094200';

COMMIT;
