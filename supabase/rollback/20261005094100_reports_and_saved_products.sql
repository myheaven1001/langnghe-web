-- Quay lui 20261005094100_reports_and_saved_products.sql (xem README.md).
-- XOÁ mọi báo cáo vi phạm và danh sách sản phẩm đã lưu. Quay lui web về bản
-- trước TRƯỚC khi chạy file này.
BEGIN;

DROP TABLE IF EXISTS public.saved_products;
DROP FUNCTION IF EXISTS public.saved_products_limit();

DROP FUNCTION IF EXISTS public.admin_resolve_report(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.submit_report(TEXT, UUID, TEXT, TEXT);
DROP TABLE IF EXISTS public.content_reports;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005094100';

COMMIT;
