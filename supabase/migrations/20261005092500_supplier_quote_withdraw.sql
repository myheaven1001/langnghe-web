-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 4.6 (phần 2/2): xưởng rút báo giá mà vẫn giữ lịch sử.
--
-- Trước đây "rút báo giá" = xoá dòng rfq_quotes: mất dấu vết, tin nhắn gắn
-- với báo giá đó mồ côi. Giờ rút = đổi trạng thái sang 'withdrawn':
--   - Xưởng: pending → withdrawn (chỉ đổi đúng cột status). Sau khi rút
--     được gửi báo giá mới cho cùng RFQ (index duy nhất bỏ qua 'withdrawn',
--     như đã bỏ qua 'rejected').
--   - Buyer không thấy báo giá đã rút (quy tắc rfq_quotes_buyer_view).
--   - supplier_dashboard_stats(): RFQ chỉ có báo giá đã rút lại được tính là
--     "cần báo giá"; "số báo giá đã gửi" không tính báo giá đã rút.
--   - accept_quote() không đổi: chỉ nhận pending/counter_offered nên báo giá
--     đã rút không chốt được.
-- Xoá báo giá pending (đường cũ) vẫn được trong lúc deploy; web mới không
-- dùng nữa.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'quote_status' AND e.enumlabel = 'withdrawn'
    ) THEN
        RAISE EXCEPTION 'quote_status thiếu giá trị withdrawn. Chạy 20261005092400 trước.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'supplier_dashboard_stats') THEN
        RAISE EXCEPTION 'Thiếu supplier_dashboard_stats(). Chạy 20261005092300 (4.4) trước.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_quote_active_per_supplier' AND indexdef LIKE '%withdrawn%'
    ) THEN
        RAISE EXCEPTION 'uq_quote_active_per_supplier đã bỏ qua withdrawn. Migration này đã chạy rồi.';
    END IF;
END $$;

-- ── Mỗi xưởng 1 báo giá đang hiệu lực cho mỗi RFQ ──────────────────────
DROP INDEX public.uq_quote_active_per_supplier;
CREATE UNIQUE INDEX uq_quote_active_per_supplier
    ON public.rfq_quotes (rfq_id, supplier_id)
    WHERE status NOT IN ('rejected', 'withdrawn');

-- ── Buyer không thấy báo giá đã rút ────────────────────────────────────
DROP POLICY rfq_quotes_buyer_view ON public.rfq_quotes;
CREATE POLICY rfq_quotes_buyer_view ON public.rfq_quotes
    FOR SELECT USING (public.is_rfq_buyer(rfq_quotes.rfq_id) AND status <> 'withdrawn');

-- ── Trigger 1.5: cho phép pending → withdrawn ──────────────────────────
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

COMMENT ON FUNCTION public.guard_rfq_quote_write IS
    'BEFORE INSERT/UPDATE/DELETE trên rfq_quotes (kế hoạch 1.5 + 4.6): xưởng chỉ
     tạo báo giá pending cho RFQ còn mở (supplier_id tự điền), chỉ sửa khi còn
     pending, đổi trạng thái duy nhất được phép là pending → withdrawn.
     accept_quote/admin/service_role bỏ qua.';

-- ── Số liệu dashboard: bỏ qua báo giá đã rút ───────────────────────────
CREATE OR REPLACE FUNCTION public.supplier_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
    v_now         TIMESTAMP := NOW() AT TIME ZONE 'UTC';
    v_month_start TIMESTAMP :=
        (date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AT TIME ZONE 'UTC';
    v_new_rfq     INT;
    v_urgent_rfq  INT;
    v_orders      JSONB;
    v_revenue     NUMERIC;
BEGIN
    SELECT id INTO v_supplier_id FROM supplier_profiles WHERE user_id = auth.uid();
    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'NOT_A_SUPPLIER';
    END IF;

    SELECT count(*),
           count(*) FILTER (
               WHERE COALESCE(r.expires_at, r.created_at + r.deadline_days * INTERVAL '1 day')
                     BETWEEN v_now AND v_now + INTERVAL '24 hours')
    INTO v_new_rfq, v_urgent_rfq
    FROM rfq_requests r
    WHERE r.status = 'published'
      AND NOT EXISTS (SELECT 1 FROM rfq_quotes q
                      WHERE q.rfq_id = r.id AND q.supplier_id = v_supplier_id
                        AND q.status <> 'withdrawn');

    SELECT jsonb_build_object(
               'pending_payment', count(*) FILTER (WHERE status = 'pending_payment'),
               'confirmed',       count(*) FILTER (WHERE status = 'confirmed'),
               'producing',       count(*) FILTER (WHERE status = 'producing'),
               'shipped',         count(*) FILTER (WHERE status = 'shipped'),
               'delivered',       count(*) FILTER (WHERE status = 'delivered'),
               'completed',       count(*) FILTER (WHERE status = 'completed'),
               'cancelled',       count(*) FILTER (WHERE status = 'cancelled')),
           COALESCE(sum(total_amount) FILTER (
               WHERE status NOT IN ('pending_payment', 'cancelled')
                 AND confirmed_at >= v_month_start), 0)
    INTO v_orders, v_revenue
    FROM orders
    WHERE supplier_id = v_supplier_id;

    RETURN jsonb_build_object(
        'new_rfq_count',    v_new_rfq,
        'urgent_rfq_count', v_urgent_rfq,
        'orders',           v_orders,
        'revenue_month',    v_revenue,
        'targeted_count',   (SELECT count(*) FROM rfq_targets WHERE supplier_id = v_supplier_id),
        'quotes_count',     (SELECT count(*) FROM rfq_quotes
                             WHERE supplier_id = v_supplier_id AND status <> 'withdrawn'),
        'accepted_count',   (SELECT count(*) FROM rfq_quotes
                             WHERE supplier_id = v_supplier_id AND status = 'accepted'));
END;
$$;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — rút báo giá (withdrawn): index, quy tắc buyer, trigger, số liệu dashboard';
END $$;

COMMIT;
