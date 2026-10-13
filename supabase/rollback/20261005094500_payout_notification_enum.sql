-- Quay lui 20261005094500_payout_notification_enum.sql (xem README.md).
-- Postgres không xoá được giá trị enum: giá trị mới ở lại (vô hại khi không
-- dòng nào dùng). Chạy rollback của 20261005094600 TRƯỚC.
BEGIN;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005094500';

COMMIT;
