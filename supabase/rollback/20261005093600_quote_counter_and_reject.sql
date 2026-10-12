-- Quay lui 20261005093600_quote_counter_and_reject.sql (xem README.md).
-- Mất toàn bộ lịch sử trả giá. Báo giá đang thương lượng (counter_offered) giữ
-- nguyên trạng thái và giá mới nhất của xưởng, buyer vẫn chốt được. Quay lui
-- web về bản trước 5.7 TRƯỚC khi chạy file này.
BEGIN;

DROP FUNCTION IF EXISTS public.reject_quote(UUID, TEXT);
DROP FUNCTION IF EXISTS public.counter_quote(UUID, NUMERIC, INT, TEXT);
DROP TRIGGER IF EXISTS trg_log_quote_revision ON public.rfq_quotes;
DROP FUNCTION IF EXISTS public.log_quote_revision();
DROP TABLE IF EXISTS public.rfq_quote_revisions;

-- Bản 20261005092500.
CREATE OR REPLACE FUNCTION public.guard_rfq_quote_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_supplier   UUID;
    v_rfq_status rfq_status;
BEGIN
    IF current_user <> 'authenticated' OR public.is_admin() THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    SELECT id INTO v_supplier FROM supplier_profiles WHERE user_id = auth.uid();

    IF TG_OP = 'INSERT' THEN
        IF v_supplier IS NULL THEN
            RAISE EXCEPTION 'FORBIDDEN_QUOTE_CHANGE'
                USING DETAIL = 'Chỉ tài khoản xưởng được gửi báo giá.';
        END IF;
        NEW.supplier_id := COALESCE(NEW.supplier_id, v_supplier);
        IF NEW.supplier_id <> v_supplier THEN
            RAISE EXCEPTION 'FORBIDDEN_QUOTE_CHANGE'
                USING DETAIL = 'Không được gửi báo giá dưới tên xưởng khác.';
        END IF;
        IF NEW.status <> 'pending' THEN
            RAISE EXCEPTION 'FORBIDDEN_QUOTE_CHANGE'
                USING DETAIL = format('Báo giá mới phải ở trạng thái pending, không phải %s.', NEW.status);
        END IF;
        SELECT status INTO v_rfq_status FROM rfq_requests WHERE id = NEW.rfq_id;
        IF v_rfq_status IS NULL OR v_rfq_status NOT IN ('published', 'quoted', 'negotiating') THEN
            RAISE EXCEPTION 'RFQ_NOT_OPEN'
                USING DETAIL = format('RFQ đang ở trạng thái %s, không nhận báo giá.', COALESCE(v_rfq_status::TEXT, 'không tồn tại'));
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE / DELETE: chỉ báo giá còn chờ buyer quyết định.
    IF OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'FORBIDDEN_QUOTE_CHANGE'
            USING DETAIL = format('Báo giá đã %s, không sửa/rút được nữa.', OLD.status);
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF NEW.rfq_id      IS DISTINCT FROM OLD.rfq_id
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
       OR NEW.created_at  IS DISTINCT FROM OLD.created_at
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'withdrawn') THEN
        RAISE EXCEPTION 'FORBIDDEN_QUOTE_CHANGE'
            USING DETAIL = 'Xưởng chỉ sửa được giá, số lượng tối thiểu, thời gian sản xuất, ghi chú, hạn báo giá, hoặc rút báo giá.';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005093600';

COMMIT;
