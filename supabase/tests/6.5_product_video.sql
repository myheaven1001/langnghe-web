-- Test bước 6: products.video_path + bucket product-videos.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "6.5: TẤT CẢ ĐẠT (10 ca)". Hỏng: "FAIL …".
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

-- 'CHECK' = vi phạm ràng buộc CHECK; 'DENIED' = bị từ chối quyền / RLS.
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
        WHEN check_violation THEN
            IF p_code = 'CHECK' THEN
                RAISE NOTICE 'PASS  % (vi phạm ràng buộc)', p_label;
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

-- Dữ liệu riêng cho test: xưởng A có sản phẩm P1 đang bán; xưởng B có P2.
DO $$
DECLARE
    v_xa  UUID;
    v_xb  UUID;
    v_cat UUID;
    v_p1  UUID := gen_random_uuid();
    v_p2  UUID := gen_random_uuid();
BEGIN
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    SELECT sp.id INTO v_xb FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.b@langnghe.test';
    SELECT id INTO v_cat FROM categories WHERE slug = 'gom-su';
    IF v_xa IS NULL OR v_xb IS NULL THEN
        RAISE EXCEPTION 'Thiếu xuong.a / xuong.b — chạy npm run seed:staging trước.';
    END IF;
    UPDATE users SET status = 'active'
    WHERE id IN (SELECT user_id FROM supplier_profiles WHERE id IN (v_xa, v_xb));
    UPDATE supplier_profiles SET is_hidden = FALSE WHERE id IN (v_xa, v_xb);

    INSERT INTO products (id, supplier_id, category_id, name, min_order_qty, lead_time_days, status)
    VALUES (v_p1, v_xa, v_cat, 'Bát gốm test 6.5', 10, 7, 'active'),
           (v_p2, v_xb, v_cat, 'Giỏ mây test 6.5', 10, 7, 'active');

    PERFORM set_config('test.xa', v_xa::TEXT, TRUE), set_config('test.xb', v_xb::TEXT, TRUE),
            set_config('test.p1', v_p1::TEXT, TRUE), set_config('test.p2', v_p2::TEXT, TRUE),
            set_config('test.good', v_xa::TEXT || '/' || v_p1::TEXT || '/gioi-thieu.mp4', TRUE);
END $$;

SELECT pg_temp.check('bucket product-videos: công khai, 50MB, chỉ mp4 / webm',
    (SELECT public AND file_size_limit = 52428800
            AND allowed_mime_types = ARRAY['video/mp4', 'video/webm']
     FROM storage.buckets WHERE id = 'product-videos'),
    'bucket sai cấu hình');

-- ── Xưởng gắn video cho sản phẩm của mình ──────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
UPDATE products SET video_path = current_setting('test.good') WHERE id = current_setting('test.p1')::UUID;
SELECT pg_temp.check('xưởng gắn video đúng thư mục của sản phẩm',
    (SELECT video_path = current_setting('test.good') FROM products WHERE id = current_setting('test.p1')::UUID),
    'không lưu được video_path');
SELECT pg_temp.expect_error('địa chỉ bên ngoài', 'CHECK',
    $q$UPDATE products SET video_path = 'https://example.com/a.mp4' WHERE id = current_setting('test.p1')::UUID$q$);
SELECT pg_temp.expect_error('file trong thư mục của xưởng khác', 'CHECK',
    $q$UPDATE products SET video_path = current_setting('test.xb') || '/' || current_setting('test.p2') || '/a.mp4'
       WHERE id = current_setting('test.p1')::UUID$q$);
SELECT pg_temp.expect_error('file của sản phẩm khác cùng xưởng', 'CHECK',
    $q$UPDATE products SET video_path = current_setting('test.xa') || '/' || gen_random_uuid() || '/a.mp4'
       WHERE id = current_setting('test.p1')::UUID$q$);
SELECT pg_temp.expect_error('đuôi file không phải video', 'CHECK',
    $q$UPDATE products SET video_path = current_setting('test.xa') || '/' || current_setting('test.p1') || '/a.exe'
       WHERE id = current_setting('test.p1')::UUID$q$);
SELECT pg_temp.expect_error('đường dẫn lùi thư mục', 'CHECK',
    $q$UPDATE products SET video_path = current_setting('test.xa') || '/' || current_setting('test.p1') || '/../x/a.mp4'
       WHERE id = current_setting('test.p1')::UUID$q$);

-- ── Người khác ─────────────────────────────────────────────────────────
SELECT pg_temp.login('xuong.b@langnghe.test');
UPDATE products SET video_path = NULL WHERE id = current_setting('test.p1')::UUID;
SELECT pg_temp.check('xưởng khác không gỡ được video của sản phẩm không phải của mình',
    (SELECT video_path = current_setting('test.good') FROM products WHERE id = current_setting('test.p1')::UUID),
    'video bị xưởng khác gỡ');

SELECT pg_temp.as_anon();
SELECT pg_temp.check('khách đọc được video_path của sản phẩm đang bán',
    (SELECT video_path = current_setting('test.good') FROM products WHERE id = current_setting('test.p1')::UUID),
    'khách không đọc được');

SELECT pg_temp.login('xuong.a@langnghe.test');
UPDATE products SET video_path = NULL WHERE id = current_setting('test.p1')::UUID;
SELECT pg_temp.check('xưởng gỡ video của mình',
    (SELECT video_path IS NULL FROM products WHERE id = current_setting('test.p1')::UUID),
    'không gỡ được');

DO $$ BEGIN RAISE NOTICE '6.5: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '6.5: TẤT CẢ ĐẠT (10 ca)' AS ket_qua;
