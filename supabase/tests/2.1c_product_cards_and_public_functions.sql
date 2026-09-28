-- Test kế hoạch 2.1c: product_cards, public_stats(), search_suggest(),
-- create_rfq(p_product_id).
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "2.1c: TẤT CẢ ĐẠT (11 ca)". Hỏng: "FAIL …".
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

-- Gọi create_rfq, phải lỗi p_code.
CREATE FUNCTION pg_temp.expect_rfq_error(p_label TEXT, p_code TEXT, p_product UUID, p_supplier UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        PERFORM public.create_rfq('RFQ test 2.1c', NULL, 10, 'cái', NULL, NULL, NULL, 'single',
                                  NULL, ARRAY[p_supplier], p_product);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = p_code THEN
            RAISE NOTICE 'PASS  %', p_label;
            RETURN;
        END IF;
        RAISE EXCEPTION 'FAIL  % — cần lỗi %, nhận %', p_label, p_code, SQLERRM;
    END;
    RAISE EXCEPTION 'FAIL  % — không bị chặn (cần %)', p_label, p_code;
END $$;

-- ID dùng chung (tra trước khi đổi role).
SELECT set_config('test.binh', (SELECT id FROM products WHERE name = 'Bình hoa gốm men rạn cao 30cm')::TEXT, TRUE),
       set_config('test.nhap', (SELECT id FROM products WHERE name LIKE 'Khay tre đan%(nháp)')::TEXT, TRUE),
       set_config('test.xa', (SELECT sp.id FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
                              WHERE u.email = 'xuong.a@langnghe.test')::TEXT, TRUE),
       set_config('test.xb', (SELECT sp.id FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
                              WHERE u.email = 'xuong.b@langnghe.test')::TEXT, TRUE);

-- ── product_cards (khách) ──────────────────────────────────────────────
SELECT pg_temp.as_anon();
SELECT pg_temp.check('thẻ sản phẩm có giá thấp/cao nhất, MOQ, danh mục, xưởng đã xác minh',
    (SELECT min_price = 95000 AND max_price = 120000 AND moq = 50 AND category_slug = 'gom-su'
            AND supplier_verified AND supplier_slug IS NOT NULL AND slug IS NOT NULL
     FROM product_cards WHERE id = current_setting('test.binh')::UUID),
    (SELECT row_to_json(pc)::TEXT FROM (SELECT min_price, max_price, moq, category_slug, supplier_verified
                                        FROM product_cards WHERE id = current_setting('test.binh')::UUID) pc));
SELECT pg_temp.check('sản phẩm nháp không có trong product_cards',
    NOT EXISTS (SELECT 1 FROM product_cards WHERE id = current_setting('test.nhap')::UUID), 'thấy sản phẩm nháp');

RESET ROLE;
UPDATE supplier_profiles SET is_hidden = TRUE WHERE id = current_setting('test.xb')::UUID;
SELECT pg_temp.as_anon();
SELECT pg_temp.check('xưởng ẩn gian hàng → sản phẩm không có trong product_cards',
    NOT EXISTS (SELECT 1 FROM product_cards WHERE supplier_id = current_setting('test.xb')::UUID),
    'vẫn thấy sản phẩm xưởng B');
RESET ROLE;
UPDATE supplier_profiles SET is_hidden = FALSE WHERE id = current_setting('test.xb')::UUID;

-- ── public_stats, search_suggest (khách) ───────────────────────────────
SELECT pg_temp.as_anon();
SELECT pg_temp.check('public_stats có số xưởng, sản phẩm, làng nghề, danh mục',
    (SELECT (s->>'suppliers')::INT >= 2 AND (s->>'products')::INT >= 4
            AND (s->>'villages')::INT >= 2 AND (s->>'categories')::INT = 10
     FROM (SELECT public.public_stats() AS s) x),
    (SELECT public.public_stats()::TEXT));
SELECT pg_temp.check('gợi ý "gom" có danh mục Gốm sứ',
    EXISTS (SELECT 1 FROM public.search_suggest('gom') WHERE kind = 'category' AND slug = 'gom-su'),
    'thiếu danh mục');
SELECT pg_temp.check('gợi ý "gom" có xưởng gốm và sản phẩm gốm',
    EXISTS (SELECT 1 FROM public.search_suggest('gom') WHERE kind = 'supplier')
    AND EXISTS (SELECT 1 FROM public.search_suggest('gom') WHERE kind = 'product'),
    (SELECT string_agg(kind || ':' || label, ', ') FROM public.search_suggest('gom')));
SELECT pg_temp.check('gợi ý với chuỗi rỗng không trả gì',
    NOT EXISTS (SELECT 1 FROM public.search_suggest('   ')), 'có kết quả');

-- ── create_rfq ─────────────────────────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
DO $$
DECLARE
    v_rfq JSONB;
BEGIN
    -- Lời gọi 10 tham số như Edge Function cũ.
    v_rfq := public.create_rfq('RFQ test 2.1c cũ', NULL, 10, 'cái', NULL, NULL, NULL, 'single',
                               NULL, ARRAY[current_setting('test.xa')::UUID]);
    RAISE NOTICE 'PASS  lời gọi create_rfq kiểu cũ (không có sản phẩm) vẫn chạy';

    v_rfq := public.create_rfq('RFQ test 2.1c sản phẩm', NULL, 300, 'cái', NULL, NULL, NULL, 'single',
                               NULL, ARRAY[current_setting('test.xa')::UUID],
                               current_setting('test.binh')::UUID);
    IF (SELECT product_id FROM rfq_requests WHERE id = (v_rfq->>'rfq_id')::UUID)
       IS DISTINCT FROM current_setting('test.binh')::UUID THEN
        RAISE EXCEPTION 'FAIL  RFQ từ trang sản phẩm không gắn product_id';
    END IF;
    RAISE NOTICE 'PASS  RFQ gửi từ trang sản phẩm gắn đúng sản phẩm';
END $$;
SELECT pg_temp.expect_rfq_error('RFQ gắn sản phẩm xưởng A nhưng gửi xưởng B', 'PRODUCT_SUPPLIER_MISMATCH',
    current_setting('test.binh')::UUID, current_setting('test.xb')::UUID);
SELECT pg_temp.expect_rfq_error('RFQ gắn sản phẩm nháp', 'PRODUCT_NOT_AVAILABLE',
    current_setting('test.nhap')::UUID, current_setting('test.xb')::UUID);

DO $$ BEGIN RAISE NOTICE '2.1c: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '2.1c: TẤT CẢ ĐẠT (11 ca)' AS ket_qua;
