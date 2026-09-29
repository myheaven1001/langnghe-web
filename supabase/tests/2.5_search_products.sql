-- Test kế hoạch 2.5: search_products(), search_facets(), log_search().
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "2.5: TẤT CẢ ĐẠT (10 ca)". Hỏng: "FAIL …".
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

-- Tìm như khách (anon): chỉ thấy sản phẩm công khai.
SELECT set_config('request.jwt.claims', '{"role":"anon"}', TRUE);
SET LOCAL ROLE anon;

SELECT pg_temp.check('"gom su" (không dấu) ra 3 sản phẩm gốm, tổng đếm đúng',
    (SELECT count(*) = 3 AND bool_and(total_count = 3) FROM public.search_products('gom su')),
    (SELECT string_agg(name, ', ') FROM public.search_products('gom su')));

SELECT pg_temp.check('không từ khoá → mọi sản phẩm công khai (4), không có hàng nháp',
    (SELECT count(*) = 4 AND bool_and(name NOT LIKE '%(nháp)%') FROM public.search_products()),
    (SELECT count(*)::TEXT FROM public.search_products()));

SELECT pg_temp.check('lọc danh mục may-tre-dan → chỉ giỏ mây',
    (SELECT count(*) = 1 AND bool_and(name LIKE 'Giỏ mây%')
     FROM public.search_products(p_category_slug => 'may-tre-dan')),
    'sai kết quả lọc danh mục');

SELECT pg_temp.check('lọc giá tối đa 90.000đ → giỏ mây (55k) và đĩa gốm (85k)',
    (SELECT count(*) = 2 FROM public.search_products(p_max_price => 90000)),
    (SELECT string_agg(name || ' ' || min_price, ', ') FROM public.search_products(p_max_price => 90000)));

SELECT pg_temp.check('lọc MOQ tối đa 50 → bình hoa (50) và bộ ấm (30)',
    (SELECT count(*) = 2 FROM public.search_products(p_max_moq => 50)),
    (SELECT string_agg(name || ' MOQ ' || moq, ', ') FROM public.search_products(p_max_moq => 50)));

SELECT pg_temp.check('chỉ xưởng xác minh → 3 sản phẩm xưởng A',
    (SELECT count(*) = 3 AND bool_and(supplier_verified) FROM public.search_products(p_verified_only => TRUE)),
    'sai lọc xác minh');

SELECT pg_temp.check('sắp xếp giá tăng dần',
    (SELECT array_agg(min_price) = array_agg(min_price ORDER BY min_price)
     FROM public.search_products(p_sort => 'price_asc')),
    'thứ tự giá sai');

SELECT pg_temp.check('phân trang: trang 2 (2 sp/trang) vẫn báo tổng 4',
    (SELECT count(*) = 2 AND bool_and(total_count = 4)
     FROM public.search_products(p_limit => 2, p_offset => 2)),
    'sai phân trang');

SELECT pg_temp.check('facets "gom" → Gốm sứ (3)',
    EXISTS (SELECT 1 FROM public.search_facets('gom') WHERE category_slug = 'gom-su' AND product_count = 3),
    (SELECT string_agg(category_slug || ':' || product_count, ', ') FROM public.search_facets('gom')));

RESET ROLE;
SELECT pg_temp.check('log_search("gốm sứ") đếm 3 kết quả (không dấu, chỉ hàng công khai)',
    public.log_search('gốm sứ') = 3,
    'đếm sai');

DO $$ BEGIN RAISE NOTICE '2.5: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '2.5: TẤT CẢ ĐẠT (10 ca)' AS ket_qua;
