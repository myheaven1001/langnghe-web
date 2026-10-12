-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 5.8: buyer / xưởng tự mở tranh chấp, trao đổi trong tranh chấp,
-- admin giải quyết có tác động lên đơn và ghi khoản hoàn tiền.
--
-- Trước đây tranh chấp chỉ do admin nhập hộ (admin_open_dispute) và "giải
-- quyết" chỉ là ghi chú: đơn không đổi, tiền hoàn không có sổ.
--
--   open_dispute(order, reason)   Buyer hoặc xưởng của đơn tự mở. Chỉ đơn đã
--       thanh toán và chưa xong (confirmed / producing / shipped / delivered);
--       mỗi đơn một tranh chấp đang mở; lý do 10–1000 ký tự.
--   dispute_messages   Trao đổi trong tranh chấp giữa buyer, xưởng, admin;
--       kèm được 1 file (bucket riêng tư `dispute-files`, thư mục = id tranh
--       chấp). Ghi qua add_dispute_message(); client chỉ đọc. Admin trả lời
--       lần đầu thì tranh chấp chuyển 'investigating'. Bên còn lại nhận
--       thông báo dispute_reply.
--   refunds   Sổ khoản hoàn tiền cho buyer (pending → paid). Sàn chuyển
--       khoản thủ công; admin_mark_refund_paid() ghi lại mã giao dịch.
--   admin_resolve_dispute()   Giữ chữ ký cũ, thêm tác động:
--       refund_buyer     → đơn huỷ, ghi khoản hoàn = số tiền đã thu;
--       partial          → ghi khoản hoàn = tỷ lệ × số tiền đã thu, đơn giữ
--                          nguyên trạng thái;
--       release_supplier → không hoàn, đơn giữ nguyên.
--   Đơn đang có tranh chấp mở thì buyer / xưởng không chuyển trạng thái đơn
--       được (ORDER_IN_DISPUTE) — tránh "hoàn tất đơn" khi đang tranh chấp.
--
-- Mã lỗi: NOT_AUTHENTICATED, ACCOUNT_SUSPENDED, ORDER_NOT_FOUND,
--         ORDER_NOT_DISPUTABLE, DISPUTE_ALREADY_OPEN, REASON_REQUIRED,
--         DISPUTE_NOT_FOUND, DISPUTE_ALREADY_RESOLVED, INVALID_MESSAGE,
--         INVALID_ATTACHMENT, DISPUTE_MESSAGE_LIMIT, ORDER_IN_DISPUTE,
--         REFUND_NOT_FOUND, REFUND_ALREADY_PAID, INVALID_RESOLUTION.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.dispute_messages') IS NOT NULL THEN
        RAISE EXCEPTION 'dispute_messages đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF to_regprocedure('public.order_role(uuid)') IS NULL THEN
        RAISE EXCEPTION 'Thiếu order_role(). Chạy 20261005091900 (3.3) trước.';
    END IF;
    IF to_regprocedure('public.admin_resolve_dispute(uuid, text, numeric, text)') IS NULL THEN
        RAISE EXCEPTION 'Thiếu admin_resolve_dispute(). Chạy 20261005092200 trước.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'notification_type' AND e.enumlabel = 'dispute_reply'
    ) THEN
        RAISE EXCEPTION 'notification_type thiếu dispute_reply. Chạy 20261005093200 trước.';
    END IF;
END $$;

