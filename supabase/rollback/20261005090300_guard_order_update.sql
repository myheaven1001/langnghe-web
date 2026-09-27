-- Quay lui 20261005090300_guard_order_update.sql (xem README.md).
-- Gỡ trigger + hàm → orders_update lại cho buyer/supplier/admin sửa tự do
-- như trước. GIỮ cột orders.cancel_reason (có thể đã có dữ liệu; migration
-- chạy lại dùng ADD COLUMN IF NOT EXISTS nên không xung đột).
BEGIN;

DROP TRIGGER IF EXISTS trg_guard_order_update ON public.orders;
DROP FUNCTION IF EXISTS public.guard_order_update();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005090300';

COMMIT;
