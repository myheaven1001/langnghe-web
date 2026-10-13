-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Bước 6 (Tài chính): sổ tiền sàn trả cho xưởng + đối soát.
--
-- Quyết định (câu hỏi 1): tiền hàng vẫn đi qua tài khoản của sàn. Đến nay hệ
-- thống mới ghi chiều VÀO (admin_confirm_payment) và chiều hoàn cho buyer
-- (refunds); chiều sàn TRẢ xưởng chưa có sổ.
--
--   supplier_payout_accounts   Tài khoản ngân hàng nhận tiền của xưởng (xưởng
--       tự khai; chỉ xưởng đó và admin đọc được).
--   supplier_payouts   Mỗi đơn hoàn tất sinh một khoản phải trả xưởng:
--         gross  = số tiền sàn đã thu của đơn
--         refund = tổng tiền đã ghi hoàn cho buyer của đơn đó
--         fee    = phí sàn = commission_percent × (gross − refund), làm tròn đồng
--         net    = gross − refund − fee
--       Trigger tạo khi đơn chuyển 'completed' (kể cả tự hoàn tất). Đơn đã
--       hoàn tất từ trước được điền lại với phí 0. Sàn chuyển khoản ngoài hệ
--       thống rồi admin_mark_payout_paid() ghi mã giao dịch → xưởng nhận
--       thông báo payout_paid.
--   platform_settings.commission_percent   Phí sàn (%), mặc định 0, admin sửa
--       ở /admin/settings (0–30). Chỉ áp cho khoản phát sinh sau khi đổi.
--   admin_finance_summary()   Đối soát: đã thu, đã hoàn / chờ hoàn, đã trả /
--       chờ trả xưởng, phí sàn, tiền đang giữ của đơn chưa hoàn tất, và số dư
--       lẽ ra phải có trong tài khoản sàn.
--   supplier_finance_summary()   Số liệu của một xưởng: đang được sàn giữ,
--       chờ sàn trả, đã nhận.
--
-- Mã lỗi: FORBIDDEN_NOT_ADMIN, PAYOUT_NOT_FOUND, PAYOUT_ALREADY_PAID,
--         REASON_REQUIRED, NOT_A_SUPPLIER, INVALID_ACCOUNT, INVALID_SETTING.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.supplier_payouts') IS NOT NULL THEN
        RAISE EXCEPTION 'supplier_payouts đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF to_regclass('public.refunds') IS NULL THEN
        RAISE EXCEPTION 'Thiếu refunds. Chạy 20261005093700 trước.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'notification_type' AND e.enumlabel = 'payout_paid'
    ) THEN
        RAISE EXCEPTION 'notification_type thiếu payout_paid. Chạy 20261005094500 trước.';
    END IF;
END $$;

-- ── Phí sàn ────────────────────────────────────────────────────────────
INSERT INTO public.platform_settings (key, value, audience, description) VALUES
    ('commission_percent', '0', 'authenticated',
     'Phí sàn (%) trừ vào tiền trả xưởng khi đơn hoàn tất. 0 = không thu phí.');

