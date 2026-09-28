-- Test kế hoạch 2.2: save_product() lưu nguyên khối, giữ id biến thể.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "2.2: TẤT CẢ ĐẠT (10 ca)". Hỏng: "FAIL …".
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

CREATE FUNCTION pg_temp.check(p_label TEXT, p_ok BOOLEAN, p_detail TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'FAIL  % — %', p_label, p_detail;
    END IF;
    RAISE NOTICE 'PASS  %', p_label;
END $$;

-- Gọi save_product, phải lỗi p_code.
CREATE FUNCTION pg_temp.expect_save_error(p_label TEXT, p_code TEXT, p_id UUID, p_product JSONB,
                                          p_tiers JSONB, p_variants JSONB) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        PERFORM public.save_product(p_id, p_product, p_tiers, p_variants);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = p_code THEN
            RAISE NOTICE 'PASS  %', p_label;
            RETURN;
        END IF;
        RAISE EXCEPTION 'FAIL  % — cần lỗi %, nhận %', p_label, p_code, SQLERRM;
    END;
    RAISE EXCEPTION 'FAIL  % — không bị chặn (cần %)', p_label, p_code;
END $$;

-- ── Chuẩn bị: SKU của xưởng B, danh mục gốm ────────────────────────────
INSERT INTO product_variants (product_id, color, sku)
SELECT p.id, 'Nâu', 'SKU-XUONG-B-1' FROM products p WHERE p.name = 'Giỏ mây đan quai da size M';

SELECT set_config('test.pid', gen_random_uuid()::TEXT, TRUE),
       set_config('test.cat', (SELECT id FROM categories WHERE slug = 'gom-su')::TEXT, TRUE),
       set_config('test.binh', (SELECT id FROM products WHERE name = 'Bình hoa gốm men rạn cao 30cm')::TEXT, TRUE);

-- ── Xưởng A tạo sản phẩm mới ───────────────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT public.save_product(
    current_setting('test.pid')::UUID,
    jsonb_build_object('name', 'Lọ hoa test 2.2', 'category_id', current_setting('test.cat'),
                       'description', 'Mô tả', 'min_order_qty', 20, 'lead_time_days', 10, 'status', 'active'),
    '[{"min_qty":20,"max_qty":99,"unit_price":80000},{"min_qty":100,"max_qty":null,"unit_price":70000}]',
    '[{"color":"Xanh","sku":"SKU-22-XANH"},{"color":"Trắng","sku":"SKU-22-TRANG"}]',
    '[{"r2_key":"test/a.jpg","cdn_url":"https://x/a.jpg","sort_order":0},
      {"r2_key":"test/b.jpg","cdn_url":"https://x/b.jpg","sort_order":1}]');

SELECT pg_temp.check('tạo sản phẩm: 2 bậc giá (có bậc mở), 2 biến thể, 2 ảnh, đúng 1 ảnh chính',
    (SELECT count(*) FROM price_tiers WHERE product_id = current_setting('test.pid')::UUID) = 2
    AND (SELECT count(*) FROM product_variants WHERE product_id = current_setting('test.pid')::UUID) = 2
    AND (SELECT count(*) FILTER (WHERE is_primary) = 1 AND count(*) = 2
         FROM product_media WHERE product_id = current_setting('test.pid')::UUID),
    'số dòng không khớp');

SELECT set_config('test.v_xanh', (SELECT id FROM product_variants WHERE sku = 'SKU-22-XANH')::TEXT, TRUE),
       set_config('test.v_trang', (SELECT id FROM product_variants WHERE sku = 'SKU-22-TRANG')::TEXT, TRUE);

-- ── Sửa: biến thể giữ id ───────────────────────────────────────────────
SELECT public.save_product(
    current_setting('test.pid')::UUID,
    jsonb_build_object('name', 'Lọ hoa test 2.2', 'category_id', current_setting('test.cat'),
                       'min_order_qty', 20, 'lead_time_days', 10, 'status', 'active'),
    '[{"min_qty":20,"max_qty":99,"unit_price":80000},{"min_qty":100,"max_qty":null,"unit_price":70000}]',
    jsonb_build_array(
        jsonb_build_object('id', current_setting('test.v_xanh'), 'color', 'Xanh ngọc', 'sku', 'SKU-22-XANH'),
        jsonb_build_object('id', current_setting('test.v_trang'), 'color', 'Trắng', 'sku', 'SKU-22-TRANG')));
SELECT pg_temp.check('sửa sản phẩm: biến thể giữ nguyên id, đổi được màu',
    (SELECT color FROM product_variants WHERE id = current_setting('test.v_xanh')::UUID) = 'Xanh ngọc',
    'id biến thể đổi hoặc không cập nhật');

-- Bỏ biến thể trắng → tắt, không xoá.
SELECT public.save_product(
    current_setting('test.pid')::UUID,
    jsonb_build_object('name', 'Lọ hoa test 2.2', 'category_id', current_setting('test.cat'),
                       'min_order_qty', 20, 'lead_time_days', 10, 'status', 'active'),
    '[{"min_qty":20,"max_qty":null,"unit_price":80000}]',
    jsonb_build_array(jsonb_build_object('id', current_setting('test.v_xanh'), 'color', 'Xanh ngọc', 'sku', 'SKU-22-XANH')));
SELECT pg_temp.check('bỏ biến thể → is_active = false, vẫn còn trong database',
    (SELECT NOT is_active FROM product_variants WHERE id = current_setting('test.v_trang')::UUID),
    'biến thể bị xoá hoặc vẫn đang bán');

-- Thêm lại cùng SKU, không kèm id → bật lại biến thể cũ.
SELECT public.save_product(
    current_setting('test.pid')::UUID,
    jsonb_build_object('name', 'Lọ hoa test 2.2', 'category_id', current_setting('test.cat'),
                       'min_order_qty', 20, 'lead_time_days', 10, 'status', 'active'),
    '[{"min_qty":20,"max_qty":null,"unit_price":80000}]',
    jsonb_build_array(
        jsonb_build_object('id', current_setting('test.v_xanh'), 'color', 'Xanh ngọc', 'sku', 'SKU-22-XANH'),
        jsonb_build_object('color', 'Trắng sứ', 'sku', 'SKU-22-TRANG')));
SELECT pg_temp.check('thêm lại SKU cũ → bật lại đúng biến thể cũ (giữ id)',
    (SELECT is_active AND color = 'Trắng sứ' FROM product_variants WHERE id = current_setting('test.v_trang')::UUID)
    AND (SELECT count(*) FROM product_variants WHERE product_id = current_setting('test.pid')::UUID) = 2,
    'tạo biến thể mới thay vì bật lại');

-- ── Lỗi giữa chừng: không mất gì ───────────────────────────────────────
SELECT pg_temp.expect_save_error('bậc giá chồng khoảng → báo PRICE_TIERS_OVERLAP', 'PRICE_TIERS_OVERLAP',
    current_setting('test.pid')::UUID,
    jsonb_build_object('name', 'TÊN MỚI KHÔNG ĐƯỢC LƯU', 'category_id', current_setting('test.cat'),
                       'min_order_qty', 20, 'lead_time_days', 10, 'status', 'active'),
    '[{"min_qty":20,"max_qty":200,"unit_price":1},{"min_qty":100,"max_qty":null,"unit_price":1}]',
    '[]');
SELECT pg_temp.check('sau lỗi: tên, bảng giá, biến thể giữ nguyên như trước',
    (SELECT name FROM products WHERE id = current_setting('test.pid')::UUID) = 'Lọ hoa test 2.2'
    AND (SELECT count(*) FROM price_tiers WHERE product_id = current_setting('test.pid')::UUID
                                          AND unit_price = 80000) = 1
    AND (SELECT count(*) FROM product_variants WHERE product_id = current_setting('test.pid')::UUID AND is_active) = 2,
    'dữ liệu bị thay đổi dở dang');

SELECT pg_temp.expect_save_error('dùng SKU của xưởng khác → SKU_TAKEN', 'SKU_TAKEN',
    current_setting('test.pid')::UUID,
    jsonb_build_object('name', 'Lọ hoa test 2.2', 'category_id', current_setting('test.cat'),
                       'min_order_qty', 20, 'lead_time_days', 10, 'status', 'active'),
    '[{"min_qty":20,"max_qty":null,"unit_price":80000}]',
    '[{"color":"Nâu","sku":"SKU-XUONG-B-1"}]');

-- ── Ảnh chính luôn có ──────────────────────────────────────────────────
DO $$
BEGIN
    PERFORM public.save_product(
        current_setting('test.pid')::UUID,
        jsonb_build_object('name', 'Lọ hoa test 2.2', 'category_id', current_setting('test.cat'),
                           'min_order_qty', 20, 'lead_time_days', 10, 'status', 'active'),
        '[{"min_qty":20,"max_qty":null,"unit_price":80000}]',
        jsonb_build_array(
            jsonb_build_object('id', current_setting('test.v_xanh'), 'color', 'Xanh ngọc', 'sku', 'SKU-22-XANH'),
            jsonb_build_object('id', current_setting('test.v_trang'), 'color', 'Trắng sứ', 'sku', 'SKU-22-TRANG')),
        '[]',
        ARRAY(SELECT id FROM product_media WHERE product_id = current_setting('test.pid')::UUID AND is_primary));
END $$;
SELECT pg_temp.check('xoá ảnh chính → ảnh còn lại thành ảnh chính',
    (SELECT count(*) = 1 AND bool_and(is_primary) FROM product_media
     WHERE product_id = current_setting('test.pid')::UUID),
    'không còn ảnh chính');

-- ── Quyền ──────────────────────────────────────────────────────────────
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.expect_save_error('xưởng B sửa sản phẩm của xưởng A → PRODUCT_NOT_FOUND', 'PRODUCT_NOT_FOUND',
    current_setting('test.binh')::UUID,
    jsonb_build_object('name', 'Bị sửa', 'min_order_qty', 1, 'status', 'active'), '[]', '[]');

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_save_error('buyer gọi save_product → NOT_A_SUPPLIER', 'NOT_A_SUPPLIER',
    NULL, jsonb_build_object('name', 'x', 'min_order_qty', 1), '[]', '[]');

DO $$ BEGIN RAISE NOTICE '2.2: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '2.2: TẤT CẢ ĐẠT (10 ca)' AS ket_qua;
