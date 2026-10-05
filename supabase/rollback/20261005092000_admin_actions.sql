-- Quay lui 20261005092000_admin_actions.sql (xem README.md).
-- XOÁ cột orders.paid_amount / paid_at và disputes.reporter_role / created_by
-- (mất số tiền đã ghi nhận — sao lưu trước). Nhật ký admin_audit_log giữ nguyên.
-- Quay lui web về bản trước 3.6 TRƯỚC khi chạy file này.
BEGIN;

DROP FUNCTION IF EXISTS public.admin_open_dispute(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_review_verification(UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.admin_set_user_status(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_confirm_payment(UUID, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT);

DROP TRIGGER IF EXISTS trg_guard_order_payment_columns ON public.orders;
DROP FUNCTION IF EXISTS public.guard_order_payment_columns();

ALTER TABLE public.disputes DROP COLUMN IF EXISTS reporter_role, DROP COLUMN IF EXISTS created_by;
ALTER TABLE public.orders DROP COLUMN IF EXISTS paid_amount, DROP COLUMN IF EXISTS paid_at;

DROP FUNCTION IF EXISTS public.assert_admin();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005092000';

COMMIT;
