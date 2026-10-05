-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 3.6: thao tác của admin đi qua hàm admin_*, có nhật ký.
--
-- Trước đây web admin UPDATE thẳng orders / users / verifications / disputes:
-- không ghi lại ai làm gì, không kiểm tra số tiền, và khi ghi tranh chấp thì
-- raised_by luôn bị gán id của buyer kể cả khi xưởng mới là bên báo.
--
--   orders.paid_amount, orders.paid_at   Số tiền và thời điểm sàn thực nhận.
--       Chỉ admin_confirm_payment() ghi được (kể cả admin cũng không sửa
--       thẳng qua API).
--   admin_confirm_payment(order, amount, paid_at, method, reference, note)
--       pending_payment → confirmed. Số tiền khác tổng đơn thì bắt buộc ghi
--       chú giải thích.
--   admin_set_user_status(user, status, reason)   Khoá / mở khoá tài khoản.
--       Không tự khoá mình, không khoá admin khác; khoá phải có lý do và gửi
--       thông báo account_suspended.
--   admin_review_verification(verification, approve, reason)   Duyệt / từ
--       chối hồ sơ đang chờ; từ chối phải có lý do. Thông báo + verified_at
--       vẫn do trigger sẵn có lo.
--   admin_open_dispute(order, reason, reporter)   Ghi tranh chấp.
--       disputes.reporter_role = bên báo ('buyer' | 'supplier'), raised_by =
--       tài khoản của đúng bên đó, created_by = admin nhập. Mỗi đơn chỉ 1
--       tranh chấp đang mở.
--   Mọi hàm ghi admin_audit_log qua log_admin_action().
--
-- Mở rộng trước, thu hẹp sau: các quy tắc UPDATE thẳng của admin (orders,
-- users, verifications, disputes) CHƯA bị gỡ ở migration này để web bản cũ
-- vẫn chạy trong lúc deploy. Gỡ ở một migration sau khi web mới đã lên.
--
-- Mã lỗi: FORBIDDEN_NOT_ADMIN, ORDER_NOT_FOUND, ORDER_NOT_PENDING_PAYMENT,
--   INVALID_PAYMENT, PAYMENT_AMOUNT_MISMATCH, USER_NOT_FOUND, INVALID_STATUS,
--   CANNOT_CHANGE_SELF, CANNOT_SUSPEND_ADMIN, REASON_REQUIRED,
--   VERIFICATION_NOT_FOUND, VERIFICATION_NOT_PENDING, DISPUTE_ALREADY_OPEN,
--   INVALID_REPORTER, FORBIDDEN_ORDER_FIELD_CHANGE (sửa thẳng paid_*).
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_confirm_payment') THEN
        RAISE EXCEPTION 'admin_confirm_payment() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_admin_action') THEN
        RAISE EXCEPTION 'Thiếu log_admin_action(). Chạy 20261005091700 (3.1) trước.';
    END IF;
    IF to_regclass('public.disputes') IS NULL THEN
        RAISE EXCEPTION 'Thiếu bảng disputes. Chạy 20260930090200 trước.';
    END IF;
END $$;

-- Dùng chung: người gọi phải là admin đang hoạt động.
CREATE FUNCTION public.assert_admin()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_admin() OR NOT public.is_active_user() THEN
        RAISE EXCEPTION 'FORBIDDEN_NOT_ADMIN';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_admin() FROM PUBLIC, anon, authenticated;

-- ── Thanh toán ──────────────────────────────────────────────────────────
ALTER TABLE public.orders
    ADD COLUMN paid_amount DECIMAL(14,2) CHECK (paid_amount IS NULL OR paid_amount > 0),
    ADD COLUMN paid_at     TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.paid_amount IS 'Số tiền sàn thực nhận — chỉ admin_confirm_payment() ghi.';
COMMENT ON COLUMN public.orders.paid_at     IS 'Thời điểm tiền về tài khoản sàn — chỉ admin_confirm_payment() ghi.';

