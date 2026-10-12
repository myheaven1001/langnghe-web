-- Test bước 6 (Công cụ nhà bán): bulk_save_products(), bulk_update_products().
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "6.3: TẤT CẢ ĐẠT (16 ca)". Hỏng: "FAIL …".
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

DO $$
BEGIN
    UPDATE users SET status = 'active'
    WHERE id IN (SELECT u.id FROM auth.users u
                 WHERE u.email IN ('xuong.a@langnghe.test', 'xuong.b@langnghe.test', 'buyer.a@langnghe.test'));
    IF NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'gom-su' AND is_active) THEN
        RAISE EXCEPTION 'Thiếu danh mục gom-su — chạy npm run seed:staging trước.';
    END IF;
    PERFORM set_config('test.cat_name', (SELECT name FROM categories WHERE slug = 'gom-su'), TRUE);
END $$;

-- ── Nhập hàng loạt ─────────────────────────────────────────────────────
SELECT pg_temp.as_anon();
SELECT pg_temp.expect_error('khách chưa đăng nhập nhập sản phẩm', 'DENIED',
    $q$SELECT public.bulk_save_products('[{"name":"x"}]')$q$);
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('buyer nhập sản phẩm', 'NOT_A_SUPPLIER',
    $q$SELECT public.bulk_save_products('[{"name":"x"}]')$q$);

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('danh sách rỗng', 'INVALID_INPUT',
    $q$SELECT public.bulk_save_products('[]')$q$);
SELECT pg_temp.expect_error('quá 200 dòng', 'BULK_LIMIT',
    $q$SELECT public.bulk_save_products(
           (SELECT jsonb_agg(jsonb_build_object('name', 'sp ' || g)) FROM generate_series(1, 201) g))$q$);

-- 7 dòng: 2 dòng đúng (một theo slug, một theo tên danh mục + hàng có sẵn), 5 dòng lỗi.
SELECT set_config('test.result', public.bulk_save_products(jsonb_build_array(
    jsonb_build_object('name', '  Bát gốm nhập 6.3 A ', 'category', 'gom-su', 'min_order_qty', '50',
                       'lead_time_days', '7', 'unit_price', '25000', 'accept_oem', 'có',
                       'description', 'Men lam, đường kính 12cm'),
    jsonb_build_object('name', 'Bát gốm nhập 6.3 B', 'category', upper(current_setting('test.cat_name')),
                       'min_order_qty', 20, 'lead_time_days', 3, 'is_ready_stock', 'x', 'stock_qty', '300'),
    jsonb_build_object('name', '', 'category', 'gom-su', 'min_order_qty', 10, 'lead_time_days', 7),
    jsonb_build_object('name', 'Sai danh mục 6.3', 'category', 'khong-co-danh-muc-nay',
                       'min_order_qty', 10, 'lead_time_days', 7),
    jsonb_build_object('name', 'Sai MOQ 6.3', 'category', 'gom-su', 'min_order_qty', 'mười', 'lead_time_days', 7),
    jsonb_build_object('name', 'Sai giá 6.3', 'category', 'gom-su', 'min_order_qty', 10,
                       'lead_time_days', 7, 'unit_price', '-5'),
    jsonb_build_object('name', 'bát gốm nhập 6.3 a', 'category', 'gom-su', 'min_order_qty', 10, 'lead_time_days', 7)
))::TEXT, TRUE);

SELECT pg_temp.check('7 dòng → tạo 2, lỗi 5, kết quả đủ 7 dòng theo thứ tự',
    (current_setting('test.result')::JSONB ->> 'created')::INT = 2
    AND (current_setting('test.result')::JSONB ->> 'failed')::INT = 5
    AND jsonb_array_length(current_setting('test.result')::JSONB -> 'results') = 7,
    current_setting('test.result'));
SELECT pg_temp.check('mã lỗi từng dòng đúng',
    (SELECT array_agg(COALESCE(r ->> 'error', 'ok') ORDER BY (r ->> 'row')::INT)
            = ARRAY['ok', 'ok', 'NAME_REQUIRED', 'CATEGORY_NOT_FOUND', 'INVALID_NUMBER',
                    'INVALID_PRICE', 'DUPLICATE_NAME']
     FROM jsonb_array_elements(current_setting('test.result')::JSONB -> 'results') r),
    (SELECT string_agg(COALESCE(r ->> 'error', 'ok'), ', ' ORDER BY (r ->> 'row')::INT)
     FROM jsonb_array_elements(current_setting('test.result')::JSONB -> 'results') r));
