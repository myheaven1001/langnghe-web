-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 3.1: platform_settings + admin_audit_log.
--
--   platform_settings   Cài đặt của sàn, mỗi khoá một dòng (value JSONB).
--       audience quyết định ai đọc được:
--         'public'         mọi người (kể cả khách) — kênh hỗ trợ
--         'authenticated'  người đã đăng nhập — tài khoản nhận tiền, số
--                          ngày tự hoàn tất đơn
--         'admin'          chỉ admin
--       Chỉ sửa qua admin_set_setting() (kiểm tra admin + giá trị hợp lệ +
--       ghi nhật ký). Không có quy tắc INSERT/UPDATE/DELETE cho app.
--   admin_audit_log     Nhật ký thao tác admin. Chỉ admin đọc; KHÔNG ai ghi
--       trực tiếp (kể cả admin) — chỉ các hàm admin_* (SECURITY DEFINER)
--       ghi qua log_admin_action(), nên không sửa/xoá dấu vết qua API được.
--
-- Khoá khởi tạo:
--   payment_account           {bank_name, account_number, account_holder, branch, note}
--   order_auto_complete_days  số ngày sau khi 'delivered' thì tự 'completed' (3.7)
--   support_contact           {phone, zalo, email, hours}
--
-- Mã lỗi: FORBIDDEN_NOT_ADMIN, UNKNOWN_SETTING, INVALID_SETTING.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.platform_settings') IS NOT NULL THEN
        RAISE EXCEPTION 'platform_settings đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_active_user') THEN
        RAISE EXCEPTION 'Thiếu is_active_user(). Chạy 20261005090800 (1.7) trước.';
    END IF;
END $$;

-- ── Nhật ký admin ───────────────────────────────────────────────────────
CREATE TABLE public.admin_audit_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id    UUID        NOT NULL REFERENCES public.users(id),
    action      TEXT        NOT NULL,          -- 'setting.update', 'order.confirm_payment'…
    entity_type TEXT        NOT NULL,          -- 'setting', 'order', 'user', 'verification'…
    entity_id   TEXT,                          -- id (hoặc khoá cài đặt) của đối tượng
    details     JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_audit_log_created ON public.admin_audit_log (created_at DESC);
CREATE INDEX idx_admin_audit_log_entity  ON public.admin_audit_log (entity_type, entity_id);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY admin_audit_log_select_admin ON public.admin_audit_log
    FOR SELECT USING (public.is_admin());
-- Cố ý không có policy INSERT/UPDATE/DELETE.

-- Ghi một dòng nhật ký. Chỉ gọi từ bên trong các hàm admin_* (SECURITY
-- DEFINER); thu hồi quyền gọi trực tiếp để không ai tự ghi nhật ký giả.
CREATE FUNCTION public.log_admin_action(
    p_action      TEXT,
    p_entity_type TEXT,
    p_entity_id   TEXT,
    p_details     JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, COALESCE(p_details, '{}'));
$$;

REVOKE ALL ON FUNCTION public.log_admin_action(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ── Cài đặt sàn ─────────────────────────────────────────────────────────
CREATE TABLE public.platform_settings (
    key         TEXT        PRIMARY KEY,
    value       JSONB       NOT NULL,
    audience    TEXT        NOT NULL DEFAULT 'admin'
                CHECK (audience IN ('public', 'authenticated', 'admin')),
    description TEXT        NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  UUID        REFERENCES public.users(id)
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY platform_settings_select ON public.platform_settings
    FOR SELECT USING (
        audience = 'public'
        OR (audience = 'authenticated' AND auth.uid() IS NOT NULL)
        OR public.is_admin()
    );
-- Cố ý không có policy INSERT/UPDATE/DELETE: sửa qua admin_set_setting().

INSERT INTO public.platform_settings (key, value, audience, description) VALUES
    ('payment_account',
     '{"bank_name": "", "account_number": "", "account_holder": "", "branch": "", "note": ""}',
     'authenticated',
     'Tài khoản ngân hàng của sàn — hiện cho buyer ở trang đơn hàng để chuyển khoản.'),
    ('order_auto_complete_days', '7', 'authenticated',
     'Số ngày sau khi đơn "đã nhận hàng" thì tự chuyển sang "hoàn tất".'),
    ('support_contact',
     '{"phone": "", "zalo": "", "email": "", "hours": ""}',
     'public',
     'Kênh hỗ trợ hiện cho người dùng.');

-- Đọc một cài đặt bất kể người gọi (cho job nền và hàm khác — 3.7).
CREATE FUNCTION public.get_setting(p_key TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT value FROM platform_settings WHERE key = p_key;
$$;

REVOKE ALL ON FUNCTION public.get_setting(TEXT) FROM PUBLIC, anon, authenticated;

-- Admin sửa một cài đặt: kiểm tra quyền, khoá, giá trị; ghi nhật ký kèm giá
-- trị cũ và mới.
CREATE FUNCTION public.admin_set_setting(p_key TEXT, p_value JSONB)
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

REVOKE ALL ON FUNCTION public.admin_set_setting(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_setting(TEXT, JSONB) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — platform_settings (3 khoá), admin_audit_log, admin_set_setting()';
END $$;

COMMIT;
