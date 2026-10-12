-- Test bước 6: content_reports / submit_report() / admin_resolve_report(),
-- saved_products.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "6.2: TẤT CẢ ĐẠT (21 ca)". Hỏng: "FAIL …".
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

CREATE FUNCTION pg_temp.as_anon() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);
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

-- Dữ liệu riêng cho test: xưởng A có P1 đang bán, P2 nháp. Xoá sẵn báo cáo
-- và sản phẩm đã lưu của buyer A (ROLLBACK ở cuối trả lại).
DO $$
DECLARE
    v_xa  UUID;
    v_cat UUID;
    v_p1  UUID := gen_random_uuid();
    v_p2  UUID := gen_random_uuid();
    v_ba_user UUID;
BEGIN
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    SELECT id INTO v_ba_user FROM auth.users WHERE email = 'buyer.a@langnghe.test';
    SELECT id INTO v_cat FROM categories WHERE slug = 'gom-su';
    IF v_xa IS NULL OR v_ba_user IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a / xuong.a — chạy npm run seed:staging trước.';
    END IF;
    UPDATE users SET status = 'active'
    WHERE id IN (SELECT user_id FROM supplier_profiles WHERE id = v_xa)
       OR id IN (SELECT u.id FROM auth.users u
                 WHERE u.email IN ('buyer.a@langnghe.test', 'buyer.b@langnghe.test'));
    DELETE FROM content_reports WHERE reporter_id = v_ba_user;
    DELETE FROM saved_products WHERE user_id = v_ba_user;

    INSERT INTO products (id, supplier_id, category_id, name, min_order_qty, lead_time_days, status)
    VALUES (v_p1, v_xa, v_cat, 'Bát gốm test 6.2', 10, 7, 'active'),
           (v_p2, v_xa, v_cat, 'Hàng nháp test 6.2', 10, 7, 'draft');

    PERFORM set_config('test.xb', (SELECT sp.id::TEXT FROM supplier_profiles sp
                                   JOIN auth.users u ON u.id = sp.user_id
                                   WHERE u.email = 'xuong.b@langnghe.test'), TRUE);
    PERFORM set_config('test.xa', v_xa::TEXT, TRUE), set_config('test.p1', v_p1::TEXT, TRUE),
            set_config('test.p2', v_p2::TEXT, TRUE);
END $$;

-- ── Báo cáo vi phạm ────────────────────────────────────────────────────
SELECT pg_temp.as_anon();
SELECT pg_temp.expect_error('khách chưa đăng nhập gửi báo cáo', 'DENIED',
    $q$SELECT public.submit_report('product', current_setting('test.p1')::UUID, 'fake')$q$);

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('loại đối tượng lạ', 'INVALID_REPORT',
    $q$SELECT public.submit_report('order', current_setting('test.p1')::UUID, 'fake')$q$);
SELECT pg_temp.expect_error('lý do lạ', 'INVALID_REPORT',
    $q$SELECT public.submit_report('product', current_setting('test.p1')::UUID, 'ghét')$q$);
SELECT pg_temp.expect_error('lý do "khác" mà không mô tả', 'INVALID_REPORT',
    $q$SELECT public.submit_report('product', current_setting('test.p1')::UUID, 'other')$q$);
SELECT pg_temp.expect_error('sản phẩm nháp (không công khai)', 'TARGET_NOT_FOUND',
    $q$SELECT public.submit_report('product', current_setting('test.p2')::UUID, 'fake')$q$);
SELECT pg_temp.expect_error('client tự ghi vào content_reports', 'DENIED',
    $q$INSERT INTO content_reports (reporter_id, target_type, target_id, reason)
       VALUES (auth.uid(), 'product', current_setting('test.p1')::UUID, 'fake')$q$);
SELECT set_config('test.r1',
    public.submit_report('product', current_setting('test.p1')::UUID, 'fake', '  Ảnh lấy từ xưởng khác ')::TEXT, TRUE);
SELECT pg_temp.check('buyer báo sản phẩm → báo cáo open, đọc lại được',
    (SELECT status = 'open' AND reason = 'fake' AND details = 'Ảnh lấy từ xưởng khác'
            AND reporter_id = auth.uid()
     FROM content_reports WHERE id = current_setting('test.r1')::UUID),
    'báo cáo sai');
SELECT pg_temp.expect_error('báo lại cùng sản phẩm khi báo cáo trước còn mở', 'REPORT_EXISTS',
    $q$SELECT public.submit_report('product', current_setting('test.p1')::UUID, 'spam')$q$);
