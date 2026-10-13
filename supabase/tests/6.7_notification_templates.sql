-- Test bước 6 (Vận hành): notification_overrides, trigger áp mẫu / công tắc,
-- tôn trọng notification_preferences, admin_save_notification_template().
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "6.7: TẤT CẢ ĐẠT (14 ca)". Hỏng: "FAIL …".
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

CREATE FUNCTION pg_temp.as_system() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);
END $$;

CREATE FUNCTION pg_temp.check(p_label TEXT, p_ok BOOLEAN, p_detail TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'FAIL  % — %', p_label, p_detail;
    END IF;
    RAISE NOTICE 'PASS  %', p_label;
END $$;

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

-- Gửi một thông báo thử cho buyer A như các hàm hệ thống vẫn làm (vai trò postgres).
CREATE FUNCTION pg_temp.notify(p_type TEXT, p_tag TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, payload, channel, status, sent_at)
    VALUES (current_setting('test.user')::UUID, p_type::public.notification_type,
            'Tiêu đề gốc ' || p_tag, 'Nội dung gốc ' || p_tag,
            jsonb_build_object('order_id', 'a1b2c3d4-0000-0000-0000-000000000000', 'tag', p_tag),
            'in_app', 'sent', NOW());
END $$;

-- Thông báo thử gần nhất mang nhãn p_tag (NULL nếu đã bị bỏ).
CREATE FUNCTION pg_temp.sent(p_tag TEXT) RETURNS public.notifications LANGUAGE sql AS $$
    SELECT n FROM public.notifications n
    WHERE n.user_id = current_setting('test.user')::UUID AND n.payload ->> 'tag' = p_tag
    LIMIT 1;
$$;

-- Trạng thái sạch cho test: không mẫu nào, buyer A không tắt loại nào (ROLLBACK trả lại).
DO $$
DECLARE
    v_user UUID;
BEGIN
    SELECT id INTO v_user FROM auth.users WHERE email = 'buyer.a@langnghe.test';
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a — chạy npm run seed:staging trước.';
    END IF;
    UPDATE users SET status = 'active'
    WHERE id IN (SELECT u.id FROM auth.users u
                 WHERE u.email IN ('buyer.a@langnghe.test', 'admin@langnghe.test'));
    DELETE FROM notification_overrides;
    DELETE FROM notification_preferences WHERE user_id = v_user;
    PERFORM set_config('test.user', v_user::TEXT, TRUE);
END $$;

-- ── Không có mẫu: giữ nguyên ───────────────────────────────────────────
SELECT pg_temp.notify('order_shipped', 't1');
SELECT pg_temp.check('không có mẫu → thông báo giữ nguyên nội dung gốc',
    (SELECT (n).title = 'Tiêu đề gốc t1' AND (n).body = 'Nội dung gốc t1' FROM pg_temp.sent('t1') n),
    'thông báo bị đổi hoặc bị bỏ');

-- ── Quyền ──────────────────────────────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('buyer lưu mẫu thông báo', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_save_notification_template('order_shipped', 'x', NULL, TRUE)$q$);
SELECT pg_temp.check('buyer không đọc được bảng mẫu',
    (SELECT count(*) = 0 FROM notification_overrides), 'lộ bảng mẫu');

SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.expect_error('loại thông báo không tồn tại', 'INVALID_TEMPLATE',
    $q$SELECT public.admin_save_notification_template('khong_co_loai_nay', 'x', NULL, TRUE)$q$);
SELECT pg_temp.expect_error('tắt thông báo khoá tài khoản', 'INVALID_TEMPLATE',
    $q$SELECT public.admin_save_notification_template('account_suspended', NULL, NULL, FALSE)$q$);
SELECT pg_temp.expect_error('admin ghi thẳng bảng mẫu', 'DENIED',
    $q$INSERT INTO notification_overrides (type, is_enabled) VALUES ('order_shipped', FALSE)$q$);

-- ── Mẫu có ô thay thế ──────────────────────────────────────────────────
SELECT public.admin_save_notification_template('order_shipped',
    '🚚 Đơn {ma_don} đang trên đường', E'{noi_dung_goc}\nCần hỗ trợ gọi 1900 0000.', TRUE);
SELECT pg_temp.as_system();
SELECT pg_temp.notify('order_shipped', 't2');
SELECT pg_temp.check('mẫu thay tiêu đề (có mã đơn) và nối thêm vào nội dung gốc',
    (SELECT (n).title = '🚚 Đơn #A1B2C3D4 đang trên đường'
            AND (n).body = E'Nội dung gốc t2\nCần hỗ trợ gọi 1900 0000.'
     FROM pg_temp.sent('t2') n),
    (SELECT (n).title || ' / ' || (n).body FROM pg_temp.sent('t2') n));
SELECT pg_temp.notify('order_delivered', 't3');
SELECT pg_temp.check('loại khác không bị ảnh hưởng',
    (SELECT (n).title = 'Tiêu đề gốc t3' FROM pg_temp.sent('t3') n), 'loại khác bị đổi');

-- Chỉ đặt nội dung, để trống tiêu đề → tiêu đề giữ bản gốc.
SELECT pg_temp.login('admin@langnghe.test');
SELECT public.admin_save_notification_template('order_shipped', '  ', 'Chỉ còn nội dung mới', TRUE);
SELECT pg_temp.as_system();
SELECT pg_temp.notify('order_shipped', 't4');
SELECT pg_temp.check('để trống tiêu đề mẫu → giữ tiêu đề gốc, nội dung theo mẫu',
    (SELECT (n).title = 'Tiêu đề gốc t4' AND (n).body = 'Chỉ còn nội dung mới' FROM pg_temp.sent('t4') n),
    (SELECT (n).title || ' / ' || (n).body FROM pg_temp.sent('t4') n));

-- ── Sàn tắt một loại ───────────────────────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
SELECT public.admin_save_notification_template('order_shipped', NULL, NULL, FALSE);
SELECT pg_temp.as_system();
SELECT pg_temp.notify('order_shipped', 't5');
SELECT pg_temp.check('sàn tắt loại thông báo → không ghi, không báo lỗi',
    (SELECT count(*) = 0 FROM notifications
     WHERE user_id = current_setting('test.user')::UUID AND payload ->> 'tag' = 't5'),
    'thông báo vẫn được ghi');

-- Về mặc định: bảng mẫu không còn dòng, có nhật ký.
SELECT pg_temp.login('admin@langnghe.test');
SELECT public.admin_save_notification_template('order_shipped', NULL, NULL, TRUE);
SELECT pg_temp.check('lưu "mặc định" → bỏ dòng mẫu; mỗi lần lưu đều có nhật ký',
    (SELECT count(*) = 0 FROM notification_overrides WHERE type = 'order_shipped')
    AND (SELECT count(*) = 4 FROM admin_audit_log
         WHERE action = 'notification_template.save' AND entity_id = 'order_shipped'
           AND admin_id = auth.uid() AND created_at >= NOW()),
    (SELECT count(*)::TEXT FROM admin_audit_log
     WHERE action = 'notification_template.save' AND entity_id = 'order_shipped' AND created_at >= NOW()));

-- ── Người dùng tự tắt ──────────────────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
INSERT INTO notification_preferences (user_id, notification_type, channel, enabled)
VALUES (auth.uid(), 'order_shipped', 'in_app', FALSE),
       (auth.uid(), 'order_delivered', 'email', FALSE),
       (auth.uid(), 'account_suspended', 'in_app', FALSE);
SELECT pg_temp.as_system();
SELECT pg_temp.notify('order_shipped', 't6');
SELECT pg_temp.notify('order_delivered', 't7');
SELECT pg_temp.notify('account_suspended', 't8');
SELECT pg_temp.check('người dùng tắt loại này trong ứng dụng → không ghi',
    (SELECT count(*) = 0 FROM notifications
     WHERE user_id = current_setting('test.user')::UUID AND payload ->> 'tag' = 't6'),
    'thông báo vẫn được ghi');
SELECT pg_temp.check('chỉ tắt kênh email → thông báo trong ứng dụng vẫn ghi',
    (SELECT (n).id IS NOT NULL FROM pg_temp.sent('t7') n), 'thông báo bị bỏ nhầm');
SELECT pg_temp.check('thông báo khoá tài khoản luôn được gửi dù người dùng tắt',
    (SELECT (n).id IS NOT NULL FROM pg_temp.sent('t8') n), 'thông báo quan trọng bị bỏ');

DO $$ BEGIN RAISE NOTICE '6.7: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '6.7: TẤT CẢ ĐẠT (14 ca)' AS ket_qua;