-- admin_set_setting(): thêm kiểm tra cho khoá mới (phần còn lại như 20261005093500).
CREATE OR REPLACE FUNCTION public.admin_set_setting(p_key TEXT, p_value JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old   JSONB;
    v_value JSONB := p_value;
    v_days  INT;
BEGIN
    IF NOT public.is_admin() OR NOT public.is_active_user() THEN
        RAISE EXCEPTION 'FORBIDDEN_NOT_ADMIN';
    END IF;

    SELECT value INTO v_old FROM platform_settings WHERE key = p_key FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNKNOWN_SETTING' USING DETAIL = p_key;
    END IF;

    IF p_key = 'payment_account' THEN
        IF jsonb_typeof(v_value) <> 'object'
           OR COALESCE(btrim(v_value->>'bank_name'), '') = ''
           OR COALESCE(btrim(v_value->>'account_holder'), '') = ''
           OR COALESCE(v_value->>'account_number', '') !~ '^[0-9 ]{6,30}$' THEN
            RAISE EXCEPTION 'INVALID_SETTING'
                USING DETAIL = 'Cần tên ngân hàng, chủ tài khoản và số tài khoản (6–30 chữ số).';
        END IF;
        v_value := jsonb_build_object(
            'bank_name',      btrim(v_value->>'bank_name'),
            'account_number', replace(v_value->>'account_number', ' ', ''),
            'account_holder', btrim(v_value->>'account_holder'),
            'branch',         COALESCE(btrim(v_value->>'branch'), ''),
            'note',           COALESCE(btrim(v_value->>'note'), ''));
    ELSIF p_key = 'order_auto_complete_days' THEN
        IF jsonb_typeof(v_value) <> 'number' OR (v_value #>> '{}') !~ '^[0-9]+$' THEN
            RAISE EXCEPTION 'INVALID_SETTING' USING DETAIL = 'Số ngày phải là số nguyên.';
        END IF;
        v_days := (v_value #>> '{}')::INT;
        IF v_days < 1 OR v_days > 60 THEN
            RAISE EXCEPTION 'INVALID_SETTING' USING DETAIL = 'Số ngày phải từ 1 đến 60.';
        END IF;
    ELSIF p_key = 'order_confirmation_days' THEN
        IF jsonb_typeof(v_value) <> 'number' OR (v_value #>> '{}') !~ '^[0-9]+$' THEN
            RAISE EXCEPTION 'INVALID_SETTING' USING DETAIL = 'Số ngày phải là số nguyên.';
        END IF;
        v_days := (v_value #>> '{}')::INT;
        IF v_days < 1 OR v_days > 14 THEN
            RAISE EXCEPTION 'INVALID_SETTING' USING DETAIL = 'Số ngày phải từ 1 đến 14.';
        END IF;
    ELSIF p_key = 'commission_percent' THEN
        IF jsonb_typeof(v_value) <> 'number'
           OR (v_value #>> '{}')::NUMERIC < 0 OR (v_value #>> '{}')::NUMERIC > 30 THEN
            RAISE EXCEPTION 'INVALID_SETTING' USING DETAIL = 'Phí sàn từ 0 đến 30 (%).';
        END IF;
        v_value := to_jsonb(round((v_value #>> '{}')::NUMERIC, 2));
    ELSIF p_key = 'support_contact' THEN
        IF jsonb_typeof(v_value) <> 'object' THEN
            RAISE EXCEPTION 'INVALID_SETTING' USING DETAIL = 'Kênh hỗ trợ phải là một đối tượng.';
        END IF;
        v_value := jsonb_build_object(
            'phone', COALESCE(btrim(v_value->>'phone'), ''),
            'zalo',  COALESCE(btrim(v_value->>'zalo'), ''),
            'email', COALESCE(btrim(v_value->>'email'), ''),
            'hours', COALESCE(btrim(v_value->>'hours'), ''));
    END IF;

    UPDATE platform_settings
    SET value = v_value, updated_at = NOW(), updated_by = auth.uid()
    WHERE key = p_key;

    PERFORM public.log_admin_action('setting.update', 'setting', p_key,
                                    jsonb_build_object('old', v_old, 'new', v_value));
    RETURN v_value;
END;
$$;


-- ── Tài khoản nhận tiền của xưởng ──────────────────────────────────────
CREATE TABLE public.supplier_payout_accounts (
    supplier_id    UUID        PRIMARY KEY REFERENCES public.supplier_profiles(id) ON DELETE CASCADE,
    bank_name      TEXT        NOT NULL CHECK (char_length(btrim(bank_name)) BETWEEN 2 AND 100),
    account_number TEXT        NOT NULL CHECK (account_number ~ '^[0-9]{6,30}$'),
    account_holder TEXT        NOT NULL CHECK (char_length(btrim(account_holder)) BETWEEN 2 AND 100),
    branch         TEXT        CHECK (branch IS NULL OR char_length(branch) <= 100),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.supplier_payout_accounts IS
    'Tài khoản ngân hàng xưởng nhận tiền từ sàn (bước 6 — Tài chính). Ghi qua
     set_payout_account(); chỉ chính xưởng và admin đọc được.';

ALTER TABLE public.supplier_payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payout_accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY supplier_payout_accounts_select ON public.supplier_payout_accounts
    FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (SELECT 1 FROM public.supplier_profiles sp
                   WHERE sp.id = supplier_payout_accounts.supplier_id AND sp.user_id = auth.uid())
    );

REVOKE ALL ON public.supplier_payout_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.supplier_payout_accounts TO authenticated;

CREATE FUNCTION public.set_payout_account(
    p_bank_name      TEXT,
    p_account_number TEXT,
    p_account_holder TEXT,
    p_branch         TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier UUID;
    v_number   TEXT := regexp_replace(COALESCE(p_account_number, ''), '\s', '', 'g');
BEGIN
    SELECT id INTO v_supplier FROM supplier_profiles WHERE user_id = auth.uid();
    IF v_supplier IS NULL THEN
        RAISE EXCEPTION 'NOT_A_SUPPLIER';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;
    IF char_length(btrim(COALESCE(p_bank_name, ''))) NOT BETWEEN 2 AND 100
       OR char_length(btrim(COALESCE(p_account_holder, ''))) NOT BETWEEN 2 AND 100
       OR v_number !~ '^[0-9]{6,30}$'
       OR char_length(COALESCE(p_branch, '')) > 100 THEN
        RAISE EXCEPTION 'INVALID_ACCOUNT'
            USING DETAIL = 'Cần tên ngân hàng, chủ tài khoản và số tài khoản 6–30 chữ số.';
    END IF;

    INSERT INTO supplier_payout_accounts (supplier_id, bank_name, account_number, account_holder, branch)
    VALUES (v_supplier, btrim(p_bank_name), v_number, btrim(p_account_holder),
            NULLIF(btrim(COALESCE(p_branch, '')), ''))
    ON CONFLICT (supplier_id) DO UPDATE
    SET bank_name = EXCLUDED.bank_name, account_number = EXCLUDED.account_number,
        account_holder = EXCLUDED.account_holder, branch = EXCLUDED.branch, updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.set_payout_account(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_payout_account(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── Sổ tiền trả xưởng ──────────────────────────────────────────────────
CREATE TABLE public.supplier_payouts (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id   UUID          NOT NULL REFERENCES public.supplier_profiles(id),
    order_id      UUID          NOT NULL UNIQUE REFERENCES public.orders(id),
    gross_amount  DECIMAL(16,2) NOT NULL CHECK (gross_amount >= 0),
    refund_amount DECIMAL(16,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
    fee_percent   DECIMAL(5,2)  NOT NULL DEFAULT 0 CHECK (fee_percent BETWEEN 0 AND 30),
    fee_amount    DECIMAL(16,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
    net_amount    DECIMAL(16,2) NOT NULL CHECK (net_amount >= 0),
    status        TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    bank_ref      TEXT,
    note          TEXT,
    paid_by       UUID          REFERENCES public.users(id),
    paid_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payout_paid CHECK (status <> 'paid' OR (paid_by IS NOT NULL AND paid_at IS NOT NULL)),
    CONSTRAINT chk_payout_math CHECK (net_amount = gross_amount - refund_amount - fee_amount)
);

CREATE INDEX idx_payouts_supplier ON public.supplier_payouts (supplier_id, created_at DESC);
CREATE INDEX idx_payouts_pending  ON public.supplier_payouts (created_at) WHERE status = 'pending';

COMMENT ON TABLE public.supplier_payouts IS
    'Khoản sàn phải trả xưởng cho mỗi đơn hoàn tất (bước 6 — Tài chính). Trigger
     trg_create_supplier_payout tạo; admin_mark_payout_paid() đánh dấu đã chuyển.';

ALTER TABLE public.supplier_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payouts FORCE ROW LEVEL SECURITY;

CREATE POLICY supplier_payouts_select ON public.supplier_payouts
    FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (SELECT 1 FROM public.supplier_profiles sp
                   WHERE sp.id = supplier_payouts.supplier_id AND sp.user_id = auth.uid())
    );

REVOKE ALL ON public.supplier_payouts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.supplier_payouts TO authenticated;

-- Tính và ghi khoản phải trả của một đơn (bỏ qua nếu đã có). p_fee_percent
-- NULL = lấy phí sàn hiện hành.
CREATE FUNCTION public.create_supplier_payout(p_order_id UUID, p_fee_percent NUMERIC DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order  orders%ROWTYPE;
    v_gross  NUMERIC;
    v_refund NUMERIC;
    v_rate   NUMERIC;
    v_fee    NUMERIC;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND OR v_order.status <> 'completed' THEN
        RETURN;
    END IF;

    v_gross := COALESCE(v_order.paid_amount, v_order.total, 0);
    SELECT COALESCE(sum(amount), 0) INTO v_refund FROM refunds WHERE order_id = p_order_id;
    v_refund := LEAST(v_refund, v_gross);

    IF p_fee_percent IS NOT NULL THEN
        v_rate := p_fee_percent;
    ELSE
        BEGIN
            v_rate := (public.get_setting('commission_percent') #>> '{}')::NUMERIC;
        EXCEPTION WHEN OTHERS THEN
            v_rate := 0;
        END;
    END IF;
    v_rate := LEAST(GREATEST(COALESCE(v_rate, 0), 0), 30);
    v_fee := round((v_gross - v_refund) * v_rate / 100);

    INSERT INTO supplier_payouts (supplier_id, order_id, gross_amount, refund_amount,
                                  fee_percent, fee_amount, net_amount)
    VALUES (v_order.supplier_id, p_order_id, v_gross, v_refund, v_rate, v_fee,
            v_gross - v_refund - v_fee)
    ON CONFLICT (order_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_payout(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.trg_create_supplier_payout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.create_supplier_payout(NEW.id);
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_create_supplier_payout() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_create_supplier_payout
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW
    WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
    EXECUTE FUNCTION public.trg_create_supplier_payout();

-- Đơn đã hoàn tất từ trước: ghi khoản phải trả với phí 0 (lúc đó chưa có phí sàn).
DO $$
DECLARE
    v_id UUID;
    v_n  INT := 0;
BEGIN
    FOR v_id IN SELECT id FROM public.orders WHERE status = 'completed' LOOP
        PERFORM public.create_supplier_payout(v_id, 0);
        v_n := v_n + 1;
    END LOOP;
    RAISE NOTICE 'Đã ghi khoản phải trả cho % đơn hoàn tất từ trước.', v_n;
END $$;

-- Hoàn tiền ghi SAU khi đơn đã hoàn tất (admin mở tranh chấp muộn): khoản phải
-- trả chưa chuyển được tính lại; khoản đã chuyển thì giữ nguyên (sàn tự thu hồi).
CREATE FUNCTION public.trg_refund_adjust_payout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE supplier_payouts p
    SET refund_amount = r.refund,
        fee_amount    = round((p.gross_amount - r.refund) * p.fee_percent / 100),
        net_amount    = p.gross_amount - r.refund - round((p.gross_amount - r.refund) * p.fee_percent / 100)
    FROM (SELECT LEAST(COALESCE(sum(x.amount), 0),
                       (SELECT gross_amount FROM supplier_payouts WHERE order_id = NEW.order_id)) AS refund
          FROM refunds x WHERE x.order_id = NEW.order_id) r
    WHERE p.order_id = NEW.order_id AND p.status = 'pending';
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_refund_adjust_payout() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_refund_adjust_payout
    AFTER INSERT ON public.refunds
    FOR EACH ROW EXECUTE FUNCTION public.trg_refund_adjust_payout();

CREATE FUNCTION public.admin_mark_payout_paid(p_payout_id UUID, p_bank_ref TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payout supplier_payouts%ROWTYPE;
    v_ref    TEXT := NULLIF(btrim(COALESCE(p_bank_ref, '')), '');
    v_note   TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
    PERFORM public.assert_admin();

    SELECT * INTO v_payout FROM supplier_payouts WHERE id = p_payout_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYOUT_NOT_FOUND';
    END IF;
    IF v_payout.status = 'paid' THEN
        RAISE EXCEPTION 'PAYOUT_ALREADY_PAID';
    END IF;
    IF v_ref IS NULL OR char_length(v_ref) > 100 THEN
        RAISE EXCEPTION 'REASON_REQUIRED' USING DETAIL = 'Cần mã giao dịch chuyển khoản (tối đa 100 ký tự).';
    END IF;

    UPDATE supplier_payouts
    SET status = 'paid', bank_ref = v_ref, note = left(v_note, 500), paid_by = auth.uid(), paid_at = NOW()
    WHERE id = p_payout_id;

    INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
    SELECT sp.user_id, 'payout_paid',
           'Sàn đã chuyển tiền đơn #' || UPPER(LEFT(v_payout.order_id::TEXT, 8)),
           'Số tiền: ' || replace(to_char(round(v_payout.net_amount), 'FM999,999,999,999'), ',', '.')
               || 'đ · Mã giao dịch: ' || v_ref,
           jsonb_build_object('order_id', v_payout.order_id, 'payout_id', p_payout_id),
           'in_app', 'sent', NOW()
    FROM supplier_profiles sp WHERE sp.id = v_payout.supplier_id;

    PERFORM public.log_admin_action('payout.paid', 'order', v_payout.order_id::TEXT,
        jsonb_build_object('payout_id', p_payout_id, 'supplier_id', v_payout.supplier_id,
                           'net_amount', v_payout.net_amount, 'bank_ref', v_ref));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_payout_paid(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(UUID, TEXT, TEXT) TO authenticated;

-- ── Đối soát ───────────────────────────────────────────────────────────
-- Đơn "đang giữ tiền" = sàn đã thu nhưng đơn chưa hoàn tất và chưa huỷ.
CREATE FUNCTION public.admin_finance_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_collected NUMERIC;
    v_refunded  NUMERIC;
    v_paid_out  NUMERIC;
BEGIN
    PERFORM public.assert_admin();

    SELECT COALESCE(sum(COALESCE(paid_amount, total)), 0) INTO v_collected
    FROM orders WHERE paid_at IS NOT NULL OR confirmed_at IS NOT NULL;
    SELECT COALESCE(sum(amount), 0) INTO v_refunded FROM refunds WHERE status = 'paid';
    SELECT COALESCE(sum(net_amount), 0) INTO v_paid_out FROM supplier_payouts WHERE status = 'paid';

    RETURN jsonb_build_object(
        'collected',       v_collected,
        'refunded',        v_refunded,
        'refund_pending',  (SELECT COALESCE(sum(amount), 0) FROM refunds WHERE status = 'pending'),
        'paid_out',        v_paid_out,
        'payout_pending',  (SELECT COALESCE(sum(net_amount), 0) FROM supplier_payouts WHERE status = 'pending'),
        'payout_pending_count', (SELECT count(*) FROM supplier_payouts WHERE status = 'pending'),
        'fees',            (SELECT COALESCE(sum(fee_amount), 0) FROM supplier_payouts),
        'held_in_progress', (SELECT COALESCE(sum(COALESCE(paid_amount, total)), 0) FROM orders
                             WHERE status IN ('confirmed', 'producing', 'shipped', 'delivered')),
        'expected_balance', v_collected - v_refunded - v_paid_out);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_finance_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_finance_summary() TO authenticated;

CREATE FUNCTION public.supplier_finance_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier UUID;
BEGIN
    SELECT id INTO v_supplier FROM supplier_profiles WHERE user_id = auth.uid();
    IF v_supplier IS NULL THEN
        RAISE EXCEPTION 'NOT_A_SUPPLIER';
    END IF;

    RETURN jsonb_build_object(
        'held_in_progress', (SELECT COALESCE(sum(COALESCE(paid_amount, total)), 0) FROM orders
                             WHERE supplier_id = v_supplier
                               AND status IN ('confirmed', 'producing', 'shipped', 'delivered')),
        'payout_pending',   (SELECT COALESCE(sum(net_amount), 0) FROM supplier_payouts
                             WHERE supplier_id = v_supplier AND status = 'pending'),
        'paid_out',         (SELECT COALESCE(sum(net_amount), 0) FROM supplier_payouts
                             WHERE supplier_id = v_supplier AND status = 'paid'),
        'fees',             (SELECT COALESCE(sum(fee_amount), 0) FROM supplier_payouts
                             WHERE supplier_id = v_supplier),
        'commission_percent', COALESCE((public.get_setting('commission_percent') #>> '{}')::NUMERIC, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_finance_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supplier_finance_summary() TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — supplier_payouts, supplier_payout_accounts, commission_percent, admin_mark_payout_paid(), admin_finance_summary(), supplier_finance_summary()';
END $$;

COMMIT;
