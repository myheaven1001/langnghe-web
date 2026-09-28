-- Test kế hoạch 1.7: tài khoản bị khoá không ghi được dữ liệu (kể cả qua
-- create_rfq / accept_quote); tài khoản active và pending không bị ảnh hưởng.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào Supabase
-- Dashboard → SQL Editor rồi Run, hoặc:
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/1.7_block_suspended_accounts.sql
-- Đạt: kết quả cuối là "1.7: TẤT CẢ ĐẠT (12 ca)" (psql còn in NOTICE "PASS …").
-- Hỏng: dừng ở ca đầu tiên sai với thông báo "FAIL …".
-- Cả file chạy trong một transaction và ROLLBACK ở cuối: không đổi dữ liệu.
--
-- Lưu ý: RLS chặn UPDATE bằng cách "không thấy dòng" — ca UPDATE bị chặn
-- mong đợi 0 dòng bị đổi, không phải lỗi.

BEGIN;

-- ── Dữ liệu: RFQ của buyer B có báo giá đang chờ của xưởng A; khoá buyer B
--    và xưởng B ─────────────────────────────────────────────────────────
DO $$
DECLARE
    v_buyer_b  UUID;
    v_xa       UUID;
    v_xb       UUID;
    v_category UUID;
    v_rfq      UUID;
    v_quote    UUID;
    v_product  UUID;
BEGIN
    SELECT bp.id INTO v_buyer_b FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.b@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    SELECT sp.id INTO v_xb FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.b@langnghe.test';
    SELECT id INTO v_category FROM categories WHERE slug = 'gom-su';
    SELECT id INTO v_product FROM products WHERE supplier_id = v_xb AND status = 'active' LIMIT 1;
    IF v_buyer_b IS NULL OR v_xa IS NULL OR v_xb IS NULL OR v_product IS NULL THEN
        RAISE EXCEPTION 'Thiếu dữ liệu seed — chạy npm run seed:staging trước.';
    END IF;

    INSERT INTO rfq_requests (buyer_id, category_id, title, quantity, unit, rfq_type, status)
    VALUES (v_buyer_b, v_category, 'RFQ test 1.7', 100, 'cái', 'single', 'quoted')
    RETURNING id INTO v_rfq;
    -- Gửi cho cả xưởng B để xưởng B thấy RFQ: nếu không, trigger 1.5 trả
    -- RFQ_NOT_OPEN trước khi lớp 1.7 kịp chặn.
    INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa), (v_rfq, v_xb);
    INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, status)
    VALUES (v_rfq, v_xa, 90000, 'pending') RETURNING id INTO v_quote;

    UPDATE users SET status = 'suspended'
    WHERE id IN (SELECT id FROM auth.users WHERE email IN ('buyer.b@langnghe.test', 'xuong.b@langnghe.test'));

    PERFORM set_config('test.rfq', v_rfq::TEXT, TRUE),
            set_config('test.quote', v_quote::TEXT, TRUE),
            set_config('test.category', v_category::TEXT, TRUE),
            set_config('test.xa', v_xa::TEXT, TRUE),
            set_config('test.xb', v_xb::TEXT, TRUE),
            set_config('test.xb_product', v_product::TEXT, TRUE);
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

