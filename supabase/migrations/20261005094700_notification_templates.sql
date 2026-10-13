-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Bước 6 (Vận hành): mẫu thông báo do admin chỉnh + tôn trọng lựa chọn tắt
-- thông báo của người dùng.
--
-- Nội dung thông báo đang ghi cứng trong khoảng 20 hàm database. Thay vì viết
-- lại từng hàm, một trigger duy nhất trên bảng notifications áp quy tắc ngay
-- lúc ghi:
--   notification_overrides   Mỗi loại thông báo tối đa một dòng do admin đặt:
--       is_enabled = FALSE   → sàn tắt hẳn loại này, không ghi thông báo;
--       title_template / body_template (NULL = giữ nguyên bản gốc) với các ô
--       thay thế:  {tieu_de_goc}  {noi_dung_goc}  {ma_don}  {ma_rfq}.
--       Ví dụ nội dung: "{noi_dung_goc}\nCần hỗ trợ gọi 1900 xxxx."
--   notification_preferences   Trang "Cài đặt thông báo" của người dùng đã lưu
--       lựa chọn từ trước nhưng chưa nơi nào áp dụng. Giờ thông báo trong ứng
--       dụng (in_app) của loại người dùng đã TẮT sẽ không được ghi.
--   Ba loại về chính tài khoản (xác minh được duyệt / bị từ chối, tài khoản bị
--       khoá) luôn được gửi: sàn không tắt được, lựa chọn của người dùng cũng
--       không áp dụng (trang cài đặt vốn đã khoá các ô này).
--   admin_save_notification_template(type, title, body, enabled)   Có nhật ký.
--
-- Bảng notification_templates có từ 20261001090000 (mẫu email dạng {{biến}}, chưa
-- nơi nào dùng) KHÔNG bị đụng tới: nó dành cho việc gửi email sau này và có
-- cấu trúc khác. Bảng mới ở đây tên notification_overrides.
--
-- Trigger là BEFORE INSERT trả NULL để bỏ dòng: các hàm ghi thông báo không
-- cần sửa và không bị lỗi khi thông báo bị bỏ.
--
-- Mã lỗi: FORBIDDEN_NOT_ADMIN, INVALID_TEMPLATE.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.notification_overrides') IS NOT NULL THEN
        RAISE EXCEPTION 'notification_overrides đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF to_regprocedure('public.assert_admin()') IS NULL THEN
        RAISE EXCEPTION 'Thiếu assert_admin(). Chạy 20261005092000 trước.';
    END IF;
END $$;

