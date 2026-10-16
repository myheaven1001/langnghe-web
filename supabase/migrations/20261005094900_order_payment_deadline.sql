-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Hạn chuyển khoản cho đơn chờ thanh toán (phát hiện khi rà soát bước 5–6).
--
-- Đơn ở 'pending_payment' trước đây nằm đó vô thời hạn nếu buyer không chuyển
-- khoản — với đơn hàng có sẵn thì tồn kho bị giữ theo. Trang đơn của buyer có
-- ghi "trong 48h" nhưng không có gì thực thi.
--
--   platform_settings.order_payment_days   Số ngày buyer có để chuyển khoản
--       (mặc định 3, 1–14, sửa ở /admin/settings).
--   auto_cancel_unpaid_orders()   pg_cron mỗi giờ (phút 40). Huỷ đơn
--       'pending_payment' quá hạn, tính từ lúc xưởng nhận đơn (đơn đặt thẳng)
--       hoặc lúc tạo đơn (đơn từ báo giá). BỎ QUA đơn buyer đã tải biên lai
--       chuyển khoản lên — chờ admin đối chiếu, không huỷ. Ghi lý do, báo buyer
--       và xưởng; kho đã giữ được cộng lại (trigger restore_stock_on_cancel).
--
-- Mã lỗi: INVALID_SETTING.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_cancel_unpaid_orders') THEN
        RAISE EXCEPTION 'auto_cancel_unpaid_orders() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'commission_percent') THEN
        RAISE EXCEPTION 'Thiếu cài đặt commission_percent. Chạy 20261005094600 trước.';
    END IF;
END $$;

INSERT INTO public.platform_settings (key, value, audience, description) VALUES
    ('order_payment_days', '3', 'authenticated',
     'Số ngày buyer có để chuyển khoản sau khi đơn sẵn sàng thanh toán; quá hạn đơn tự huỷ (trừ đơn đã tải biên lai).');

-- admin_set_setting(): thêm kiểm tra cho khoá mới (phần còn lại như 20261005094600).
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
    ELSIF p_key = 'order_payment_days' THEN
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


-- Mốc bắt đầu hạn thanh toán của một đơn: lúc xưởng nhận (đơn đặt thẳng) hoặc lúc tạo đơn.
CREATE FUNCTION public.order_payment_started_at(p_order_id UUID)
RETURNS TIMESTAMP
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT max(e.created_at) FROM order_events e
         WHERE e.order_id = o.id AND e.event_type = 'order_accepted'),
        o.created_at)
    FROM orders o WHERE o.id = p_order_id;
$$;

REVOKE ALL ON FUNCTION public.order_payment_started_at(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_payment_started_at(UUID) TO authenticated;

CREATE FUNCTION public.auto_cancel_unpaid_orders()
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
        v_days := (public.get_setting('order_payment_days') #>> '{}')::INT;
    EXCEPTION WHEN OTHERS THEN
        v_days := NULL;
    END;
    v_days := COALESCE(v_days, 3);

    FOR v_order IN
        SELECT o.id, bp.user_id AS buyer_user, sp.user_id AS supplier_user
        FROM orders o
        JOIN buyer_profiles bp ON bp.id = o.buyer_id
        JOIN supplier_profiles sp ON sp.id = o.supplier_id
        WHERE o.status = 'pending_payment'
          AND public.order_payment_started_at(o.id) < (NOW() AT TIME ZONE 'UTC') - make_interval(days => v_days)
          AND NOT EXISTS (SELECT 1 FROM order_documents d
                          WHERE d.order_id = o.id AND d.doc_type = 'payment_receipt')
        ORDER BY o.created_at
        FOR UPDATE OF o
    LOOP
        UPDATE orders
        SET status = 'cancelled',
            cancel_reason = format('Buyer không chuyển khoản trong %s ngày — hệ thống tự huỷ.', v_days),
            updated_at = NOW()
        WHERE id = v_order.id;

        v_label := '#' || UPPER(LEFT(v_order.id::TEXT, 8));
        INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
        VALUES
            (v_order.buyer_user, 'order_declined', 'Đơn ' || v_label || ' đã tự huỷ',
             format('Sàn chưa nhận được thanh toán trong %s ngày nên đơn đã huỷ. Nếu bạn đã chuyển khoản, liên hệ sàn ngay.', v_days),
             jsonb_build_object('order_id', v_order.id), 'in_app', 'sent', NOW()),
            (v_order.supplier_user, 'order_declined', 'Đơn ' || v_label || ' đã tự huỷ',
             format('Buyer không chuyển khoản trong %s ngày nên hệ thống đã huỷ đơn.', v_days),
             jsonb_build_object('order_id', v_order.id), 'in_app', 'sent', NOW());
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_cancel_unpaid_orders() FROM PUBLIC, anon, authenticated;

-- Lên lịch (cùng khuôn 20261005093500): lỗi lên lịch chỉ là cảnh báo.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.schedule(
                'auto-cancel-unpaid-orders',
                '40 * * * *',
                'SELECT public.auto_cancel_unpaid_orders()'
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Không lên lịch được auto-cancel-unpaid-orders (%)', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'pg_cron chưa có: bật Database → Extensions → pg_cron rồi chạy lại phần cron.schedule.';
    END IF;
END $$;

DO $$
DECLARE
    v_waiting INT;
BEGIN
    SELECT count(*) INTO v_waiting FROM public.orders o
    WHERE o.status = 'pending_payment'
      AND public.order_payment_started_at(o.id) < (NOW() AT TIME ZONE 'UTC') - INTERVAL '3 days'
      AND NOT EXISTS (SELECT 1 FROM public.order_documents d
                      WHERE d.order_id = o.id AND d.doc_type = 'payment_receipt');
    RAISE NOTICE 'Lưu ý: % đơn đang chờ thanh toán quá 3 ngày sẽ tự huỷ ở lần chạy pg_cron kế tiếp (trong vòng 1 giờ).', v_waiting;
    RAISE NOTICE 'Migration OK — order_payment_days, auto_cancel_unpaid_orders(), order_payment_started_at()';
END $$;

COMMIT;
