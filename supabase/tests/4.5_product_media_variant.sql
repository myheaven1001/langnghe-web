-- Test kế hoạch 4.5: ảnh theo biến thể (product_media.variant_id) qua
-- save_product().
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "4.5: TẤT CẢ ĐẠT (6 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.
-- Chạy lại thêm 2.2 (cùng hàm save_product).

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

-- Ảnh nào đang gắn với biến thể màu nào: "a.jpg=Xanh, b.jpg=-, …".
CREATE FUNCTION pg_temp.media_map(p_product UUID) RETURNS TEXT LANGUAGE sql AS $$
    SELECT string_agg(split_part(m.r2_key, '/', 2) || '=' || COALESCE(v.color, '-'), ', '
                      ORDER BY m.r2_key)
    FROM product_media m
    LEFT JOIN product_variants v ON v.id = m.variant_id
    WHERE m.product_id = p_product;
$$;

SELECT set_config('test.pid', gen_random_uuid()::TEXT, TRUE),
       set_config('test.cat', (SELECT id FROM categories WHERE slug = 'gom-su')::TEXT, TRUE);

-- ── Xưởng A tạo sản phẩm: ảnh gắn với biến thể VỪA TẠO trong cùng lần lưu ──
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT public.save_product(
    current_setting('test.pid')::UUID,
    jsonb_build_object('name', 'Lọ hoa test 4.5', 'category_id', current_setting('test.cat'),
                       'description', 'Mô tả', 'min_order_qty', 20, 'lead_time_days', 10, 'status', 'active'),
    '[{"min_qty":20,"max_qty":null,"unit_price":80000}]',
    '[{"color":"Xanh","size":"30cm","sku":"SKU-45-XANH"},{"color":"Trắng","size":"30cm","sku":"SKU-45-TRANG"}]',
    '[{"r2_key":"test/a.jpg","cdn_url":"https://x/a.jpg","sort_order":0,"variant_key":"XANH|30cm|"},
      {"r2_key":"test/b.jpg","cdn_url":"https://x/b.jpg","sort_order":1},
      {"r2_key":"test/c.jpg","cdn_url":"https://x/c.jpg","sort_order":2,"variant_key":"tím|30cm|"}]');

SELECT pg_temp.check('ảnh a gắn biến thể Xanh (không phân biệt hoa/thường); b và khoá lạ c là ảnh chung',
    pg_temp.media_map(current_setting('test.pid')::UUID) = 'a.jpg=Xanh, b.jpg=-, c.jpg=-',
    pg_temp.media_map(current_setting('test.pid')::UUID));
SELECT pg_temp.check('vẫn đúng 1 ảnh chính',
    (SELECT count(*) FILTER (WHERE is_primary) = 1 FROM product_media
     WHERE product_id = current_setting('test.pid')::UUID),
    'số ảnh chính sai');

SELECT set_config('test.a', (SELECT id::TEXT FROM product_media WHERE r2_key = 'test/a.jpg'
                             AND product_id = current_setting('test.pid')::UUID), TRUE),
       set_config('test.b', (SELECT id::TEXT FROM product_media WHERE r2_key = 'test/b.jpg'
                             AND product_id = current_setting('test.pid')::UUID), TRUE),
       set_config('test.v_xanh', (SELECT id::TEXT FROM product_variants WHERE sku = 'SKU-45-XANH'), TRUE),
       set_config('test.v_trang', (SELECT id::TEXT FROM product_variants WHERE sku = 'SKU-45-TRANG'), TRUE);