CREATE TABLE public.notification_overrides (
    type           notification_type PRIMARY KEY,
    title_template TEXT        CHECK (title_template IS NULL OR char_length(title_template) BETWEEN 1 AND 255),
    body_template  TEXT        CHECK (body_template IS NULL OR char_length(body_template) BETWEEN 1 AND 1000),
    is_enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_by     UUID        REFERENCES public.users(id),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notification_overrides IS
    'Mẫu / công tắc của từng loại thông báo do admin đặt (bước 6). Không có dòng
     = dùng nội dung gốc. Trigger trg_apply_notification_rules áp dụng lúc ghi.';

ALTER TABLE public.notification_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_overrides FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_overrides_select_admin ON public.notification_overrides
    FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON public.notification_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notification_overrides TO authenticated;

-- Thay các ô {…} trong mẫu. Ô không có dữ liệu thành chuỗi rỗng.
CREATE FUNCTION public.render_notification_template(
    p_template TEXT,
    p_title    TEXT,
    p_body     TEXT,
    p_payload  JSONB
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT replace(replace(replace(replace(p_template,
               '{tieu_de_goc}',  COALESCE(p_title, '')),
               '{noi_dung_goc}', COALESCE(p_body, '')),
               '{ma_don}',       COALESCE('#' || upper(left(p_payload ->> 'order_id', 8)), '')),
               '{ma_rfq}',       COALESCE('#' || upper(left(p_payload ->> 'rfq_id', 8)), ''));
$$;

CREATE FUNCTION public.apply_notification_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_template notification_overrides%ROWTYPE;
    v_title    TEXT := NEW.title;
    v_body     TEXT := NEW.body;
    -- Thông báo về chính tài khoản: luôn gửi, không ai tắt được.
    v_locked   BOOLEAN := NEW.type IN ('verification_approved', 'verification_rejected', 'account_suspended');
BEGIN
    SELECT * INTO v_template FROM notification_overrides WHERE type = NEW.type;
    IF FOUND AND NOT v_template.is_enabled AND NOT v_locked THEN
        RETURN NULL;   -- sàn đã tắt loại thông báo này
    END IF;

    -- Người dùng đã tắt loại này cho đúng kênh (thiếu dòng = đang bật).
    IF NOT v_locked
       AND EXISTS (SELECT 1 FROM notification_preferences p
               WHERE p.user_id = NEW.user_id AND p.notification_type = NEW.type
                 AND p.channel = NEW.channel AND NOT p.enabled) THEN
        RETURN NULL;
    END IF;

    IF FOUND THEN
        IF v_template.title_template IS NOT NULL THEN
            NEW.title := left(NULLIF(btrim(public.render_notification_template(
                v_template.title_template, v_title, v_body, NEW.payload)), ''), 255);
            NEW.title := COALESCE(NEW.title, v_title);
        END IF;
        IF v_template.body_template IS NOT NULL THEN
            NEW.body := left(public.render_notification_template(
                v_template.body_template, v_title, v_body, NEW.payload), 2000);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_notification_rules() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_apply_notification_rules
    BEFORE INSERT ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.apply_notification_rules();

-- p_title / p_body rỗng = dùng nội dung gốc. Trả về trạng thái sau khi lưu.
CREATE FUNCTION public.admin_save_notification_template(
    p_type    TEXT,
    p_title   TEXT,
    p_body    TEXT,
    p_enabled BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_type  notification_type;
    v_title TEXT := NULLIF(btrim(COALESCE(p_title, '')), '');
    v_body  TEXT := NULLIF(btrim(COALESCE(p_body, '')), '');
BEGIN
    PERFORM public.assert_admin();

    BEGIN
        v_type := p_type::notification_type;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'INVALID_TEMPLATE' USING DETAIL = 'Loại thông báo không tồn tại.';
    END;
    IF p_enabled IS NULL OR char_length(COALESCE(v_title, '')) > 255
       OR char_length(COALESCE(v_body, '')) > 1000 THEN
        RAISE EXCEPTION 'INVALID_TEMPLATE' USING DETAIL = 'Tiêu đề tối đa 255 ký tự, nội dung tối đa 1000.';
    END IF;

    IF NOT p_enabled AND p_type IN ('verification_approved', 'verification_rejected', 'account_suspended') THEN
        RAISE EXCEPTION 'INVALID_TEMPLATE'
            USING DETAIL = 'Thông báo về xác minh và khoá tài khoản không tắt được.';
    END IF;

    IF v_title IS NULL AND v_body IS NULL AND p_enabled THEN
        -- Về mặc định: bỏ dòng để bảng chỉ chứa những gì admin thật sự đổi.
        DELETE FROM notification_overrides WHERE type = v_type;
    ELSE
        INSERT INTO notification_overrides (type, title_template, body_template, is_enabled, updated_by)
        VALUES (v_type, v_title, v_body, p_enabled, auth.uid())
        ON CONFLICT (type) DO UPDATE
        SET title_template = EXCLUDED.title_template, body_template = EXCLUDED.body_template,
            is_enabled = EXCLUDED.is_enabled, updated_by = EXCLUDED.updated_by, updated_at = NOW();
    END IF;

    PERFORM public.log_admin_action('notification_template.save', 'notification_type', p_type,
        jsonb_build_object('title', v_title, 'body', v_body, 'enabled', p_enabled));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_notification_template(TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_notification_template(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

DO $$
DECLARE
    v_off INT;
BEGIN
    SELECT count(*) INTO v_off FROM public.notification_preferences WHERE channel = 'in_app' AND NOT enabled;
    RAISE NOTICE 'Lưu ý: % lựa chọn "tắt thông báo trong ứng dụng" của người dùng bắt đầu có hiệu lực.', v_off;
    RAISE NOTICE 'Migration OK — notification_overrides, trg_apply_notification_rules, admin_save_notification_template()';
END $$;

COMMIT;
