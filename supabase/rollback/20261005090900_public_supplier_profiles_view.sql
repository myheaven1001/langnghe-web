-- Quay lui 20261005090900_public_supplier_profiles_view.sql (xem README.md).
-- Chỉ chạy SAU khi đã quay lui 20261005091000 và code app không còn đọc
-- public_supplier_profiles (RfqCreateForm) — nếu không trang gửi RFQ sẽ lỗi.
BEGIN;

DROP FUNCTION IF EXISTS public.buyer_related_to_supplier(UUID);
DROP VIEW IF EXISTS public.public_supplier_profiles;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005090900';

COMMIT;
