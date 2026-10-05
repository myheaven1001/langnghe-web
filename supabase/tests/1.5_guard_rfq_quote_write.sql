-- Test kế hoạch 1.5: xưởng gửi được báo giá (supplier_id tự điền) nhưng không
-- tự đổi trạng thái, không sửa/xoá báo giá đã được quyết định.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào Supabase
-- Dashboard → SQL Editor rồi Run, hoặc:
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/1.5_guard_rfq_quote_write.sql
-- Đạt: kết quả cuối là "1.5: TẤT CẢ ĐẠT (13 ca)" (psql còn in NOTICE "PASS …").
-- Hỏng: dừng ở ca đầu tiên sai với thông báo "FAIL …".
-- Cả file chạy trong một transaction và ROLLBACK ở cuối: không đổi dữ liệu.

BEGIN;

-- ── Dữ liệu riêng cho test ──────────────────────────────────────────────
--   rfq1  published, gửi xưởng A — xưởng A báo giá, buyer A chấp nhận
--   rfq2  cancelled              — không nhận báo giá
--   rfq3  published, gửi xưởng A — báo giá để rút (xoá)
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_xb    UUID;
    v_rfq   UUID;
    i       INT;
BEGIN
    SELECT bp.id INTO v_buyer FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    SELECT sp.id INTO v_xb FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.b@langnghe.test';
    IF v_buyer IS NULL OR v_xa IS NULL OR v_xb IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a / xuong.a / xuong.b — chạy npm run seed:staging trước.';
    END IF;

    FOR i IN 1..3 LOOP
        INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
        VALUES (v_buyer, 'RFQ test 1.5 #' || i, 300, 'cái', 'single',
                CASE i WHEN 2 THEN 'cancelled' ELSE 'published' END::rfq_status)
        RETURNING id INTO v_rfq;
        INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);
        PERFORM set_config('test.rfq' || i, v_rfq::TEXT, TRUE);
    END LOOP;
    -- Từ 3.2 accept_quote bắt buộc có địa chỉ giao hàng.
    INSERT INTO buyer_addresses (buyer_id, recipient_name, phone, address_line, province)
    VALUES (v_buyer, 'Người nhận test', '0900000000', '1 Phố Test', 'Hà Nội');
    PERFORM set_config('test.xuong_a', v_xa::TEXT, TRUE),
            set_config('test.xuong_b', v_xb::TEXT, TRUE);
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

