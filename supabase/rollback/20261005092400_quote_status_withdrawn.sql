-- Quay lui 20261005092400_quote_status_withdrawn.sql (xem README.md).
-- Postgres không xoá được giá trị enum: 'withdrawn' ở lại trong quote_status
-- (vô hại khi không dòng nào dùng). Chỉ gỡ dấu đã chạy.
-- Chạy rollback 20261005092500 TRƯỚC file này.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.rfq_quotes WHERE status::TEXT = 'withdrawn') THEN
        RAISE EXCEPTION 'Còn báo giá ở trạng thái withdrawn — chạy rollback 20261005092500 trước.';
    END IF;
END $$;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005092400';

COMMIT;