-- Câu lệnh phải đổi đúng p_rows dòng và không lỗi.
CREATE FUNCTION pg_temp.expect_rows(p_label TEXT, p_rows INT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_rows INT;
BEGIN
    BEGIN
        EXECUTE p_sql;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'FAIL  % — lỗi không mong đợi: %', p_label, SQLERRM;
    END;
    IF v_rows <> p_rows THEN
        RAISE EXCEPTION 'FAIL  % — đổi % dòng, cần %', p_label, v_rows, p_rows;
    END IF;
    RAISE NOTICE 'PASS  % (% dòng)', p_label, v_rows;
END $$;

-- Câu lệnh phải lỗi: p_code = mã lỗi RAISE, hoặc 'RLS' = bị RLS từ chối (42501).
CREATE FUNCTION pg_temp.expect_error(p_label TEXT, p_code TEXT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION
        WHEN insufficient_privilege THEN
            IF p_code = 'RLS' THEN
                RAISE NOTICE 'PASS  % (RLS từ chối)', p_label;
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
    RAISE EXCEPTION 'FAIL  % — câu lệnh không bị chặn (cần %)', p_label, p_code;
END $$;

-- ── Buyer B bị khoá ────────────────────────────────────────────────────
SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT pg_temp.expect_rows('buyer bị khoá sửa hồ sơ → không đổi gì', 0,
    $q$UPDATE buyer_profiles SET company_name = 'x' WHERE user_id = auth.uid()$q$);
SELECT pg_temp.expect_error('buyer bị khoá gửi RFQ qua create_rfq', 'ACCOUNT_SUSPENDED',
    $q$SELECT public.create_rfq('RFQ khi bị khoá', NULL, 10, 'cái', NULL, NULL, NULL, 'single',
                                current_setting('test.category')::UUID,
                                ARRAY[current_setting('test.xa')::UUID])$q$);
SELECT pg_temp.expect_error('buyer bị khoá chốt báo giá qua accept_quote', 'ACCOUNT_SUSPENDED',
    $q$SELECT public.accept_quote(current_setting('test.quote')::UUID)$q$);
SELECT pg_temp.expect_error('buyer bị khoá ghi sự kiện', 'RLS',
    $q$INSERT INTO domain_events (aggregate_type, aggregate_id, event_type, actor_id)
       VALUES ('rfq', current_setting('test.rfq')::UUID, 'test', auth.uid())$q$);
SELECT pg_temp.expect_rows('buyer bị khoá vẫn xem được hồ sơ của mình', 1,
    $q$SELECT 1 FROM buyer_profiles WHERE user_id = auth.uid()$q$);

-- ── Xưởng B bị khoá ────────────────────────────────────────────────────
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.expect_error('xưởng bị khoá tạo sản phẩm', 'RLS',
    $q$INSERT INTO products (supplier_id, name) VALUES (current_setting('test.xb')::UUID, 'SP khi bị khoá')$q$);
SELECT pg_temp.expect_rows('xưởng bị khoá sửa giá → không đổi gì', 0,
    $q$UPDATE price_tiers SET unit_price = 1 WHERE product_id = current_setting('test.xb_product')::UUID$q$);
SELECT pg_temp.expect_error('xưởng bị khoá gửi báo giá', 'RLS',
    $q$INSERT INTO rfq_quotes (rfq_id, unit_price) VALUES (current_setting('test.rfq')::UUID, 80000)$q$);

-- ── Tài khoản active không bị ảnh hưởng ────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_rows('buyer đang hoạt động sửa hồ sơ', 1,
    $q$UPDATE buyer_profiles SET city = 'Hà Nội' WHERE user_id = auth.uid()$q$);
DO $$
BEGIN
    PERFORM public.create_rfq('RFQ test 1.7 (buyer A)', NULL, 20, 'cái', NULL, NULL, NULL, 'single',
                              current_setting('test.category')::UUID,
                              ARRAY[current_setting('test.xa')::UUID]);
    RAISE NOTICE 'PASS  buyer đang hoạt động gửi RFQ qua create_rfq';
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL  buyer đang hoạt động không gửi được RFQ: %', SQLERRM;
END $$;
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_rows('xưởng đang hoạt động sửa báo giá đang chờ', 1,
    $q$UPDATE rfq_quotes SET note = 'Giao trong 20 ngày' WHERE id = current_setting('test.quote')::UUID$q$);

-- ── Tài khoản pending (đang hoàn thiện hồ sơ sau OTP) vẫn ghi được ─────
RESET ROLE;
UPDATE users SET status = 'pending'
WHERE id = (SELECT id FROM auth.users WHERE email = 'buyer.b@langnghe.test');
SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT pg_temp.expect_rows('tài khoản pending lưu hồ sơ (bước Hoàn thiện hồ sơ)', 1,
    $q$UPDATE buyer_profiles SET company_name = 'Công ty mới' WHERE user_id = auth.uid()$q$);

DO $$ BEGIN RAISE NOTICE '1.7: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

-- SQL Editor không hiện NOTICE: dòng này chỉ hiện khi mọi ca ở trên đều đạt.
SELECT '1.7: TẤT CẢ ĐẠT (12 ca)' AS ket_qua;
