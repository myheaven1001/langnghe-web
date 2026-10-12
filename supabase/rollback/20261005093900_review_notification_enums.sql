-- Quay lui 20261005093900_review_notification_enums.sql (xem README.md).
-- Postgres không xoá được giá trị enum: hai giá trị mới ở lại (vô hại khi
-- không dòng nào dùng). Chạy rollback của 20261005094000 TRƯỚC.
BEGIN;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005093900';

COMMIT;
