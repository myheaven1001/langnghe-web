-- Quay lui 20261005093200_order_and_notification_enums.sql (xem README.md).
-- Postgres không xoá được giá trị enum: các giá trị mới ở lại (vô hại khi
-- không dòng nào dùng). Chạy rollback của các migration bước 5 sau nó TRƯỚC.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.orders WHERE status::TEXT = 'pending_confirmation') THEN
        RAISE EXCEPTION 'Còn đơn ở trạng thái pending_confirmation — xử lý trước khi quay lui.';
    END IF;
END $$;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005093200';

COMMIT;
