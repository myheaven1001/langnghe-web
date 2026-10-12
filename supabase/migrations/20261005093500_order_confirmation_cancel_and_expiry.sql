-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Bổ sung 5.6: buyer tự huỷ đơn đang chờ xưởng xác nhận; đơn không được
-- xưởng xác nhận trong N ngày thì tự huỷ.
--
-- Lý do: đơn đặt thẳng trừ kho "hàng có sẵn" ngay lúc đặt. Nếu xưởng không
-- phản hồi, đơn treo vô thời hạn và giữ kho theo; buyer đổi ý cũng không có
-- cách huỷ ngoài nhờ admin.
--
--   buyer_cancel_order(order, reason)   Buyer của đơn huỷ khi đơn còn
--       'pending_confirmation' (chưa chuyển tiền nên không cần hoàn tiền).
--       Sau khi xưởng đã nhận thì không tự huỷ được nữa. Báo xưởng.
--   platform_settings.order_confirmation_days   Số ngày xưởng có để xác nhận
--       (mặc định 3, sửa ở /admin/settings, 1–14).
--   auto_cancel_unconfirmed_orders()   pg_cron mỗi giờ (phút 20): huỷ đơn
--       'pending_confirmation' quá hạn, ghi lý do, báo cả buyer lẫn xưởng.
--   Cả hai đường huỷ đều đi qua trigger trg_restore_stock_on_cancel nên kho
--       đã trừ được cộng lại.
--
-- Mã lỗi: NOT_AUTHENTICATED, ACCOUNT_SUSPENDED, ORDER_NOT_FOUND,
--         ORDER_NOT_PENDING_CONFIRMATION, INVALID_SETTING.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'buyer_cancel_order') THEN
        RAISE EXCEPTION 'buyer_cancel_order() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'supplier_respond_order') THEN
        RAISE EXCEPTION 'Thiếu supplier_respond_order(). Chạy 20261005093400 (5.4) trước.';
    END IF;
END $$;

-- ── Cài đặt: số ngày xưởng có để xác nhận ──────────────────────────────
INSERT INTO public.platform_settings (key, value, audience, description) VALUES
    ('order_confirmation_days', '3', 'authenticated',
     'Số ngày xưởng có để nhận / từ chối đơn đặt thẳng; quá hạn đơn tự huỷ.');

-- admin_set_setting(): thêm kiểm tra cho khoá mới (phần còn lại như 20261005091700).
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

-- ── Buyer huỷ đơn chưa được xưởng xác nhận ─────────────────────────────
CREATE FUNCTION public.buyer_cancel_order(p_order_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order         orders%ROWTYPE;
    v_reason        TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
    v_supplier_user UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;

    SELECT o.* INTO v_order FROM orders o
    JOIN buyer_profiles bp ON bp.id = o.buyer_id
    WHERE o.id = p_order_id AND bp.user_id = auth.uid()
    FOR UPDATE OF o;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF v_order.status <> 'pending_confirmation' THEN
        RAISE EXCEPTION 'ORDER_NOT_PENDING_CONFIRMATION'
            USING DETAIL = 'Chỉ huỷ được đơn đang chờ xưởng xác nhận.';
    END IF;

    UPDATE orders
    SET status = 'cancelled',
        cancel_reason = 'Buyer huỷ trước khi xưởng xác nhận' || COALESCE(': ' || left(v_reason, 400), '.'),
        updated_at = NOW()
    WHERE id = p_order_id;

    SELECT user_id INTO v_supplier_user FROM supplier_profiles WHERE id = v_order.supplier_id;
    INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
    VALUES (v_supplier_user, 'order_declined',
            'Buyer đã huỷ đơn #' || UPPER(LEFT(p_order_id::TEXT, 8)),
            COALESCE('Lý do: ' || v_reason, 'Buyer huỷ đơn trước khi bạn xác nhận.'),
            jsonb_build_object('order_id', p_order_id), 'in_app', 'sent', NOW());

    RETURN jsonb_build_object('order_id', p_order_id, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.buyer_cancel_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buyer_cancel_order(UUID, TEXT) TO authenticated;

-- ── Tự huỷ đơn quá hạn xác nhận ────────────────────────────────────────
CREATE FUNCTION public.auto_cancel_unconfirmed_orders()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days  INT;
    v_order RECORD;
    v_count INT := 0;
    v_label TEXT;
BEGIN
    BEGIN
        v_days := (public.get_setting('order_confirmation_days') #>> '{}')::INT;
    EXCEPTION WHEN OTHERS THEN
        v_days := NULL;
    END;
    v_days := COALESCE(v_days, 3);

    FOR v_order IN
        SELECT o.id, bp.user_id AS buyer_user, sp.user_id AS supplier_user
        FROM orders o
        JOIN buyer_profiles bp ON bp.id = o.buyer_id
        JOIN supplier_profiles sp ON sp.id = o.supplier_id
        WHERE o.status = 'pending_confirmation'
          AND o.created_at < (NOW() AT TIME ZONE 'UTC') - make_interval(days => v_days)
        ORDER BY o.created_at
        FOR UPDATE OF o
    LOOP
        UPDATE orders
        SET status = 'cancelled',
            cancel_reason = format('Xưởng không xác nhận trong %s ngày — hệ thống tự huỷ.', v_days),
            updated_at = NOW()
        WHERE id = v_order.id;

        v_label := '#' || UPPER(LEFT(v_order.id::TEXT, 8));
        INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
        VALUES
            (v_order.buyer_user, 'order_declined', 'Đơn ' || v_label || ' đã tự huỷ',
             format('Xưởng không xác nhận trong %s ngày. Bạn có thể đặt lại hoặc gửi yêu cầu báo giá.', v_days),
             jsonb_build_object('order_id', v_order.id), 'in_app', 'sent', NOW()),
            (v_order.supplier_user, 'order_declined', 'Đơn ' || v_label || ' đã tự huỷ',
             format('Bạn không xác nhận đơn trong %s ngày nên hệ thống đã huỷ.', v_days),
             jsonb_build_object('order_id', v_order.id), 'in_app', 'sent', NOW());
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_cancel_unconfirmed_orders() FROM PUBLIC, anon, authenticated;

-- Lên lịch (cùng khuôn 20261005092100): lỗi lên lịch chỉ là cảnh báo.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.schedule(
                'auto-cancel-unconfirmed-orders',
                '20 * * * *',
                'SELECT public.auto_cancel_unconfirmed_orders()'
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Không lên lịch được auto-cancel-unconfirmed-orders (%)', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'pg_cron chưa có: bật Database → Extensions → pg_cron rồi chạy lại phần cron.schedule.';
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — buyer_cancel_order(), auto_cancel_unconfirmed_orders(), order_confirmation_days';
END $$;

COMMIT;
