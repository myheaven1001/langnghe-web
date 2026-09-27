-- Quay lui 20261005090000_guard_buyer_system_columns.sql (xem README.md).
-- Chỉ gỡ trigger + hàm; không đụng dữ liệu buyer_profiles.
BEGIN;

DROP TRIGGER IF EXISTS trg_guard_buyer_system_columns ON public.buyer_profiles;
DROP FUNCTION IF EXISTS public.guard_buyer_system_columns();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005090000';

COMMIT;