-- Không ai sửa thẳng paid_* qua API, kể cả admin (phải qua hàm để có nhật ký).
CREATE FUNCTION public.guard_order_payment_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user = 'authenticated' AND (
           NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
        OR NEW.paid_at     IS DISTINCT FROM OLD.paid_at
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_ORDER_FIELD_CHANGE'
            USING DETAIL = 'Số tiền/thời điểm đã nhận chỉ ghi qua admin_confirm_payment().';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_order_payment_columns
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_order_payment_columns();

CREATE FUNCTION public.admin_confirm_payment(
    p_order_id    UUID,
    p_paid_amount NUMERIC,
    p_paid_at     TIMESTAMPTZ DEFAULT NULL,
    p_method      TEXT DEFAULT NULL,
    p_reference   TEXT DEFAULT NULL,
    p_note        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order   orders%ROWTYPE;
    v_paid_at TIMESTAMPTZ := COALESCE(p_paid_at, NOW());
    v_method  TEXT := NULLIF(btrim(COALESCE(p_method, '')), '');
    v_ref     TEXT := NULLIF(btrim(COALESCE(p_reference, '')), '');
    v_note    TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
    PERFORM public.assert_admin();

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF v_order.status <> 'pending_payment' THEN
        RAISE EXCEPTION 'ORDER_NOT_PENDING_PAYMENT'
            USING DETAIL = 'Đơn đang ở trạng thái ' || v_order.status || '.';
    END IF;
    IF p_paid_amount IS NULL OR p_paid_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_PAYMENT' USING DETAIL = 'Số tiền đã nhận phải lớn hơn 0.';
    END IF;
    IF v_paid_at > NOW() + INTERVAL '1 day' OR v_paid_at < v_order.created_at - INTERVAL '1 day' THEN
        RAISE EXCEPTION 'INVALID_PAYMENT'
            USING DETAIL = 'Thời điểm nhận tiền phải sau khi tạo đơn và không ở tương lai.';
    END IF;
    IF p_paid_amount <> v_order.total_amount AND v_note IS NULL THEN
        RAISE EXCEPTION 'PAYMENT_AMOUNT_MISMATCH'
            USING DETAIL = format('Đã nhận %s, tổng đơn %s — cần ghi chú giải thích.',
                                  p_paid_amount, v_order.total_amount);
    END IF;

    -- trg_handle_order_status_change tự ghi confirmed_at + event payment_confirmed.
    UPDATE orders
    SET status               = 'confirmed',
        payment_confirmed_by = auth.uid(),
        paid_amount          = p_paid_amount,
        paid_at              = v_paid_at,
        payment_note         = NULLIF(concat_ws(' · ',
                                   CASE WHEN v_method IS NOT NULL THEN 'Phương thức: ' || v_method END,
                                   CASE WHEN v_ref IS NOT NULL THEN 'Mã GD: ' || v_ref END,
                                   v_note), ''),
        updated_at           = NOW()
    WHERE id = p_order_id;

    PERFORM public.log_admin_action('order.confirm_payment', 'order', p_order_id::TEXT,
        jsonb_build_object('paid_amount', p_paid_amount, 'total_amount', v_order.total_amount,
                           'paid_at', v_paid_at, 'method', v_method, 'reference', v_ref, 'note', v_note));

    RETURN jsonb_build_object('order_id', p_order_id, 'status', 'confirmed',
                              'paid_amount', p_paid_amount, 'paid_at', v_paid_at);
END;
$$;

-- ── Khoá / mở khoá tài khoản ───────────────────────────────────────────
CREATE FUNCTION public.admin_set_user_status(p_user_id UUID, p_status TEXT, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user   users%ROWTYPE;
    v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
    PERFORM public.assert_admin();

    IF p_status IS NULL OR p_status NOT IN ('active', 'suspended') THEN
        RAISE EXCEPTION 'INVALID_STATUS';
    END IF;
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'CANNOT_CHANGE_SELF';
    END IF;

    SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'USER_NOT_FOUND';
    END IF;
    IF p_status = 'suspended' AND v_user.role = 'admin' THEN
        RAISE EXCEPTION 'CANNOT_SUSPEND_ADMIN';
    END IF;
    IF p_status = 'suspended' AND v_reason IS NULL THEN
        RAISE EXCEPTION 'REASON_REQUIRED' USING DETAIL = 'Khoá tài khoản phải ghi lý do.';
    END IF;

    IF v_user.status::TEXT <> p_status THEN
        UPDATE users SET status = p_status::user_status WHERE id = p_user_id;

        IF p_status = 'suspended' THEN
            INSERT INTO notifications (user_id, type, title, body, channel, status, sent_at)
            VALUES (p_user_id, 'account_suspended', 'Tài khoản của bạn đã bị tạm khóa',
                    'Lý do: ' || v_reason || '. Liên hệ hỗ trợ nếu bạn cần giải thích thêm.',
                    'in_app', 'sent', NOW());
        END IF;

        PERFORM public.log_admin_action(
            CASE p_status WHEN 'suspended' THEN 'user.suspend' ELSE 'user.reactivate' END,
            'user', p_user_id::TEXT,
            jsonb_build_object('old_status', v_user.status, 'new_status', p_status, 'reason', v_reason));
    END IF;

    RETURN jsonb_build_object('user_id', p_user_id, 'status', p_status);
END;
$$;

-- ── Duyệt hồ sơ xác minh ───────────────────────────────────────────────
CREATE FUNCTION public.admin_review_verification(
    p_verification_id UUID,
    p_approve         BOOLEAN,
    p_reason          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ver    verifications%ROWTYPE;
    v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
    v_status verification_status;
BEGIN
    PERFORM public.assert_admin();

    SELECT * INTO v_ver FROM verifications WHERE id = p_verification_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'VERIFICATION_NOT_FOUND';
    END IF;
    IF v_ver.status <> 'pending' THEN
        RAISE EXCEPTION 'VERIFICATION_NOT_PENDING'
            USING DETAIL = 'Hồ sơ đã được xử lý (' || v_ver.status || ').';
    END IF;
    IF p_approve IS NULL THEN
        RAISE EXCEPTION 'INVALID_STATUS';
    END IF;
    IF NOT p_approve AND v_reason IS NULL THEN
        RAISE EXCEPTION 'REASON_REQUIRED' USING DETAIL = 'Từ chối hồ sơ phải ghi lý do.';
    END IF;

    v_status := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;

    -- trg_handle_verification_status_change gửi thông báo + ghi verified_at của buyer.
    UPDATE verifications
    SET status           = v_status,
        verified_by      = auth.uid(),
        verified_at      = NOW(),
        rejection_reason = CASE WHEN p_approve THEN NULL ELSE v_reason END
    WHERE id = p_verification_id;

    PERFORM public.log_admin_action(
        CASE WHEN p_approve THEN 'verification.approve' ELSE 'verification.reject' END,
        'verification', p_verification_id::TEXT,
        jsonb_build_object('entity_type', v_ver.entity_type, 'entity_id', v_ver.entity_id,
                           'reason', v_reason));

    RETURN jsonb_build_object('verification_id', p_verification_id, 'status', v_status);
END;
$$;

-- ── Tranh chấp: sửa lỗi raised_by ──────────────────────────────────────
ALTER TABLE public.disputes
    ADD COLUMN reporter_role TEXT CHECK (reporter_role IN ('buyer', 'supplier')),
    ADD COLUMN created_by    UUID REFERENCES public.users(id);

COMMENT ON COLUMN public.disputes.raised_by     IS 'Tài khoản của bên báo tranh chấp (buyer hoặc xưởng — xem reporter_role).';
COMMENT ON COLUMN public.disputes.reporter_role IS 'Bên báo tranh chấp. NULL với dòng tạo trước 3.6 (khi đó raised_by luôn là buyer).';
COMMENT ON COLUMN public.disputes.created_by    IS 'Admin nhập tranh chấp vào hệ thống.';

CREATE FUNCTION public.admin_open_dispute(p_order_id UUID, p_reason TEXT, p_reporter TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reason   TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
    v_reporter UUID;
    v_id       UUID;
BEGIN
    PERFORM public.assert_admin();

    IF p_reporter IS NULL OR p_reporter NOT IN ('buyer', 'supplier') THEN
        RAISE EXCEPTION 'INVALID_REPORTER';
    END IF;
    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'REASON_REQUIRED' USING DETAIL = 'Tranh chấp phải ghi lý do.';
    END IF;

    SELECT CASE p_reporter WHEN 'buyer' THEN bp.user_id ELSE sp.user_id END
    INTO v_reporter
    FROM orders o
    JOIN buyer_profiles bp ON bp.id = o.buyer_id
    JOIN supplier_profiles sp ON sp.id = o.supplier_id
    WHERE o.id = p_order_id
    FOR UPDATE OF o;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF EXISTS (SELECT 1 FROM disputes WHERE order_id = p_order_id AND status <> 'resolved') THEN
        RAISE EXCEPTION 'DISPUTE_ALREADY_OPEN';
    END IF;

    -- trg_handle_dispute_insert gửi thông báo cho buyer + xưởng.
    INSERT INTO disputes (order_id, raised_by, reporter_role, created_by, reason)
    VALUES (p_order_id, v_reporter, p_reporter, auth.uid(), v_reason)
    RETURNING id INTO v_id;

    PERFORM public.log_admin_action('dispute.open', 'order', p_order_id::TEXT,
        jsonb_build_object('dispute_id', v_id, 'reporter_role', p_reporter, 'reason', v_reason));
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_confirm_payment(UUID, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_verification(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_open_dispute(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_payment(UUID, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_verification(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_open_dispute(UUID, TEXT, TEXT) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — admin_confirm_payment / admin_set_user_status / admin_review_verification / admin_open_dispute';
END $$;

COMMIT;
