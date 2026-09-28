-- Quay lui 20261005091000_restrict_supplier_profiles_select.sql (xem README.md).
-- Mở lại quyền đọc bảng gốc cho mọi người như bản cũ. View và code app giữ nguyên.
BEGIN;

DROP POLICY IF EXISTS supplier_profiles_select ON public.supplier_profiles;
CREATE POLICY supplier_profiles_select_all ON public.supplier_profiles
    FOR SELECT USING (TRUE);

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005091000';

COMMIT;
