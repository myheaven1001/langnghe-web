-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 5.7: trả giá qua lại trên một báo giá, buyer từ chối báo giá.
--
-- Trước đây báo giá chỉ có 2 lối: buyer chốt hoặc bỏ mặc. Giờ:
--   rfq_quote_revisions   Lịch sử các lần đề nghị giá của một báo giá
--       (proposed_by = 'supplier' | 'buyer'). Dòng đầu là báo giá gốc.
--       Chỉ ghi qua trigger / hàm, client chỉ đọc (ai thấy báo giá thì thấy
--       lịch sử của nó).
--   Bất biến: rfq_quotes.unit_price / lead_time_days LUÔN là đề nghị mới
--       nhất CỦA XƯỞNG. Đề nghị của buyer chỉ nằm trong bảng lịch sử. Nhờ đó
--       accept_quote() không phải sửa: buyer chốt = nhận giá mới nhất xưởng
--       đã đưa ra (kể cả khi đề nghị của chính buyer còn chưa được trả lời).
--   counter_quote(quote, price, lead_time, note)   Theo lượt:
--       - buyer trả giá khi lượt gần nhất là của xưởng → báo giá sang
--         'counter_offered', RFQ sang 'negotiating';
--       - xưởng trả lời khi lượt gần nhất là của buyer (đưa giá mới, hoặc
--         gửi đúng giá buyer đề nghị = đồng ý) → cập nhật giá trên báo giá.
--       Tối đa 10 lượt mỗi báo giá. Bên kia nhận thông báo quote_countered.
--   reject_quote(quote, reason)   Buyer từ chối một báo giá đang chờ; xưởng
--       nhận thông báo và được gửi báo giá mới cho RFQ đó.
--   Trigger guard_rfq_quote_write: báo giá đang thương lượng thì xưởng không
--       sửa thẳng được nữa (phải qua counter_quote), nhưng vẫn rút được.
--
-- Mã lỗi: NOT_AUTHENTICATED, ACCOUNT_SUSPENDED, QUOTE_NOT_FOUND,
--         QUOTE_NOT_NEGOTIABLE, RFQ_ALREADY_SETTLED, NOT_YOUR_TURN,
--         COUNTER_LIMIT_REACHED, INVALID_PRICE, INVALID_LEAD_TIME, INVALID_NOTE.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.rfq_quote_revisions') IS NOT NULL THEN
        RAISE EXCEPTION 'rfq_quote_revisions đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'notification_type' AND e.enumlabel = 'quote_countered'
    ) THEN
        RAISE EXCEPTION 'notification_type thiếu quote_countered. Chạy 20261005093200 trước.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'quote_status' AND e.enumlabel = 'withdrawn'
    ) THEN
        RAISE EXCEPTION 'quote_status thiếu withdrawn. Chạy 20261005092400 trước.';
    END IF;
END $$;

-- ── Lịch sử đề nghị giá ────────────────────────────────────────────────
CREATE TABLE public.rfq_quote_revisions (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id       UUID          NOT NULL REFERENCES public.rfq_quotes(id) ON DELETE CASCADE,
    proposed_by    TEXT          NOT NULL CHECK (proposed_by IN ('supplier', 'buyer')),
    unit_price     DECIMAL(14,2) NOT NULL CHECK (unit_price > 0),
    lead_time_days INT           CHECK (lead_time_days IS NULL OR lead_time_days BETWEEN 1 AND 365),
    note           TEXT          CHECK (note IS NULL OR char_length(note) <= 500),
    created_by     UUID          REFERENCES public.users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_quote_revisions_quote ON public.rfq_quote_revisions (quote_id, created_at);

COMMENT ON TABLE public.rfq_quote_revisions IS
    'Lịch sử trả giá của một báo giá (kế hoạch 5.7). Ghi qua trigger
     log_quote_revision và hàm counter_quote(); client chỉ đọc.';

ALTER TABLE public.rfq_quote_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_quote_revisions FORCE ROW LEVEL SECURITY;

-- Ai đọc được báo giá (xưởng chủ báo giá, buyer của RFQ, admin — theo quy
-- tắc của rfq_quotes) thì đọc được lịch sử của nó.
CREATE POLICY rfq_quote_revisions_select ON public.rfq_quote_revisions
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.rfq_quotes q WHERE q.id = rfq_quote_revisions.quote_id));

