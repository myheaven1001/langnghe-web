-- Test kế hoạch 3.1: platform_settings (ai đọc được gì, chỉ admin sửa qua
-- admin_set_setting) + admin_audit_log (chỉ admin đọc, không ai ghi trực tiếp).
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "3.1: TẤT CẢ ĐẠT (13 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.

BEGIN;

CREATE FUNCTION pg_temp.login(p_email TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_id UUID;
BEGIN
    RESET ROLE;
    SELECT id INTO v_id FROM auth.users WHERE email = p_email;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'Thiếu tài khoản % — chạy npm run seed:staging trước.', p_email;
    END IF;
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_id, 'role', 'authenticated')::TEXT, TRUE);
    SET LOCAL ROLE authenticated;
END $$;

CREATE FUNCTION pg_temp.as_anon() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', TRUE);
    SET LOCAL ROLE anon;
END $$;

CREATE FUNCTION pg_temp.check(p_label TEXT, p_ok BOOLEAN, p_detail TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'FAIL  % — %', p_label, p_detail;
    END IF;
    RAISE NOTICE 'PASS  %', p_label;
END $$;

-- Câu lệnh phải lỗi p_code ('DENIED' = bị từ chối quyền 42501).
CREATE FUNCTION pg_temp.expect_error(p_label TEXT, p_code TEXT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION
        WHEN insufficient_privilege THEN
            IF p_code = 'DENIED' THEN
                RAISE NOTICE 'PASS  % (bị từ chối quyền)', p_label;
                RETURN;
            END IF;
            RAISE EXCEPTION 'FAIL  % — cần lỗi %, nhận %', p_label, p_code, SQLERRM;
        WHEN OTHERS THEN
            IF SQLERRM = p_code THEN
                RAISE NOTICE 'PASS  %', p_label;
                RETURN;
            END IF;
            RAISE EXCEPTION 'FAIL  % — cần lỗi %, nhận %', p_label, p_code, SQLERRM;
    END;
    RAISE EXCEPTION 'FAIL  % — không bị chặn (cần %)', p_label, p_code;
END $$;

-- ── Khách chưa đăng nhập ───────────────────────────────────────────────
SELECT pg_temp.as_anon();
SELECT pg_temp.check('khách chỉ đọc được cài đặt công khai (kênh hỗ trợ)',
    (SELECT array_agg(key ORDER BY key) = ARRAY['support_contact'] FROM platform_settings),
    (SELECT string_agg(key, ', ') FROM platform_settings));

-- ── Buyer ──────────────────────────────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('buyer đọc được tài khoản nhận tiền và số ngày tự hoàn tất',
    (SELECT count(*) = 3 FROM platform_settings),
    (SELECT string_agg(key, ', ') FROM platform_settings));
DO $$
DECLARE
    v_rows INT;
BEGIN
    UPDATE platform_settings SET value = '{"account_number":"999"}' WHERE key = 'payment_account';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN
        RAISE EXCEPTION 'FAIL  buyer sửa thẳng bảng cài đặt — đổi được % dòng', v_rows;
    END IF;
    RAISE NOTICE 'PASS  buyer sửa thẳng bảng cài đặt → không đổi gì';
END $$;
SELECT pg_temp.expect_error('buyer gọi admin_set_setting', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_set_setting('order_auto_complete_days', '3')$q$);
SELECT pg_temp.check('buyer không đọc được nhật ký admin',
    (SELECT count(*) = 0 FROM admin_audit_log), 'buyer thấy admin_audit_log');
SELECT pg_temp.expect_error('buyer tự ghi nhật ký giả qua log_admin_action', 'DENIED',
    $q$SELECT public.log_admin_action('fake', 'order', 'x', '{}')$q$);

-- ── Admin ──────────────────────────────────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.check('admin lưu tài khoản nhận tiền (bỏ dấu cách trong số TK)',
    (SELECT public.admin_set_setting('payment_account',
        '{"bank_name":"Vietcombank","account_number":"0011 0022 3344","account_holder":"CONG TY LANG NGHE","branch":"Ha Noi"}')
        ->> 'account_number') = '001100223344',
    'số tài khoản không được chuẩn hoá');
SELECT pg_temp.check('admin đổi số ngày tự hoàn tất',
    (SELECT public.admin_set_setting('order_auto_complete_days', '5')) = '5'::JSONB, 'không lưu được');
SELECT pg_temp.expect_error('số tài khoản có chữ → INVALID_SETTING', 'INVALID_SETTING',
    $q$SELECT public.admin_set_setting('payment_account',
        '{"bank_name":"VCB","account_number":"ABC123","account_holder":"X"}')$q$);
SELECT pg_temp.expect_error('số ngày 0 → INVALID_SETTING', 'INVALID_SETTING',
    $q$SELECT public.admin_set_setting('order_auto_complete_days', '0')$q$);
SELECT pg_temp.expect_error('khoá không tồn tại → UNKNOWN_SETTING', 'UNKNOWN_SETTING',
    $q$SELECT public.admin_set_setting('khong_co', '1')$q$);
SELECT pg_temp.check('2 lần sửa thành công ghi 2 dòng nhật ký, có giá trị cũ và mới',
    (SELECT count(*) = 2
            AND bool_and(action = 'setting.update' AND admin_id = auth.uid()
                         AND details ? 'old' AND details ? 'new')
     FROM admin_audit_log),
    (SELECT count(*)::TEXT || ' dòng nhật ký' FROM admin_audit_log));
SELECT pg_temp.expect_error('admin cũng không ghi/sửa nhật ký trực tiếp', 'DENIED',
    $q$INSERT INTO admin_audit_log (admin_id, action, entity_type) VALUES (auth.uid(), 'fake', 'order')$q$);

DO $$ BEGIN RAISE NOTICE '3.1: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '3.1: TẤT CẢ ĐẠT (13 ca)' AS ket_qua;