-- ── Sửa: đổi gắn ảnh đã có (b → Trắng, a → ảnh chung) ──────────────────
SELECT public.save_product(
    current_setting('test.pid')::UUID,
    jsonb_build_object('name', 'Lọ hoa test 4.5', 'category_id', current_setting('test.cat'),
                       'min_order_qty', 20, 'lead_time_days', 10, 'status', 'active'),
    '[{"min_qty":20,"max_qty":null,"unit_price":80000}]',
    jsonb_build_array(
        jsonb_build_object('id', current_setting('test.v_xanh'), 'color', 'Xanh', 'size', '30cm', 'sku', 'SKU-45-XANH'),
        jsonb_build_object('id', current_setting('test.v_trang'), 'color', 'Trắng', 'size', '30cm', 'sku', 'SKU-45-TRANG')),
    '[]', '{}',
    jsonb_build_array(
        jsonb_build_object('id', current_setting('test.b'), 'variant_key', 'trắng|30cm|'),
        jsonb_build_object('id', current_setting('test.a'), 'variant_key', '')));
SELECT pg_temp.check('đổi gắn ảnh đã có: b → Trắng, a → ảnh chung, c không đụng',
    pg_temp.media_map(current_setting('test.pid')::UUID) = 'a.jpg=-, b.jpg=Trắng, c.jpg=-',
    pg_temp.media_map(current_setting('test.pid')::UUID));

-- Lưu lại KHÔNG gửi p_media_variants (như web cũ): giữ nguyên gắn ảnh.
SELECT public.save_product(
    current_setting('test.pid')::UUID,
    jsonb_build_object('name', 'Lọ hoa test 4.5', 'category_id', current_setting('test.cat'),
                       'min_order_qty', 20, 'lead_time_days', 10, 'status', 'active'),
    '[{"min_qty":20,"max_qty":null,"unit_price":80000}]',
    jsonb_build_array(
        jsonb_build_object('id', current_setting('test.v_xanh'), 'color', 'Xanh', 'size', '30cm', 'sku', 'SKU-45-XANH'),
        jsonb_build_object('id', current_setting('test.v_trang'), 'color', 'Trắng', 'size', '30cm', 'sku', 'SKU-45-TRANG')));
SELECT pg_temp.check('lưu kiểu cũ (không gửi gắn ảnh) → gắn ảnh giữ nguyên',
    pg_temp.media_map(current_setting('test.pid')::UUID) = 'a.jpg=-, b.jpg=Trắng, c.jpg=-',
    pg_temp.media_map(current_setting('test.pid')::UUID));

-- ── Bỏ biến thể Trắng → ảnh của nó thành ảnh chung ─────────────────────
SELECT public.save_product(
    current_setting('test.pid')::UUID,
    jsonb_build_object('name', 'Lọ hoa test 4.5', 'category_id', current_setting('test.cat'),
                       'min_order_qty', 20, 'lead_time_days', 10, 'status', 'active'),
    '[{"min_qty":20,"max_qty":null,"unit_price":80000}]',
    jsonb_build_array(
        jsonb_build_object('id', current_setting('test.v_xanh'), 'color', 'Xanh', 'size', '30cm', 'sku', 'SKU-45-XANH')));
SELECT pg_temp.check('bỏ biến thể Trắng → ảnh b thành ảnh chung, không mất ảnh',
    pg_temp.media_map(current_setting('test.pid')::UUID) = 'a.jpg=-, b.jpg=-, c.jpg=-',
    pg_temp.media_map(current_setting('test.pid')::UUID));

-- ── Xưởng B không gắn được ảnh của xưởng A ─────────────────────────────
SELECT pg_temp.login('xuong.b@langnghe.test');
DO $$
DECLARE
    v_rows INT;
BEGIN
    UPDATE product_media SET variant_id = NULL, sort_order = 99
    WHERE product_id = current_setting('test.pid')::UUID;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN
        RAISE EXCEPTION 'FAIL  xưởng B sửa ảnh của xưởng A — đổi được % dòng', v_rows;
    END IF;
    RAISE NOTICE 'PASS  xưởng B sửa ảnh của xưởng A → không đổi gì';
END $$;

DO $$ BEGIN RAISE NOTICE '4.5: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '4.5: TẤT CẢ ĐẠT (6 ca)' AS ket_qua;