SELECT set_config('test.pa', current_setting('test.result')::JSONB -> 'results' -> 0 ->> 'id', TRUE);
SELECT set_config('test.pb', current_setting('test.result')::JSONB -> 'results' -> 1 ->> 'id', TRUE);
SELECT pg_temp.check('dòng 1: sản phẩm NHÁP, tên đã cắt khoảng trắng, nhận OEM, có 1 bậc giá từ MOQ',
    (SELECT status = 'draft' AND name = 'Bát gốm nhập 6.3 A' AND accept_oem AND min_order_qty = 50
            AND lead_time_days = 7 AND NOT is_ready_stock AND description = 'Men lam, đường kính 12cm'
     FROM products WHERE id = current_setting('test.pa')::UUID)
    AND (SELECT count(*) = 1 AND bool_and(min_qty = 50 AND max_qty IS NULL AND unit_price = 25000)
         FROM price_tiers WHERE product_id = current_setting('test.pa')::UUID),
    'sản phẩm dòng 1 sai');
SELECT pg_temp.check('dòng 2: nhận tên danh mục (không phân biệt hoa thường), hàng có sẵn kho 300, chưa có giá',
    (SELECT status = 'draft' AND is_ready_stock AND stock_qty = 300
            AND category_id = (SELECT id FROM categories WHERE slug = 'gom-su')
     FROM products WHERE id = current_setting('test.pb')::UUID)
    AND (SELECT count(*) = 0 FROM price_tiers WHERE product_id = current_setting('test.pb')::UUID),
    'sản phẩm dòng 2 sai');

-- ── Sửa hàng loạt ──────────────────────────────────────────────────────
SELECT pg_temp.expect_error('thao tác lạ', 'INVALID_INPUT',
    $q$SELECT public.bulk_update_products(ARRAY[current_setting('test.pa')::UUID], 'delete_all', 1)$q$);
SELECT pg_temp.expect_error('tăng giá 0%', 'INVALID_INPUT',
    $q$SELECT public.bulk_update_products(ARRAY[current_setting('test.pa')::UUID], 'adjust_price', 0)$q$);
SELECT set_config('test.n', public.bulk_update_products(
    ARRAY[current_setting('test.pa')::UUID, current_setting('test.pb')::UUID], 'adjust_price', 10)::TEXT, TRUE);
SELECT pg_temp.check('tăng giá 10% → 25.000 thành 27.500; chỉ tính sản phẩm có bảng giá (1)',
    current_setting('test.n')::INT = 1
    AND (SELECT unit_price = 27500 FROM price_tiers WHERE product_id = current_setting('test.pa')::UUID),
    current_setting('test.n') || ' / ' ||
        (SELECT unit_price::TEXT FROM price_tiers WHERE product_id = current_setting('test.pa')::UUID));
SELECT set_config('test.n', public.bulk_update_products(
    ARRAY[current_setting('test.pa')::UUID], 'adjust_price', -33)::TEXT, TRUE);
SELECT pg_temp.check('giảm 33% → làm tròn tới 100đ (18.400)',
    (SELECT unit_price = 18400 FROM price_tiers WHERE product_id = current_setting('test.pa')::UUID),
    (SELECT unit_price::TEXT FROM price_tiers WHERE product_id = current_setting('test.pa')::UUID));
SELECT set_config('test.n', public.bulk_update_products(
    ARRAY[current_setting('test.pa')::UUID, current_setting('test.pb')::UUID], 'set_lead_time', 14)::TEXT, TRUE);
SELECT pg_temp.check('đặt thời gian sản xuất 14 ngày cho 2 sản phẩm',
    current_setting('test.n')::INT = 2
    AND (SELECT bool_and(lead_time_days = 14) FROM products
         WHERE id IN (current_setting('test.pa')::UUID, current_setting('test.pb')::UUID)),
    current_setting('test.n'));
SELECT set_config('test.n', public.bulk_update_products(
    ARRAY[current_setting('test.pa')::UUID, current_setting('test.pb')::UUID], 'set_moq', 30)::TEXT, TRUE);
SELECT pg_temp.check('MOQ 30: bỏ qua sản phẩm có bậc giá bắt đầu từ 50, đổi sản phẩm chưa có giá',
    current_setting('test.n')::INT = 1
    AND (SELECT min_order_qty = 50 FROM products WHERE id = current_setting('test.pa')::UUID)
    AND (SELECT min_order_qty = 30 FROM products WHERE id = current_setting('test.pb')::UUID),
    current_setting('test.n'));

SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT set_config('test.n', public.bulk_update_products(
    ARRAY[current_setting('test.pa')::UUID], 'adjust_price', 50)::TEXT, TRUE);
SELECT pg_temp.check('xưởng khác sửa hàng loạt sản phẩm không phải của mình → 0, giá không đổi',
    current_setting('test.n')::INT = 0,
    current_setting('test.n'));
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('giá của xưởng A vẫn 18.400',
    (SELECT unit_price = 18400 FROM price_tiers WHERE product_id = current_setting('test.pa')::UUID),
    (SELECT unit_price::TEXT FROM price_tiers WHERE product_id = current_setting('test.pa')::UUID));

DO $$ BEGIN RAISE NOTICE '6.3: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '6.3: TẤT CẢ ĐẠT (16 ca)' AS ket_qua;