-- ── Buyer / xưởng tự mở tranh chấp ─────────────────────────────────────
CREATE FUNCTION public.open_dispute(p_order_id UUID, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
    v_role   TEXT;
    v_status order_status;
    v_id     UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;

    SELECT CASE WHEN bp.user_id = auth.uid() THEN 'buyer'
                WHEN sp.user_id = auth.uid() THEN 'supplier' END,
           o.status
    INTO v_role, v_status
    FROM orders o
    JOIN buyer_profiles bp ON bp.id = o.buyer_id
    JOIN supplier_profiles sp ON sp.id = o.supplier_id
    WHERE o.id = p_order_id
    FOR UPDATE OF o;
    IF NOT FOUND OR v_role IS NULL THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF v_status NOT IN ('confirmed', 'producing', 'shipped', 'delivered') THEN
        RAISE EXCEPTION 'ORDER_NOT_DISPUTABLE'
            USING DETAIL = 'Chỉ mở tranh chấp cho đơn đã thanh toán và chưa hoàn tất.';
    END IF;
    IF v_reason IS NULL OR char_length(v_reason) < 10 OR char_length(v_reason) > 1000 THEN
        RAISE EXCEPTION 'REASON_REQUIRED' USING DETAIL = 'Lý do dài 10–1000 ký tự.';
    END IF;
    IF EXISTS (SELECT 1 FROM disputes WHERE order_id = p_order_id AND status <> 'resolved') THEN
        RAISE EXCEPTION 'DISPUTE_ALREADY_OPEN';
    END IF;

    -- trg_handle_dispute_insert gửi thông báo cho buyer + xưởng.
    INSERT INTO disputes (order_id, raised_by, reporter_role, created_by, reason)
    VALUES (p_order_id, auth.uid(), v_role, auth.uid(), v_reason)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_dispute(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_dispute(UUID, TEXT) TO authenticated;

COMMENT ON COLUMN public.disputes.created_by IS
    'Người nhập tranh chấp: admin (admin_open_dispute) hoặc chính bên báo (open_dispute — 5.8).';

-- Vai trò của người gọi với một tranh chấp: 'buyer' | 'supplier' | 'admin' | NULL.
CREATE FUNCTION public.dispute_role(p_dispute_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.order_role(d.order_id) FROM disputes d WHERE d.id = p_dispute_id;
$$;

REVOKE ALL ON FUNCTION public.dispute_role(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispute_role(UUID) TO authenticated;

-- ── Trao đổi trong tranh chấp ──────────────────────────────────────────
CREATE TABLE public.dispute_messages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id      UUID        NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
    sender_id       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    sender_role     TEXT        NOT NULL CHECK (sender_role IN ('buyer', 'supplier', 'admin')),
    body            TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    attachment_path TEXT        UNIQUE,   -- trong bucket dispute-files
    attachment_name TEXT        CHECK (attachment_name IS NULL OR char_length(attachment_name) <= 200),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_dispute_messages_dispute ON public.dispute_messages (dispute_id, created_at);

COMMENT ON TABLE public.dispute_messages IS
    'Trao đổi trong một tranh chấp (kế hoạch 5.8). Ghi qua add_dispute_message();
     buyer / xưởng của đơn và admin đọc được.';

ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY dispute_messages_select ON public.dispute_messages
    FOR SELECT TO authenticated
    USING (public.dispute_role(dispute_id) IS NOT NULL);

REVOKE ALL ON public.dispute_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.dispute_messages TO authenticated;

-- Bucket riêng tư cho bằng chứng; thư mục cấp 1 = id tranh chấp.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dispute-files', 'dispute-files', FALSE, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

CREATE FUNCTION public.can_access_dispute_file(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_folder TEXT := split_part(p_name, '/', 1);
BEGIN
    IF v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN FALSE;
    END IF;
    RETURN public.dispute_role(v_folder::UUID) IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_dispute_file(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_dispute_file(TEXT) TO authenticated;

CREATE POLICY dispute_files_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'dispute-files' AND public.can_access_dispute_file(name));
CREATE POLICY dispute_files_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'dispute-files' AND public.can_access_dispute_file(name));
-- Không có policy UPDATE/DELETE: bằng chứng đã tải không thay/xoá được qua API.

CREATE FUNCTION public.add_dispute_message(
    p_dispute_id      UUID,
    p_body            TEXT,
    p_attachment_path TEXT DEFAULT NULL,
    p_attachment_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dispute disputes%ROWTYPE;
    v_role    TEXT;
    v_body    TEXT := NULLIF(btrim(COALESCE(p_body, '')), '');
    v_path    TEXT := NULLIF(btrim(COALESCE(p_attachment_path, '')), '');
    v_name    TEXT := NULLIF(btrim(COALESCE(p_attachment_name, '')), '');
    v_id      UUID;
    v_label   TEXT;
    v_who     TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;

    v_role := public.dispute_role(p_dispute_id);
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'DISPUTE_NOT_FOUND';
    END IF;
    SELECT * INTO v_dispute FROM disputes WHERE id = p_dispute_id FOR UPDATE;
    IF v_dispute.status = 'resolved' THEN
        RAISE EXCEPTION 'DISPUTE_ALREADY_RESOLVED';
    END IF;

    -- Chỉ gửi file thì nội dung mặc định là tên file.
    IF v_body IS NULL AND v_path IS NOT NULL THEN
        v_body := '📎 ' || COALESCE(v_name, 'Tệp đính kèm');
    END IF;
    IF v_body IS NULL OR char_length(v_body) > 2000 THEN
        RAISE EXCEPTION 'INVALID_MESSAGE' USING DETAIL = 'Nội dung dài 1–2000 ký tự.';
    END IF;
    IF v_path IS NOT NULL THEN
        IF v_path NOT LIKE p_dispute_id::TEXT || '/%'
           OR NOT EXISTS (SELECT 1 FROM storage.objects
                          WHERE bucket_id = 'dispute-files' AND name = v_path) THEN
            RAISE EXCEPTION 'INVALID_ATTACHMENT' USING DETAIL = 'Chưa tải file lên.';
        END IF;
        v_name := left(COALESCE(v_name, 'Tệp đính kèm'), 200);
    ELSE
        v_name := NULL;
    END IF;
    IF (SELECT count(*) FROM dispute_messages WHERE dispute_id = p_dispute_id) >= 200 THEN
        RAISE EXCEPTION 'DISPUTE_MESSAGE_LIMIT' USING DETAIL = 'Mỗi tranh chấp tối đa 200 tin.';
    END IF;

    INSERT INTO dispute_messages (dispute_id, sender_id, sender_role, body, attachment_path, attachment_name)
    VALUES (p_dispute_id, auth.uid(), v_role, v_body, v_path, v_name)
    RETURNING id INTO v_id;

    IF v_role = 'admin' AND v_dispute.status = 'open' THEN
        UPDATE disputes SET status = 'investigating' WHERE id = p_dispute_id;
    END IF;

    v_label := '#' || UPPER(LEFT(v_dispute.order_id::TEXT, 8));
    v_who := CASE v_role WHEN 'buyer' THEN 'Buyer' WHEN 'supplier' THEN 'Xưởng' ELSE 'Sàn' END;
    INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
    SELECT u.user_id, 'dispute_reply',
           v_who || ' vừa trả lời trong tranh chấp đơn ' || v_label,
           left(v_body, 200),
           jsonb_build_object('order_id', v_dispute.order_id, 'dispute_id', p_dispute_id),
           'in_app', 'sent', NOW()
    FROM (
        SELECT bp.user_id FROM orders o JOIN buyer_profiles bp ON bp.id = o.buyer_id
        WHERE o.id = v_dispute.order_id
        UNION
        SELECT sp.user_id FROM orders o JOIN supplier_profiles sp ON sp.id = o.supplier_id
        WHERE o.id = v_dispute.order_id
    ) u
    WHERE u.user_id <> auth.uid();

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_dispute_message(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_dispute_message(UUID, TEXT, TEXT, TEXT) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.dispute_messages;

-- ── Sổ hoàn tiền ───────────────────────────────────────────────────────
CREATE TABLE public.refunds (
    id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID          NOT NULL REFERENCES public.orders(id),
    dispute_id UUID          REFERENCES public.disputes(id),
    amount     DECIMAL(16,2) NOT NULL CHECK (amount > 0),
    status     TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    note       TEXT,
    bank_ref   TEXT,
    created_by UUID          REFERENCES public.users(id),
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    paid_by    UUID          REFERENCES public.users(id),
    paid_at    TIMESTAMPTZ,
    CONSTRAINT chk_refund_paid CHECK (status <> 'paid' OR (paid_by IS NOT NULL AND paid_at IS NOT NULL))
);

CREATE INDEX idx_refunds_order ON public.refunds (order_id);
CREATE INDEX idx_refunds_pending ON public.refunds (created_at) WHERE status = 'pending';

COMMENT ON TABLE public.refunds IS
    'Khoản sàn phải hoàn cho buyer (kế hoạch 5.8). Tạo bởi admin_resolve_dispute(),
     đánh dấu đã chuyển bằng admin_mark_refund_paid(). Chuyển khoản thực hiện ngoài hệ thống.';

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds FORCE ROW LEVEL SECURITY;

-- Buyer / xưởng của đơn và admin đọc được.
CREATE POLICY refunds_select ON public.refunds
    FOR SELECT TO authenticated
    USING (public.order_role(order_id) IS NOT NULL);

REVOKE ALL ON public.refunds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.refunds TO authenticated;

-- ── Giải quyết tranh chấp: thêm tác động lên đơn + khoản hoàn ───────────
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(
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
    v_order   orders%ROWTYPE;
    v_note    TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
    v_ratio   NUMERIC;
    v_paid    NUMERIC;
    v_refund  NUMERIC := 0;
    v_refund_id UUID;
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
        IF p_refund_ratio IS NULL OR p_refund_ratio <= 0 OR p_refund_ratio >= 1 THEN
            RAISE EXCEPTION 'INVALID_RESOLUTION'
                USING DETAIL = 'Chia tỷ lệ cần phần hoàn cho buyer lớn hơn 0 và nhỏ hơn 1.';
        END IF;
        v_ratio := p_refund_ratio;
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = v_dispute.order_id FOR UPDATE;
    -- Số tiền sàn đã thu của đơn: số admin ghi lúc xác nhận thanh toán, không
    -- có thì lấy tổng đơn (đơn xác nhận trước 3.6).
    v_paid := CASE WHEN v_order.status IN ('pending_confirmation', 'pending_payment') THEN 0
                   ELSE COALESCE(v_order.paid_amount, v_order.total, 0) END;
    v_refund := CASE p_resolution
                    WHEN 'refund_buyer' THEN v_paid
                    WHEN 'partial'      THEN round(v_paid * v_ratio)
                    ELSE 0 END;

    -- Đánh dấu giải quyết TRƯỚC khi đổi đơn (trigger chặn đổi trạng thái đơn
    -- đang tranh chấp không áp cho hàm này, nhưng giữ thứ tự cho rõ).
    -- trg_handle_dispute_update gửi thông báo cho buyer + xưởng.
    UPDATE disputes
    SET status          = 'resolved',
        resolution      = p_resolution::dispute_resolution,
        refund_ratio    = v_ratio,
        resolution_note = v_note,
        resolved_by     = auth.uid(),
        resolved_at     = NOW()
    WHERE id = p_dispute_id;

    IF v_refund > 0 THEN
        INSERT INTO refunds (order_id, dispute_id, amount, note, created_by)
        VALUES (v_order.id, p_dispute_id, v_refund, v_note, auth.uid())
        RETURNING id INTO v_refund_id;
    END IF;

    IF p_resolution = 'refund_buyer' AND v_order.status NOT IN ('cancelled', 'completed') THEN
        UPDATE orders
        SET status = 'cancelled',
            cancel_reason = 'Tranh chấp: hoàn tiền cho buyer' || COALESCE(' — ' || left(v_note, 400), '.'),
            updated_at = NOW()
        WHERE id = v_order.id;
    END IF;

    PERFORM public.log_admin_action('dispute.resolve', 'order', v_dispute.order_id::TEXT,
        jsonb_build_object('dispute_id', p_dispute_id, 'resolution', p_resolution,
                           'refund_ratio', v_ratio, 'refund_amount', v_refund,
                           'refund_id', v_refund_id, 'note', v_note));

    RETURN jsonb_build_object('dispute_id', p_dispute_id, 'status', 'resolved',
                              'refund_id', v_refund_id, 'refund_amount', v_refund);
END;
$$;

CREATE FUNCTION public.admin_mark_refund_paid(p_refund_id UUID, p_bank_ref TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_refund refunds%ROWTYPE;
    v_ref    TEXT := NULLIF(btrim(COALESCE(p_bank_ref, '')), '');
    v_note   TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
    PERFORM public.assert_admin();

    SELECT * INTO v_refund FROM refunds WHERE id = p_refund_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'REFUND_NOT_FOUND';
    END IF;
    IF v_refund.status = 'paid' THEN
        RAISE EXCEPTION 'REFUND_ALREADY_PAID';
    END IF;
    IF v_ref IS NULL OR char_length(v_ref) > 100 THEN
        RAISE EXCEPTION 'REASON_REQUIRED' USING DETAIL = 'Cần mã giao dịch chuyển khoản (tối đa 100 ký tự).';
    END IF;

    UPDATE refunds
    SET status = 'paid', bank_ref = v_ref, note = COALESCE(v_note, note),
        paid_by = auth.uid(), paid_at = NOW()
    WHERE id = p_refund_id;

    INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
    SELECT bp.user_id, 'dispute_resolved',
           'Sàn đã chuyển khoản hoàn tiền đơn #' || UPPER(LEFT(o.id::TEXT, 8)),
           'Số tiền: ' || replace(to_char(round(v_refund.amount), 'FM999,999,999,999'), ',', '.')
               || 'đ · Mã giao dịch: ' || v_ref,
           jsonb_build_object('order_id', o.id, 'dispute_id', v_refund.dispute_id, 'refund_id', p_refund_id),
           'in_app', 'sent', NOW()
    FROM orders o JOIN buyer_profiles bp ON bp.id = o.buyer_id
    WHERE o.id = v_refund.order_id;

    PERFORM public.log_admin_action('refund.paid', 'order', v_refund.order_id::TEXT,
        jsonb_build_object('refund_id', p_refund_id, 'amount', v_refund.amount, 'bank_ref', v_ref));

    RETURN jsonb_build_object('refund_id', p_refund_id, 'status', 'paid');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_refund_paid(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_refund_paid(UUID, TEXT, TEXT) TO authenticated;

-- ── Đơn đang tranh chấp: buyer / xưởng không chuyển trạng thái ─────────
CREATE FUNCTION public.guard_order_in_dispute()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Hàm SECURITY DEFINER (admin_*, pg_cron…) chạy dưới vai trò khác → bỏ qua.
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM disputes WHERE order_id = NEW.id AND status <> 'resolved') THEN
        RAISE EXCEPTION 'ORDER_IN_DISPUTE'
            USING DETAIL = 'Đơn đang có tranh chấp — chờ sàn giải quyết trước khi chuyển bước.';
    END IF;
    RETURN NEW;
END;
$$;

-- disputes có RLS: trigger INVOKER chỉ thấy tranh chấp người gọi được đọc —
-- buyer / xưởng của đơn luôn đọc được tranh chấp của đơn mình (disputes_select).
CREATE TRIGGER trg_guard_order_in_dispute
    BEFORE UPDATE OF status ON public.orders
    FOR EACH ROW
    WHEN (NEW.status IS DISTINCT FROM OLD.status)
    EXECUTE FUNCTION public.guard_order_in_dispute();

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — open_dispute(), dispute_messages + bucket dispute-files, refunds, admin_resolve_dispute() có tác động, admin_mark_refund_paid()';
END $$;

COMMIT;
