-- Quay lui 20261005090700_guard_rfq_request_write.sql (xem README.md).
-- Gỡ trigger + hàm → buyer lại ghi rfq_requests tự do như trước.
BEGIN;

DROP TRIGGER IF EXISTS trg_guard_rfq_request_write ON public.rfq_requests;
DROP FUNCTION IF EXISTS public.guard_rfq_request_write();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005090700';

COMMIT;
