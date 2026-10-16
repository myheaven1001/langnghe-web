-- Quay lui 20261005094900_order_payment_deadline.sql (xem README.md).
-- Bỏ lịch tự huỷ đơn chưa thanh toán và cài đặt số ngày. Đơn đã huỷ giữ nguyên.
-- Quay lui web về bản trước TRƯỚC khi chạy file này.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.unschedule('auto-cancel-unpaid-orders');
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Không bỏ được lịch auto-cancel-unpaid-orders (%)', SQLERRM;
        END;
    END IF;
END $$;

DROP FUNCTION IF EXISTS public.auto_cancel_unpaid_orders();
DROP FUNCTION IF EXISTS public.order_payment_started_at(UUID);

-- Bản 20261005094600.
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

DELETE FROM public.platform_settings WHERE key = 'order_payment_days';

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005094900';

COMMIT;
