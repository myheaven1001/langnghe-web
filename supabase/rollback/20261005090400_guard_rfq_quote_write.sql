-- Quay lui 20261005090400_guard_rfq_quote_write.sql (xem README.md).
-- Gỡ trigger + hàm. Lưu ý: sau khi gỡ, xưởng lại KHÔNG gửi được báo giá
-- (QuoteModal không gửi supplier_id) — chỉ dùng khi trigger gây sự cố lớn hơn.
BEGIN;

DROP TRIGGER IF EXISTS trg_guard_rfq_quote_write ON public.rfq_quotes;
DROP FUNCTION IF EXISTS public.guard_rfq_quote_write();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005090400';

COMMIT;
