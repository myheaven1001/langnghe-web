-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 3.6 (phần "thu hẹp sau"): admin không sửa thẳng dữ liệu qua API.
--
-- 20261005092000 đã thêm các hàm admin_* có nhật ký nhưng chưa gỡ đường cũ:
-- phiên đăng nhập admin vẫn UPDATE thẳng orders / users / verifications /
-- disputes qua REST API được, không để lại dòng nào trong admin_audit_log.
-- Web đã chuyển hết sang hàm, nên migration này đóng đường cũ:
--
--   orders          Admin (không phải buyer/xưởng của đơn) UPDATE thẳng →
--                   FORBIDDEN_ADMIN_DIRECT_WRITE. Dùng admin_confirm_payment()
--                   và admin_cancel_order() (mới).
--   users           Sửa dòng của người khác → FORBIDDEN_ADMIN_DIRECT_WRITE.
--                   Dùng admin_set_user_status(). Admin sửa dòng của chính
--                   mình thì chịu luật như mọi người (không đổi role, status
--                   chỉ pending → active).
--   verifications   Bỏ quy tắc verifications_update_admin → UPDATE thẳng
--                   không đổi dòng nào. Dùng admin_review_verification().
--   disputes        Bỏ disputes_insert_admin, disputes_update_admin. Dùng
--                   admin_open_dispute() và admin_resolve_dispute() (mới).
--
-- Không đổi: buyer/xưởng thao tác trên đơn của mình, hàm SECURITY DEFINER,
-- service_role, SQL Editor (cấp admin đầu tiên vẫn làm trong SQL Editor).
--
-- Thứ tự deploy: migration này → web (nút "Xử lý tranh chấp" bản cũ ghi
-- thẳng disputes sẽ không lưu được trong vài phút giữa hai bước).
--
-- Mã lỗi mới: FORBIDDEN_ADMIN_DIRECT_WRITE, DISPUTE_NOT_FOUND,
--   DISPUTE_ALREADY_RESOLVED, INVALID_RESOLUTION. admin_cancel_order dùng lại
--   ORDER_CANCEL_REASON_REQUIRED và FORBIDDEN_ORDER_STATUS_CHANGE của 1.3.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_cancel_order') THEN
        RAISE EXCEPTION 'admin_cancel_order() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'assert_admin') THEN
        RAISE EXCEPTION 'Thiếu assert_admin(). Chạy 20261005092000 (3.6) trước.';
    END IF;
END $$;