REVOKE ALL ON public.rfq_quote_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rfq_quote_revisions TO authenticated;

-- Báo giá đã có: dòng lịch sử đầu tiên là chính báo giá gốc.
INSERT INTO public.rfq_quote_revisions (quote_id, proposed_by, unit_price, lead_time_days, created_by, created_at)
SELECT q.id, 'supplier', q.unit_price,
       CASE WHEN q.lead_time_days BETWEEN 1 AND 365 THEN q.lead_time_days END,
       sp.user_id, q.created_at AT TIME ZONE 'UTC'
FROM public.rfq_quotes q
JOIN public.supplier_profiles sp ON sp.id = q.supplier_id
WHERE q.unit_price > 0;

-- ── Trigger: xưởng gửi / sửa báo giá → ghi một dòng lịch sử ────────────
-- counter_quote() tự ghi dòng của nó (có lời nhắn riêng) và đặt cờ
-- app.quote_revision_manual để trigger này bỏ qua.
CREATE FUNCTION public.log_quote_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF COALESCE(current_setting('app.quote_revision_manual', TRUE), '') = '1' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.unit_price IS NOT DISTINCT FROM OLD.unit_price
       AND NEW.lead_time_days IS NOT DISTINCT FROM OLD.lead_time_days THEN
        RETURN NEW;
    END IF;
    IF NEW.unit_price IS NULL OR NEW.unit_price <= 0 THEN
        RETURN NEW;
    END IF;
    INSERT INTO rfq_quote_revisions (quote_id, proposed_by, unit_price, lead_time_days, created_by)
    VALUES (NEW.id, 'supplier', NEW.unit_price,
            CASE WHEN NEW.lead_time_days BETWEEN 1 AND 365 THEN NEW.lead_time_days END,
            auth.uid());
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_quote_revision
    AFTER INSERT OR UPDATE OF unit_price, lead_time_days ON public.rfq_quotes
    FOR EACH ROW EXECUTE FUNCTION public.log_quote_revision();

-- ── Trigger 1.5: báo giá đang thương lượng chỉ còn rút được ────────────
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

    -- Đang thương lượng (5.7): chỉ còn đúng một thao tác trực tiếp là rút
    -- báo giá; đổi giá phải qua counter_quote() để giữ lượt và lịch sử.
    IF OLD.status = 'counter_offered' THEN
        IF TG_OP = 'UPDATE'
           AND NEW.status = 'withdrawn'
           AND NEW.rfq_id         IS NOT DISTINCT FROM OLD.rfq_id
           AND NEW.supplier_id    IS NOT DISTINCT FROM OLD.supplier_id
           AND NEW.unit_price     IS NOT DISTINCT FROM OLD.unit_price
           AND NEW.min_qty        IS NOT DISTINCT FROM OLD.min_qty
           AND NEW.lead_time_days IS NOT DISTINCT FROM OLD.lead_time_days
           AND NEW.created_at     IS NOT DISTINCT FROM OLD.created_at THEN
            NEW.updated_at := NOW();
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'FORBIDDEN_QUOTE_CHANGE'
            USING DETAIL = 'Báo giá đang thương lượng: trả lời đề nghị của buyer hoặc rút báo giá.';
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
    'BEFORE INSERT/UPDATE/DELETE trên rfq_quotes (kế hoạch 1.5 + 4.6 + 5.7):
     xưởng chỉ tạo báo giá pending cho RFQ còn mở, sửa khi còn pending, rút khi
     pending hoặc counter_offered. Đang thương lượng thì đổi giá qua
     counter_quote(). accept_quote/counter_quote/admin/service_role bỏ qua.';

