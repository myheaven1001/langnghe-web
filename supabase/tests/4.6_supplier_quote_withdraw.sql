-- Test kế hoạch 4.6: xưởng sửa / rút báo giá (withdrawn), báo giá lại sau
-- khi rút; buyer không thấy báo giá đã rút; số liệu dashboard bỏ qua nó.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "4.6: TẤT CẢ ĐẠT (14 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.
-- Chạy lại thêm 1.5 và 4.4 (cùng đụng trigger báo giá / số liệu dashboard).

BEGIN;

-- Dữ liệu riêng cho test: 1 RFQ đang mở của buyer A gửi xưởng A và xưởng B.
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_xb    UUID;
    v_rfq   UUID;
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

    UPDATE users SET status = 'active'
    WHERE id IN (SELECT user_id FROM supplier_profiles WHERE id = v_xb);

    INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
    VALUES (v_buyer, 'RFQ test 4.6', 100, 'cái', 'single', 'published')
    RETURNING id INTO v_rfq;
    INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa), (v_rfq, v_xb);

    PERFORM set_config('test.rfq', v_rfq::TEXT, TRUE);
END $$;

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

-- Câu lệnh phải lỗi p_code ('UNIQUE' = trùng khoá duy nhất 23505).
CREATE FUNCTION pg_temp.expect_error(p_label TEXT, p_code TEXT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION
        WHEN unique_violation THEN
            IF p_code = 'UNIQUE' THEN
                RAISE NOTICE 'PASS  % (trùng báo giá đang hiệu lực)', p_label;
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

-- ── Xưởng A: gửi, sửa, rút ─────────────────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT set_config('test.new_before',
                  public.supplier_dashboard_stats() ->> 'new_rfq_count', TRUE);

INSERT INTO rfq_quotes (rfq_id, unit_price, min_qty, lead_time_days)
VALUES (current_setting('test.rfq')::UUID, 50000, 100, 10);
SELECT set_config('test.q1', (SELECT id::TEXT FROM rfq_quotes
                              WHERE rfq_id = current_setting('test.rfq')::UUID
                                AND supplier_id IN (SELECT id FROM supplier_profiles
                                                    WHERE user_id = auth.uid())), TRUE);
SELECT pg_temp.check('gửi báo giá → RFQ không còn trong "cần báo giá"',
    (public.supplier_dashboard_stats() ->> 'new_rfq_count')::INT
        = current_setting('test.new_before')::INT - 1,
    public.supplier_dashboard_stats() ->> 'new_rfq_count');
SELECT pg_temp.expect_error('gửi báo giá thứ hai khi báo giá đầu còn hiệu lực', 'UNIQUE',
    $q$INSERT INTO rfq_quotes (rfq_id, unit_price) VALUES (current_setting('test.rfq')::UUID, 49000)$q$);

UPDATE rfq_quotes SET unit_price = 48000, note = 'Giảm giá cho đơn đầu'
WHERE id = current_setting('test.q1')::UUID;
SELECT pg_temp.check('sửa giá và ghi chú khi còn chờ',
    (SELECT unit_price = 48000 AND status = 'pending' FROM rfq_quotes
     WHERE id = current_setting('test.q1')::UUID),
    'không sửa được');
SELECT pg_temp.expect_error('xưởng tự đặt "đã chấp nhận"', 'FORBIDDEN_QUOTE_CHANGE',
    $q$UPDATE rfq_quotes SET status = 'accepted' WHERE id = current_setting('test.q1')::UUID$q$);

UPDATE rfq_quotes SET status = 'withdrawn' WHERE id = current_setting('test.q1')::UUID;
SELECT pg_temp.check('rút báo giá → withdrawn, dòng vẫn còn, RFQ quay lại "cần báo giá"',
    (SELECT status = 'withdrawn' FROM rfq_quotes WHERE id = current_setting('test.q1')::UUID)
    AND (public.supplier_dashboard_stats() ->> 'new_rfq_count')::INT
        = current_setting('test.new_before')::INT,
    'trạng thái hoặc số liệu sai');
SELECT pg_temp.expect_error('sửa báo giá đã rút', 'FORBIDDEN_QUOTE_CHANGE',
    $q$UPDATE rfq_quotes SET unit_price = 1 WHERE id = current_setting('test.q1')::UUID$q$);
SELECT pg_temp.expect_error('"bỏ rút" báo giá', 'FORBIDDEN_QUOTE_CHANGE',
    $q$UPDATE rfq_quotes SET status = 'pending' WHERE id = current_setting('test.q1')::UUID$q$);

-- ── Buyer A: không thấy và không chốt được báo giá đã rút ──────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('buyer không thấy báo giá đã rút',
    (SELECT count(*) = 0 FROM rfq_quotes WHERE rfq_id = current_setting('test.rfq')::UUID),
    'buyer vẫn thấy báo giá đã rút');
INSERT INTO buyer_addresses (buyer_id, recipient_name, phone, address_line, province)
SELECT id, 'Người nhận test', '0900000000', '1 Phố Test', 'Hà Nội'
FROM buyer_profiles WHERE user_id = auth.uid();
SELECT pg_temp.expect_error('buyer chốt báo giá đã rút', 'QUOTE_NOT_ACCEPTABLE',
    $q$SELECT public.accept_quote(current_setting('test.q1')::UUID)$q$);

-- ── Xưởng A báo giá lại; xưởng B không đụng được báo giá của xưởng A ───
SELECT pg_temp.login('xuong.a@langnghe.test');
INSERT INTO rfq_quotes (rfq_id, unit_price, min_qty, lead_time_days)
VALUES (current_setting('test.rfq')::UUID, 47000, 100, 12);
SELECT pg_temp.check('báo giá lại sau khi rút: 1 đang chờ + 1 đã rút',
    (SELECT count(*) FILTER (WHERE status = 'pending') = 1
            AND count(*) FILTER (WHERE status = 'withdrawn') = 1
     FROM rfq_quotes
     WHERE rfq_id = current_setting('test.rfq')::UUID
       AND supplier_id IN (SELECT id FROM supplier_profiles WHERE user_id = auth.uid())),
    'số báo giá sai');
SELECT set_config('test.q2', (SELECT id::TEXT FROM rfq_quotes
                              WHERE rfq_id = current_setting('test.rfq')::UUID
                                AND status = 'pending'
                                AND supplier_id IN (SELECT id FROM supplier_profiles
                                                    WHERE user_id = auth.uid())), TRUE);

SELECT pg_temp.login('xuong.b@langnghe.test');
DO $$
DECLARE
    v_rows INT;
BEGIN
    UPDATE rfq_quotes SET status = 'withdrawn' WHERE id = current_setting('test.q2')::UUID;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN
        RAISE EXCEPTION 'FAIL  xưởng B rút báo giá của xưởng A — đổi được % dòng', v_rows;
    END IF;
    RAISE NOTICE 'PASS  xưởng B rút báo giá của xưởng A → không đổi gì';
END $$;

-- ── Buyer A: thấy và chốt được báo giá mới ─────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('buyer thấy đúng 1 báo giá (bản mới 47.000đ)',
    (SELECT count(*) = 1 AND bool_and(unit_price = 47000) FROM rfq_quotes
     WHERE rfq_id = current_setting('test.rfq')::UUID),
    (SELECT count(*)::TEXT FROM rfq_quotes WHERE rfq_id = current_setting('test.rfq')::UUID));
SELECT public.accept_quote(current_setting('test.q2')::UUID);
SELECT pg_temp.check('chốt báo giá mới → có đơn với giá 47.000đ',
    (SELECT unit_price = 47000 FROM orders WHERE rfq_quote_id = current_setting('test.q2')::UUID),
    'không có đơn');

-- ── Xưởng A: báo giá đã được chấp nhận thì không rút được ──────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('rút báo giá đã được chấp nhận', 'FORBIDDEN_QUOTE_CHANGE',
    $q$UPDATE rfq_quotes SET status = 'withdrawn' WHERE id = current_setting('test.q2')::UUID$q$);

DO $$ BEGIN RAISE NOTICE '4.6: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '4.6: TẤT CẢ ĐẠT (14 ca)' AS ket_qua;
