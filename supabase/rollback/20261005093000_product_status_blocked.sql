-- Quay lui 20261005093000_product_status_blocked.sql (xem README.md).
-- Postgres không xoá được giá trị enum: 'blocked' ở lại trong product_status
-- (vô hại khi không dòng nào dùng). Chạy rollback 20261005093100 TRƯỚC.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.products WHERE status::TEXT = 'blocked') THEN
        RAISE EXCEPTION 'Còn sản phẩm ở trạng thái blocked — chạy rollback 20261005093100 trước.';
    END IF;
END $$;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005093000';

COMMIT;