SELECT set_config('test.r2',
    public.submit_report('supplier', current_setting('test.xa')::UUID, 'wrong_info')::TEXT, TRUE);

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng tự báo sản phẩm của mình', 'CANNOT_REPORT_OWN',
    $q$SELECT public.submit_report('product', current_setting('test.p1')::UUID, 'spam')$q$);
SELECT pg_temp.check('bên bị báo không đọc được báo cáo về mình',
    (SELECT count(*) = 0 FROM content_reports
     WHERE id IN (current_setting('test.r1')::UUID, current_setting('test.r2')::UUID)),
    'lộ báo cáo');
SELECT pg_temp.expect_error('xưởng tự đóng báo cáo', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_resolve_report(current_setting('test.r1')::UUID, 'dismissed')$q$);

-- Giới hạn 10 báo cáo / ngày: buyer A đã có 2, chèn thêm 8 rồi thử cái thứ 11.
SELECT pg_temp.as_system();
INSERT INTO content_reports (reporter_id, target_type, target_id, reason, status)
SELECT (SELECT id FROM auth.users WHERE email = 'buyer.a@langnghe.test'),
       'product', gen_random_uuid(), 'spam', 'dismissed'
FROM generate_series(1, 8);
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('báo cáo thứ 11 trong ngày', 'REPORT_RATE_LIMIT',
    $q$SELECT public.submit_report('supplier', current_setting('test.xb')::UUID, 'spam')$q$);

SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.expect_error('kết quả xử lý lạ', 'INVALID_REPORT',
    $q$SELECT public.admin_resolve_report(current_setting('test.r1')::UUID, 'xong')$q$);
SELECT public.admin_resolve_report(current_setting('test.r1')::UUID, 'resolved', 'Đã gỡ sản phẩm');
SELECT pg_temp.check('admin đóng báo cáo → resolved, có ghi chú và nhật ký',
    (SELECT status = 'resolved' AND resolution_note = 'Đã gỡ sản phẩm' AND resolved_by = auth.uid()
            AND resolved_at IS NOT NULL
     FROM content_reports WHERE id = current_setting('test.r1')::UUID)
    AND (SELECT count(*) = 1 FROM admin_audit_log
         WHERE action = 'report.resolved' AND entity_id = current_setting('test.p1')),
    'đóng báo cáo sai');
SELECT pg_temp.expect_error('đóng lại báo cáo đã đóng', 'REPORT_ALREADY_CLOSED',
    $q$SELECT public.admin_resolve_report(current_setting('test.r1')::UUID, 'dismissed')$q$);

-- ── Sản phẩm đã lưu ────────────────────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
INSERT INTO saved_products (product_id) VALUES (current_setting('test.p1')::UUID);
SELECT pg_temp.check('lưu sản phẩm → user_id tự điền, đọc lại được',
    (SELECT count(*) = 1 AND bool_and(user_id = auth.uid()) FROM saved_products
     WHERE product_id = current_setting('test.p1')::UUID),
    'không lưu được');
SELECT pg_temp.expect_error('lưu hộ tài khoản khác', 'DENIED',
    $q$INSERT INTO saved_products (user_id, product_id)
       VALUES (gen_random_uuid(), current_setting('test.p1')::UUID)$q$);

SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT pg_temp.check('người khác không thấy danh sách đã lưu của buyer A',
    (SELECT count(*) = 0 FROM saved_products WHERE product_id = current_setting('test.p1')::UUID),
    'lộ danh sách đã lưu');
DELETE FROM saved_products WHERE product_id = current_setting('test.p1')::UUID;
SELECT pg_temp.as_anon();
SELECT pg_temp.expect_error('khách đọc saved_products', 'DENIED', $q$SELECT count(*) FROM saved_products$q$);

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('người khác xoá không ảnh hưởng dòng của buyer A',
    (SELECT count(*) = 1 FROM saved_products WHERE product_id = current_setting('test.p1')::UUID),
    'dòng bị người khác xoá');
DELETE FROM saved_products WHERE product_id = current_setting('test.p1')::UUID;
SELECT pg_temp.check('buyer A bỏ lưu được',
    (SELECT count(*) = 0 FROM saved_products WHERE product_id = current_setting('test.p1')::UUID),
    'không bỏ lưu được');

DO $$ BEGIN RAISE NOTICE '6.2: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '6.2: TẤT CẢ ĐẠT (21 ca)' AS ket_qua;
