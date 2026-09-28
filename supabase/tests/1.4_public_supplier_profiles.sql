-- Test kế hoạch 1.4: người ngoài không đọc được cột nội bộ của xưởng; view
-- công khai chỉ có cột công khai; buyer có quan hệ vẫn đọc được bảng gốc.
--
-- Chạy trên STAGING sau cả 2 migration 20261005090900 + 20261005091000 và
-- `npm run seed:staging`. Dán cả file vào SQL Editor rồi Run, hoặc:
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/1.4_public_supplier_profiles.sql
-- Đạt: kết quả cuối là "1.4: TẤT CẢ ĐẠT (13 ca)" (psql còn in NOTICE "PASS …").
-- Hỏng: dừng ở ca đầu tiên sai với thông báo "FAIL …".
-- Cả file chạy trong một transaction và ROLLBACK ở cuối: không đổi dữ liệu.

BEGIN;

-- ── Dữ liệu: buyer A gửi RFQ tới xưởng A (quan hệ); xưởng B ẩn số điện
--    thoại. Buyer B không có quan hệ với xưởng nào. ─────────────────────
DO $$
DECLARE
    v_buyer_a UUID;
    v_xa      UUID;
    v_xb      UUID;
    v_rfq     UUID;
BEGIN
    SELECT bp.id INTO v_buyer_a FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    SELECT sp.id INTO v_xb FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.b@langnghe.test';
    IF v_buyer_a IS NULL OR v_xa IS NULL OR v_xb IS NULL THEN
        RAISE EXCEPTION 'Thiếu dữ liệu seed — chạy npm run seed:staging trước.';
    END IF;

    INSERT INTO rfq_requests (buyer_id, title, quantity, rfq_type, status)
    VALUES (v_buyer_a, 'RFQ test 1.4', 10, 'single', 'published') RETURNING id INTO v_rfq;
    INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);

    UPDATE supplier_profiles SET tax_code = '0100000003', risk_score = 30 WHERE id = v_xa;
    UPDATE supplier_profiles
    SET show_phone_public = FALSE, contact_phone = '0911111111', contact_zalo = '0911111111'
    WHERE id = v_xb;

    PERFORM set_config('test.xa', v_xa::TEXT, TRUE),
            set_config('test.xb', v_xb::TEXT, TRUE),
            set_config('test.rfq', v_rfq::TEXT, TRUE);
END $$;

-- ── Công cụ ─────────────────────────────────────────────────────────────
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

-- Câu SELECT count(*) phải ra đúng p_expected.
CREATE FUNCTION pg_temp.expect_count(p_label TEXT, p_expected INT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_n INT;
BEGIN
    EXECUTE p_sql INTO v_n;
    IF v_n <> p_expected THEN
        RAISE EXCEPTION 'FAIL  % — được %, cần %', p_label, v_n, p_expected;
    END IF;
    RAISE NOTICE 'PASS  % (%)', p_label, v_n;
END $$;

-- ── Khách chưa đăng nhập ───────────────────────────────────────────────
SELECT pg_temp.as_anon();
SELECT pg_temp.expect_count('khách không đọc được bảng gốc (mã số thuế, điểm rủi ro…)', 0,
    $q$SELECT count(*) FROM supplier_profiles WHERE tax_code IS NOT NULL OR risk_score IS NOT NULL$q$);
SELECT pg_temp.expect_count('khách thấy 2 xưởng qua view công khai', 2,
    $q$SELECT count(*) FROM public_supplier_profiles
       WHERE id IN (current_setting('test.xa')::UUID, current_setting('test.xb')::UUID)$q$);
SELECT pg_temp.expect_count('view không có cột nội bộ', 0,
    $q$SELECT count(*) FROM information_schema.columns
       WHERE table_name = 'public_supplier_profiles'
         AND column_name IN ('tax_code', 'risk_score', 'trust_score', 'quote_win_rate',
                             'user_id', 'is_hidden', 'show_phone_public')$q$);
SELECT pg_temp.expect_count('view ẩn số điện thoại khi xưởng chọn ẩn', 0,
    $q$SELECT count(*) FROM public_supplier_profiles
       WHERE id = current_setting('test.xb')::UUID
         AND (contact_phone IS NOT NULL OR contact_zalo IS NOT NULL)$q$);

-- Xưởng B bật ẩn gian hàng → biến khỏi view.
RESET ROLE;
UPDATE supplier_profiles SET is_hidden = TRUE WHERE id = current_setting('test.xb')::UUID;
SELECT pg_temp.as_anon();
SELECT pg_temp.expect_count('xưởng ẩn gian hàng không có trong view', 0,
    $q$SELECT count(*) FROM public_supplier_profiles WHERE id = current_setting('test.xb')::UUID$q$);
RESET ROLE;
UPDATE supplier_profiles SET is_hidden = FALSE WHERE id = current_setting('test.xb')::UUID;

-- ── Buyer B: chưa có quan hệ với xưởng nào ─────────────────────────────
SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT pg_temp.expect_count('buyer chưa có quan hệ không đọc được bảng gốc của xưởng A', 0,
    $q$SELECT count(*) FROM supplier_profiles WHERE id = current_setting('test.xa')::UUID$q$);
-- Đúng truy vấn form chọn xưởng (RfqCreateForm) làm.
SELECT pg_temp.expect_count('form chọn xưởng vẫn tìm được xưởng A qua view', 1,
    $q$SELECT count(*) FROM public_supplier_profiles
       WHERE id = current_setting('test.xa')::UUID AND craft_category ILIKE '%Gốm%'$q$);

-- ── Buyer A: đã gửi RFQ tới xưởng A ────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_count('buyer có RFQ gửi tới xưởng A đọc được xưởng A', 1,
    $q$SELECT count(*) FROM supplier_profiles WHERE id = current_setting('test.xa')::UUID$q$);
SELECT pg_temp.expect_count('buyer A không đọc được xưởng B (không quan hệ)', 0,
    $q$SELECT count(*) FROM supplier_profiles WHERE id = current_setting('test.xb')::UUID$q$);
-- Như trang RFQ (rfq/[id]) nhúng supplier_profiles qua rfq_targets.
SELECT pg_temp.expect_count('trang RFQ vẫn hiện tên xưởng được mời', 1,
    $q$SELECT count(*) FROM rfq_targets t JOIN supplier_profiles sp ON sp.id = t.supplier_id
       WHERE t.rfq_id = current_setting('test.rfq')::UUID AND sp.shop_name IS NOT NULL$q$);

-- ── Xưởng và admin ─────────────────────────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_count('xưởng A đọc được hồ sơ của mình', 1,
    $q$SELECT count(*) FROM supplier_profiles WHERE id = current_setting('test.xa')::UUID$q$);
SELECT pg_temp.expect_count('xưởng A không đọc được hồ sơ xưởng B', 0,
    $q$SELECT count(*) FROM supplier_profiles WHERE id = current_setting('test.xb')::UUID$q$);
SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.expect_count('admin đọc được mọi xưởng', 2,
    $q$SELECT count(*) FROM supplier_profiles
       WHERE id IN (current_setting('test.xa')::UUID, current_setting('test.xb')::UUID)$q$);

DO $$ BEGIN RAISE NOTICE '1.4: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

-- SQL Editor không hiện NOTICE: dòng này chỉ hiện khi mọi ca ở trên đều đạt.
SELECT '1.4: TẤT CẢ ĐẠT (13 ca)' AS ket_qua;
