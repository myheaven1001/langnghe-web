-- Quay lui 20261005091400_save_product.sql (xem README.md).
-- Chỉ xoá hàm; ProductForm.tsx đã gọi save_product sẽ lỗi — quay lui code
-- cùng lúc.
BEGIN;

DROP FUNCTION IF EXISTS public.save_product(UUID, JSONB, JSONB, JSONB, JSONB, UUID[]);

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005091400';

COMMIT;