-- ── Hàm mới: huỷ đơn ───────────────────────────────────────────────────
CREATE FUNCTION public.admin_cancel_order(p_order_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order  orders%ROWTYPE;
    v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
    PERFORM public.assert_admin();

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF v_order.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'FORBIDDEN_ORDER_STATUS_CHANGE'
            USING DETAIL = 'Không huỷ được đơn đã hoàn tất hoặc đã huỷ.';
    END IF;
    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'ORDER_CANCEL_REASON_REQUIRED' USING DETAIL = 'Huỷ đơn phải ghi lý do.';
    END IF;

    -- trg_handle_order_status_change tự ghi event cancelled.
    UPDATE orders
    SET status = 'cancelled', cancel_reason = v_reason, updated_at = NOW()
    WHERE id = p_order_id;

    PERFORM public.log_admin_action('order.cancel', 'order', p_order_id::TEXT,
        jsonb_build_object('old_status', v_order.status, 'reason', v_reason));

    RETURN jsonb_build_object('order_id', p_order_id, 'status', 'cancelled');
END;
$$;

-- ── Hàm mới: giải quyết tranh chấp ─────────────────────────────────────
CREATE FUNCTION public.admin_resolve_dispute(
    p_dispute_id   UUID,
    p_resolution   TEXT,
    p_refund_ratio NUMERIC DEFAULT NULL,
    p_note         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dispute disputes%ROWTYPE;
    v_note    TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
    v_ratio   NUMERIC;
BEGIN
    PERFORM public.assert_admin();

    SELECT * INTO v_dispute FROM disputes WHERE id = p_dispute_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DISPUTE_NOT_FOUND';
    END IF;
    IF v_dispute.status = 'resolved' THEN
        RAISE EXCEPTION 'DISPUTE_ALREADY_RESOLVED';
    END IF;
    IF p_resolution IS NULL OR p_resolution NOT IN ('release_supplier', 'refund_buyer', 'partial') THEN
        RAISE EXCEPTION 'INVALID_RESOLUTION';
    END IF;
    IF p_resolution = 'partial' THEN
        IF p_refund_ratio IS NULL OR p_refund_ratio < 0 OR p_refund_ratio > 1 THEN
            RAISE EXCEPTION 'INVALID_RESOLUTION'
                USING DETAIL = 'Chia tỷ lệ cần phần hoàn cho buyer từ 0 đến 1.';
        END IF;
        v_ratio := p_refund_ratio;
    END IF;

    -- trg_handle_dispute_update gửi thông báo cho buyer + xưởng.
    UPDATE disputes
    SET status          = 'resolved',
        resolution      = p_resolution::dispute_resolution,
        refund_ratio    = v_ratio,
        resolution_note = v_note,
        resolved_by     = auth.uid(),
        resolved_at     = NOW()
    WHERE id = p_dispute_id;

    PERFORM public.log_admin_action('dispute.resolve', 'order', v_dispute.order_id::TEXT,
        jsonb_build_object('dispute_id', p_dispute_id, 'resolution', p_resolution,
                           'refund_ratio', v_ratio, 'note', v_note));

    RETURN jsonb_build_object('dispute_id', p_dispute_id, 'status', 'resolved');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_order(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_dispute(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_order(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- ── orders: admin không UPDATE thẳng ───────────────────────────────────
-- Gộp vào trigger sẵn có của 3.6 (giữ nguyên phần chặn sửa paid_*).
CREATE OR REPLACE FUNCTION public.guard_order_payment_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;

    IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
        RAISE EXCEPTION 'FORBIDDEN_ORDER_FIELD_CHANGE'
            USING DETAIL = 'Số tiền/thời điểm đã nhận chỉ ghi qua admin_confirm_payment().';
    END IF;

    IF public.is_admin()
       AND NOT EXISTS (SELECT 1 FROM buyer_profiles
                       WHERE id = OLD.buyer_id AND user_id = auth.uid())
       AND NOT EXISTS (SELECT 1 FROM supplier_profiles
                       WHERE id = OLD.supplier_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'FORBIDDEN_ADMIN_DIRECT_WRITE'
            USING DETAIL = 'Admin sửa đơn qua admin_confirm_payment() / admin_cancel_order().';
    END IF;

    RETURN NEW;
END;
$$;

-- ── users: không sửa thẳng dòng của người khác ─────────────────────────
-- Thay bản 20261001090200: trước đây admin "qua tự do".
CREATE OR REPLACE FUNCTION public.guard_users_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;

    -- RLS chỉ cho admin chạm tới dòng của người khác.
    IF OLD.id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'FORBIDDEN_ADMIN_DIRECT_WRITE'
            USING DETAIL = 'Khoá/mở khoá tài khoản qua admin_set_user_status().';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_CHANGE';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'pending' AND NEW.status = 'active') THEN
        RAISE EXCEPTION 'FORBIDDEN_STATUS_CHANGE';
    END IF;

    RETURN NEW;
END;
$$;

-- ── verifications, disputes: bỏ quy tắc ghi của admin ──────────────────
DROP POLICY verifications_update_admin ON public.verifications;
DROP POLICY disputes_insert_admin ON public.disputes;
DROP POLICY disputes_update_admin ON public.disputes;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — admin chỉ ghi qua hàm admin_* (thêm admin_cancel_order, admin_resolve_dispute)';
END $$;

COMMIT;
