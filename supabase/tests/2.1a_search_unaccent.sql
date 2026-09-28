-- Test kế hoạch 2.1a: tìm kiếm không dấu theo tên, danh mục, xưởng, làng nghề.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "2.1a: TẤT CẢ ĐẠT (10 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.

BEGIN;

-- p_q có khớp sản phẩm p_name không (p_expected TRUE/FALSE).
CREATE FUNCTION pg_temp.expect_match(p_label TEXT, p_q TEXT, p_name TEXT, p_expected BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_found BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM products
                   WHERE name = p_name AND search_vector @@ public.search_query(p_q))
    INTO v_found;
    IF v_found IS DISTINCT FROM p_expected THEN
        RAISE EXCEPTION 'FAIL  % — tìm "%" % "%"', p_label, p_q,
            CASE WHEN p_expected THEN 'KHÔNG ra' ELSE 'lại ra' END, p_name;
    END IF;
    RAISE NOTICE 'PASS  %', p_label;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM products WHERE name = 'Bình hoa gốm men rạn cao 30cm') THEN
        RAISE EXCEPTION 'Thiếu sản phẩm seed — chạy npm run seed:staging trước.';
    END IF;
END $$;

SELECT pg_temp.expect_match('gõ không dấu "gom su" ra "gốm sứ"',
    'gom su', 'Bình hoa gốm men rạn cao 30cm', TRUE);
SELECT pg_temp.expect_match('gõ có dấu "gốm sứ" vẫn ra',
    'gốm sứ', 'Bình hoa gốm men rạn cao 30cm', TRUE);
SELECT pg_temp.expect_match('chữ hoa "BÌNH HOA" vẫn ra',
    'BÌNH HOA', 'Bình hoa gốm men rạn cao 30cm', TRUE);
SELECT pg_temp.expect_match('gõ dở "binh ho" (khớp tiền tố từ cuối)',
    'binh ho', 'Bình hoa gốm men rạn cao 30cm', TRUE);
SELECT pg_temp.expect_match('tìm theo làng nghề "bat trang"',
    'bat trang', 'Bình hoa gốm men rạn cao 30cm', TRUE);
SELECT pg_temp.expect_match('tìm theo danh mục "may tre" ra giỏ mây',
    'may tre', 'Giỏ mây đan quai da size M', TRUE);
SELECT pg_temp.expect_match('"may tre" không ra bình gốm',
    'may tre', 'Bình hoa gốm men rạn cao 30cm', FALSE);

DO $$
BEGIN
    IF public.search_query('  !!! ') IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL  chuỗi chỉ có ký tự đặc biệt phải cho NULL';
    END IF;
    RAISE NOTICE 'PASS  chuỗi rỗng/ký tự đặc biệt → NULL, không lỗi';
END $$;

-- Xưởng A đổi tên → chỉ mục sản phẩm tự tính lại.
UPDATE supplier_profiles SET shop_name = 'Gốm Chu Đậu Hải Dương'
WHERE id = (SELECT supplier_id FROM products WHERE name = 'Bình hoa gốm men rạn cao 30cm');
SELECT pg_temp.expect_match('xưởng đổi tên → tìm tên mới "chu dau" ra',
    'chu dau', 'Bình hoa gốm men rạn cao 30cm', TRUE);

-- Danh mục đổi tên → chỉ mục sản phẩm tự tính lại.
UPDATE categories SET name = 'Gốm sứ và đất nung' WHERE slug = 'gom-su';
SELECT pg_temp.expect_match('danh mục đổi tên → tìm "dat nung" ra',
    'dat nung', 'Bình hoa gốm men rạn cao 30cm', TRUE);

DO $$ BEGIN RAISE NOTICE '2.1a: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '2.1a: TẤT CẢ ĐẠT (10 ca)' AS ket_qua;