CREATE FUNCTION pg_temp.expect_error(p_label TEXT, p_code TEXT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = p_code THEN
            RAISE NOTICE 'PASS  %', p_label;
            RETURN;
        END IF;
        RAISE EXCEPTION 'FAIL  % — cần lỗi %, nhận %', p_label, p_code, SQLERRM;
    END;
    RAISE EXCEPTION 'FAIL  % — câu lệnh không bị chặn (cần %)', p_label, p_code;
END $$;

CREATE FUNCTION pg_temp.expect_ok(p_label TEXT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_rows INT;
BEGIN
    BEGIN
        EXECUTE p_sql;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'FAIL  % — bị chặn nhầm: %', p_label, SQLERRM;
    END;
    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'FAIL  % — tác động % dòng, cần 1', p_label, v_rows;
    END IF;
    RAISE NOTICE 'PASS  %', p_label;
END $$;

-- ── Xưởng A gửi báo giá ────────────────────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');

-- Đúng các cột form QuoteModal gửi — KHÔNG có supplier_id.
SELECT pg_temp.expect_ok('xưởng gửi báo giá như form (không có supplier_id)',
    $q$INSERT INTO rfq_quotes (rfq_id, unit_price, min_qty, lead_time_days, note)
       VALUES (current_setting('test.rfq1')::UUID, 95000, 300, 20, 'Men rạn ngà')$q$);
DO $$
DECLARE
    v_quote rfq_quotes%ROWTYPE;
BEGIN
    SELECT * INTO v_quote FROM rfq_quotes WHERE rfq_id = current_setting('test.rfq1')::UUID;
    IF v_quote.supplier_id IS DISTINCT FROM current_setting('test.xuong_a')::UUID THEN
        RAISE EXCEPTION 'FAIL  supplier_id tự điền sai: %', v_quote.supplier_id;
    END IF;
    PERFORM set_config('test.quote1', v_quote.id::TEXT, TRUE);
    RAISE NOTICE 'PASS  supplier_id được điền đúng xưởng A';
END $$;

SELECT pg_temp.expect_error('xưởng tạo báo giá "đã chấp nhận"', 'FORBIDDEN_QUOTE_CHANGE',
    $q$INSERT INTO rfq_quotes (rfq_id, unit_price, status)
       VALUES (current_setting('test.rfq3')::UUID, 1, 'accepted')$q$);
SELECT pg_temp.expect_error('xưởng A gửi báo giá dưới tên xưởng B', 'FORBIDDEN_QUOTE_CHANGE',
    $q$INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price)
       VALUES (current_setting('test.rfq3')::UUID, current_setting('test.xuong_b')::UUID, 1)$q$);
SELECT pg_temp.expect_error('xưởng báo giá RFQ đã huỷ', 'RFQ_NOT_OPEN',
    $q$INSERT INTO rfq_quotes (rfq_id, unit_price)
       VALUES (current_setting('test.rfq2')::UUID, 90000)$q$);

-- ── Xưởng A sửa báo giá đang chờ ───────────────────────────────────────
SELECT pg_temp.expect_ok('xưởng sửa giá/ghi chú khi báo giá còn chờ',
    $q$UPDATE rfq_quotes SET unit_price = 92000, note = 'Giảm giá'
       WHERE id = current_setting('test.quote1')::UUID$q$);
SELECT pg_temp.expect_error('xưởng tự đặt báo giá "đã chấp nhận"', 'FORBIDDEN_QUOTE_CHANGE',
    $q$UPDATE rfq_quotes SET status = 'accepted' WHERE id = current_setting('test.quote1')::UUID$q$);
SELECT pg_temp.expect_error('xưởng chuyển báo giá sang RFQ khác', 'FORBIDDEN_QUOTE_CHANGE',
    $q$UPDATE rfq_quotes SET rfq_id = current_setting('test.rfq3')::UUID
       WHERE id = current_setting('test.quote1')::UUID$q$);

-- ── Buyer A chấp nhận (accept_quote) → vẫn chạy ─────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
DO $$
BEGIN
    PERFORM public.accept_quote(current_setting('test.quote1')::UUID);
    IF (SELECT status FROM rfq_quotes WHERE id = current_setting('test.quote1')::UUID) <> 'accepted' THEN
        RAISE EXCEPTION 'FAIL  accept_quote không đặt được accepted';
    END IF;
    RAISE NOTICE 'PASS  buyer chấp nhận báo giá vẫn chạy';
END $$;

-- ── Báo giá đã chấp nhận → xưởng không sửa/xoá được ────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng sửa giá sau khi buyer chấp nhận', 'FORBIDDEN_QUOTE_CHANGE',
    $q$UPDATE rfq_quotes SET unit_price = 150000 WHERE id = current_setting('test.quote1')::UUID$q$);
SELECT pg_temp.expect_error('xưởng xoá báo giá đã chấp nhận', 'FORBIDDEN_QUOTE_CHANGE',
    $q$DELETE FROM rfq_quotes WHERE id = current_setting('test.quote1')::UUID$q$);

-- ── Rút báo giá đang chờ → được ────────────────────────────────────────
SELECT pg_temp.expect_ok('xưởng gửi báo giá thứ hai',
    $q$INSERT INTO rfq_quotes (rfq_id, unit_price) VALUES (current_setting('test.rfq3')::UUID, 88000)$q$);
SELECT pg_temp.expect_ok('xưởng rút (xoá) báo giá đang chờ',
    $q$DELETE FROM rfq_quotes WHERE rfq_id = current_setting('test.rfq3')::UUID$q$);

DO $$ BEGIN RAISE NOTICE '1.5: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

-- SQL Editor không hiện NOTICE: dòng này chỉ hiện khi mọi ca ở trên đều đạt.
SELECT '1.5: TẤT CẢ ĐẠT (13 ca)' AS ket_qua;