-- ── Trả giá ────────────────────────────────────────────────────────────
CREATE FUNCTION public.counter_quote(
    p_quote_id       UUID,
    p_unit_price     NUMERIC,
    p_lead_time_days INT DEFAULT NULL,
    p_note           TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quote     rfq_quotes%ROWTYPE;
    v_rfq       rfq_requests%ROWTYPE;
    v_role      TEXT;
    v_last_by   TEXT;
    v_count     INT;
    v_note      TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
    v_other     UUID;
    v_shop      TEXT;
    v_price_txt TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;
    IF p_unit_price IS NULL OR p_unit_price <= 0 OR p_unit_price >= 1000000000000 THEN
        RAISE EXCEPTION 'INVALID_PRICE';
    END IF;
    IF p_lead_time_days IS NOT NULL AND p_lead_time_days NOT BETWEEN 1 AND 365 THEN
        RAISE EXCEPTION 'INVALID_LEAD_TIME';
    END IF;
    IF char_length(COALESCE(v_note, '')) > 500 THEN
        RAISE EXCEPTION 'INVALID_NOTE';
    END IF;

    SELECT * INTO v_quote FROM rfq_quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND';
    END IF;
    SELECT * INTO v_rfq FROM rfq_requests WHERE id = v_quote.rfq_id FOR UPDATE;

    -- Người gọi là buyer của RFQ hay xưởng chủ báo giá? Người ngoài (và buyer
    -- với báo giá đã rút) nhận cùng một lỗi như báo giá không tồn tại.
    IF EXISTS (SELECT 1 FROM buyer_profiles bp
               WHERE bp.id = v_rfq.buyer_id AND bp.user_id = auth.uid()) THEN
        v_role := 'buyer';
    ELSIF EXISTS (SELECT 1 FROM supplier_profiles sp
                  WHERE sp.id = v_quote.supplier_id AND sp.user_id = auth.uid()) THEN
        v_role := 'supplier';
    ELSE
        RAISE EXCEPTION 'QUOTE_NOT_FOUND';
    END IF;
    IF v_role = 'buyer' AND v_quote.status = 'withdrawn' THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND';
    END IF;

    IF v_rfq.status NOT IN ('published', 'quoted', 'negotiating') THEN
        RAISE EXCEPTION 'RFQ_ALREADY_SETTLED';
    END IF;
    IF v_quote.status NOT IN ('pending', 'counter_offered') THEN
        RAISE EXCEPTION 'QUOTE_NOT_NEGOTIABLE';
    END IF;

    SELECT count(*) INTO v_count FROM rfq_quote_revisions WHERE quote_id = p_quote_id;
    SELECT proposed_by INTO v_last_by FROM rfq_quote_revisions
    WHERE quote_id = p_quote_id ORDER BY created_at DESC, id DESC LIMIT 1;
    v_last_by := COALESCE(v_last_by, 'supplier');

    IF v_last_by = v_role THEN
        RAISE EXCEPTION 'NOT_YOUR_TURN'
            USING DETAIL = 'Đang chờ bên kia trả lời đề nghị gần nhất.';
    END IF;
    IF v_count >= 10 THEN
        RAISE EXCEPTION 'COUNTER_LIMIT_REACHED'
            USING DETAIL = 'Mỗi báo giá tối đa 10 lượt đề nghị.';
    END IF;

    INSERT INTO rfq_quote_revisions (quote_id, proposed_by, unit_price, lead_time_days, note, created_by)
    VALUES (p_quote_id, v_role, p_unit_price, p_lead_time_days, v_note, auth.uid());

    IF v_role = 'supplier' THEN
        -- Giá trên báo giá luôn là đề nghị mới nhất của xưởng.
        PERFORM set_config('app.quote_revision_manual', '1', TRUE);
        UPDATE rfq_quotes
        SET unit_price = p_unit_price,
            lead_time_days = COALESCE(p_lead_time_days, lead_time_days),
            status = 'counter_offered',
            updated_at = NOW()
        WHERE id = p_quote_id;
        PERFORM set_config('app.quote_revision_manual', '', TRUE);
    ELSE
        UPDATE rfq_quotes SET status = 'counter_offered', updated_at = NOW() WHERE id = p_quote_id;
    END IF;

    IF v_rfq.status <> 'negotiating' THEN
        UPDATE rfq_requests SET status = 'negotiating' WHERE id = v_rfq.id;
    END IF;

    v_price_txt := replace(to_char(round(p_unit_price), 'FM999,999,999,999'), ',', '.') || 'đ';
    SELECT shop_name INTO v_shop FROM supplier_profiles WHERE id = v_quote.supplier_id;
    IF v_role = 'buyer' THEN
        SELECT user_id INTO v_other FROM supplier_profiles WHERE id = v_quote.supplier_id;
    ELSE
        SELECT user_id INTO v_other FROM buyer_profiles WHERE id = v_rfq.buyer_id;
    END IF;

    INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
    VALUES (
        v_other, 'quote_countered',
        CASE WHEN v_role = 'buyer'
             THEN 'Buyer đề nghị giá mới: ' || v_rfq.title
             ELSE COALESCE(v_shop, 'Xưởng') || ' trả lời đề nghị giá: ' || v_rfq.title END,
        'Giá đề nghị: ' || v_price_txt || ' / ' || COALESCE(v_rfq.unit, 'cái')
            || COALESCE(' · ' || p_lead_time_days || ' ngày sản xuất', '')
            || COALESCE(E'\n' || v_note, ''),
        jsonb_build_object('rfq_id', v_rfq.id, 'quote_id', p_quote_id),
        'in_app', 'sent', NOW());

    RETURN jsonb_build_object('quote_id', p_quote_id, 'proposed_by', v_role,
                              'unit_price', p_unit_price, 'round', v_count + 1);
END;
$$;

COMMENT ON FUNCTION public.counter_quote(UUID, NUMERIC, INT, TEXT) IS
    'Trả giá theo lượt trên một báo giá (kế hoạch 5.7). Buyer của RFQ hoặc
     xưởng chủ báo giá gọi; chỉ được đi khi lượt gần nhất là của bên kia.';

REVOKE ALL ON FUNCTION public.counter_quote(UUID, NUMERIC, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.counter_quote(UUID, NUMERIC, INT, TEXT) TO authenticated;

-- ── Buyer từ chối một báo giá ──────────────────────────────────────────
CREATE FUNCTION public.reject_quote(p_quote_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quote  rfq_quotes%ROWTYPE;
    v_rfq    rfq_requests%ROWTYPE;
    v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;

    SELECT * INTO v_quote FROM rfq_quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND OR v_quote.status = 'withdrawn' THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND';
    END IF;
    SELECT r.* INTO v_rfq FROM rfq_requests r
    JOIN buyer_profiles bp ON bp.id = r.buyer_id
    WHERE r.id = v_quote.rfq_id AND bp.user_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND';
    END IF;
    IF v_quote.status NOT IN ('pending', 'counter_offered') THEN
        RAISE EXCEPTION 'QUOTE_NOT_NEGOTIABLE';
    END IF;

    UPDATE rfq_quotes SET status = 'rejected', updated_at = NOW() WHERE id = p_quote_id;

    INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
    SELECT sp.user_id, 'quote_rejected',
           'Buyer đã từ chối báo giá: ' || v_rfq.title,
           COALESCE('Lý do: ' || left(v_reason, 400) || E'\n', '')
               || CASE WHEN v_rfq.status IN ('published', 'quoted', 'negotiating')
                       THEN 'Bạn có thể gửi báo giá mới cho yêu cầu này.'
                       ELSE 'Yêu cầu này đã đóng.' END,
           jsonb_build_object('rfq_id', v_rfq.id, 'quote_id', p_quote_id),
           'in_app', 'sent', NOW()
    FROM supplier_profiles sp WHERE sp.id = v_quote.supplier_id;

    RETURN jsonb_build_object('quote_id', p_quote_id, 'status', 'rejected');
END;
$$;

COMMENT ON FUNCTION public.reject_quote(UUID, TEXT) IS
    'Buyer của RFQ từ chối một báo giá đang chờ / đang thương lượng (kế hoạch
     5.7). Xưởng nhận thông báo và được gửi báo giá mới nếu RFQ còn mở.';

REVOKE ALL ON FUNCTION public.reject_quote(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_quote(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.accept_quote(UUID, UUID) IS
    'Gọi qua Edge Function accept-quote. Atomic: accept 1 quote + reject các
     quote còn lại + tạo orders (chép địa chỉ giao hàng từ buyer_addresses) +
     chuyển rfq_requests.status = awarded, trong đúng 1 transaction. Giá chốt
     là rfq_quotes.unit_price = đề nghị mới nhất của xưởng (5.7).';

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — rfq_quote_revisions, counter_quote(), reject_quote()';
END $$;

COMMIT;
