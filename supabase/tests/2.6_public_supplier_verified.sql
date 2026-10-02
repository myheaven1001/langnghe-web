-- Test kế hoạch 2.6: public_supplier_profiles.verified + tìm sản phẩm theo
-- xưởng / danh mục (dữ liệu cho /shops/[id] và /categories/[slug]).
--
-- Chạy trên STAGING sau `npm run seed:staging` và sau 20261005091500 (2.5).
-- Đạt: kết quả cuối là "2.6: TẤT CẢ ĐẠT (5 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.

BEGIN;

CREATE FUNCTION pg_temp.check(p_label TEXT, p_ok BOOLEAN, p_detail TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'FAIL  % — %', p_label, p_detail;
    END IF;
    RAISE NOTICE 'PASS  %', p_label;
END $$;

SELECT set_config('test.xa', (SELECT sp.id FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
                              WHERE u.email = 'xuong.a@langnghe.test')::TEXT, TRUE),
       set_config('test.xb', (SELECT sp.id FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
                              WHERE u.email = 'xuong.b@langnghe.test')::TEXT, TRUE);

-- Như khách chưa đăng nhập.
SELECT set_config('request.jwt.claims', '{"role":"anon"}', TRUE);
SET LOCAL ROLE anon;

SELECT pg_temp.check('xưởng A (đã duyệt xác minh) có verified = true',
    (SELECT verified FROM public_supplier_profiles WHERE id = current_setting('test.xa')::UUID),
    'verified không phải true');
SELECT pg_temp.check('xưởng B (chưa xác minh) có verified = false',
    (SELECT NOT verified FROM public_supplier_profiles WHERE id = current_setting('test.xb')::UUID),
    'verified không phải false');
SELECT pg_temp.check('mở gian hàng theo slug',
    (SELECT count(*) = 1 FROM public_supplier_profiles
     WHERE slug = (SELECT slug FROM public_supplier_profiles WHERE id = current_setting('test.xa')::UUID)),
    'không tìm được theo slug');
SELECT pg_temp.check('trang gian hàng xưởng A: 3 sản phẩm, ngành Gốm sứ (3)',
    (SELECT count(*) = 3 FROM public.search_products(p_supplier_id => current_setting('test.xa')::UUID))
    AND EXISTS (SELECT 1 FROM public.search_facets(p_supplier_id => current_setting('test.xa')::UUID)
                WHERE category_slug = 'gom-su' AND product_count = 3),
    'sai sản phẩm theo xưởng');
SELECT pg_temp.check('trang danh mục may-tre-dan: 1 sản phẩm của xưởng B',
    (SELECT count(*) = 1 AND bool_and(shop_name LIKE 'Mây tre%')
     FROM public.search_products(p_category_slug => 'may-tre-dan')),
    'sai sản phẩm theo danh mục');

DO $$ BEGIN RAISE NOTICE '2.6: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '2.6: TẤT CẢ ĐẠT (5 ca)' AS ket_qua;
