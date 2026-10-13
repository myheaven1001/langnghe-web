-- Test bước 6 (Tài chính): supplier_payouts, supplier_payout_accounts,
-- commission_percent, admin_mark_payout_paid(), admin_finance_summary(),
-- supplier_finance_summary().
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "6.6: TẤT CẢ ĐẠT (22 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.
-- Chạy lại thêm 3.1 (admin_set_setting) và 5.8 (refunds).

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

CREATE FUNCTION pg_temp.as_system() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);
END $$;

CREATE FUNCTION pg_temp.check(p_label TEXT, p_ok BOOLEAN, p_detail TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'FAIL  % — %', p_label, p_detail;
    END IF;
    RAISE NOTICE 'PASS  %', p_label;
END $$;

CREATE FUNCTION pg_temp.expect_error(p_label TEXT, p_code TEXT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION
        WHEN insufficient_privilege THEN
            IF p_code = 'DENIED' THEN
                RAISE NOTICE 'PASS  % (bị từ chối quyền)', p_label;
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

-- Dữ liệu riêng cho test: 3 đơn 100 × 50.000 = 5.000.000 của buyer A với xưởng A
--   order1 đã giao, sàn đã thu 5.000.000
--   order2 đã giao, sàn đã thu 5.000.000, đã ghi hoàn 1.000.000 cho buyer
--   order3 đang sản xuất, sàn đã thu 5.000.000
-- Phí sàn đặt 5%; xoá sẵn tài khoản nhận tiền của xưởng A (ROLLBACK trả lại).
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_rfq   UUID;
    v_quote UUID;
    v_order UUID;
    i       INT;
BEGIN
    SELECT bp.id INTO v_buyer FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    IF v_buyer IS NULL OR v_xa IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a / xuong.a — chạy npm run seed:staging trước.';
    END IF;
    UPDATE users SET status = 'active'
    WHERE id IN (SELECT user_id FROM supplier_profiles WHERE id = v_xa)
       OR id IN (SELECT u.id FROM auth.users u
                 WHERE u.email IN ('buyer.a@langnghe.test', 'xuong.b@langnghe.test', 'admin@langnghe.test'));
    UPDATE platform_settings SET value = '5' WHERE key = 'commission_percent';
    DELETE FROM supplier_payout_accounts WHERE supplier_id = v_xa;

    FOR i IN 1..3 LOOP
        INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
        VALUES (v_buyer, 'RFQ test 6.6 #' || i, 100, 'cái', 'single', 'awarded')
        RETURNING id INTO v_rfq;
        INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);
        INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, min_qty, lead_time_days, status)
        VALUES (v_rfq, v_xa, 50000, 100, 10, 'accepted')
        RETURNING id INTO v_quote;
        INSERT INTO orders (rfq_quote_id, buyer_id, supplier_id, quantity, unit_price, status,
                            confirmed_at, paid_amount, paid_at)
        VALUES (v_quote, v_buyer, v_xa, 100, 50000,
                (CASE WHEN i = 3 THEN 'producing' ELSE 'delivered' END)::order_status,
                NOW() AT TIME ZONE 'UTC', 5000000, NOW())
        RETURNING id INTO v_order;
        PERFORM set_config('test.order' || i, v_order::TEXT, TRUE);
    END LOOP;
    INSERT INTO refunds (order_id, amount, note)
    VALUES (current_setting('test.order2')::UUID, 1000000, 'test 6.6');

    PERFORM set_config('test.xa', v_xa::TEXT, TRUE);
END $$;

-- ── Số liệu trước ──────────────────────────────────────────────────────
-- Mốc "trước" lấy SAU khi đã có 3 đơn test: sàn đã thu 15.000.000, cả 3 đơn
-- đang được giữ tiền, 1.000.000 chờ hoàn. Các phép so bên dưới là chênh lệch
-- so với mốc này.
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng gọi đối soát của admin', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_finance_summary()$q$);
SELECT set_config('test.s_before', public.supplier_finance_summary()::TEXT, TRUE);
SELECT pg_temp.login('admin@langnghe.test');
SELECT set_config('test.a_before', public.admin_finance_summary()::TEXT, TRUE);

-- ── Tài khoản nhận tiền ────────────────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('buyer khai tài khoản nhận tiền của xưởng', 'NOT_A_SUPPLIER',
    $q$SELECT public.set_payout_account('Vietcombank', '0123456789', 'NGUYEN VAN A')$q$);
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('số tài khoản có chữ', 'INVALID_ACCOUNT',
    $q$SELECT public.set_payout_account('Vietcombank', '0123-ABC', 'NGUYEN VAN A')$q$);
SELECT pg_temp.expect_error('client tự ghi bảng tài khoản', 'DENIED',
    $q$INSERT INTO supplier_payout_accounts (supplier_id, bank_name, account_number, account_holder)
       VALUES (current_setting('test.xa')::UUID, 'X Bank', '0123456789', 'A')$q$);
SELECT public.set_payout_account(' Vietcombank ', '0123 456 789', ' NGUYEN VAN A ', 'CN Hà Nội');
SELECT public.set_payout_account('Techcombank', '9876543210', 'NGUYEN VAN A');
SELECT pg_temp.check('khai rồi sửa tài khoản: còn 1 dòng, số đã bỏ khoảng trắng, bỏ chi nhánh',
    (SELECT count(*) = 1 AND bool_and(bank_name = 'Techcombank' AND account_number = '9876543210'
                                      AND account_holder = 'NGUYEN VAN A' AND branch IS NULL)
     FROM supplier_payout_accounts WHERE supplier_id = current_setting('test.xa')::UUID),
    'tài khoản sai');
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.check('xưởng khác không đọc được tài khoản và khoản phải trả của xưởng A',
    (SELECT count(*) = 0 FROM supplier_payout_accounts WHERE supplier_id = current_setting('test.xa')::UUID)
    AND (SELECT count(*) = 0 FROM supplier_payouts WHERE supplier_id = current_setting('test.xa')::UUID),
    'lộ dữ liệu tài chính');

-- ── Đơn hoàn tất → sinh khoản phải trả ─────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
UPDATE orders SET status = 'completed'
WHERE id IN (current_setting('test.order1')::UUID, current_setting('test.order2')::UUID);

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('đơn 1: thu 5.000.000, phí 5% = 250.000, trả xưởng 4.750.000',
    (SELECT count(*) = 1 AND bool_and(gross_amount = 5000000 AND refund_amount = 0 AND fee_percent = 5
                                      AND fee_amount = 250000 AND net_amount = 4750000 AND status = 'pending')
     FROM supplier_payouts WHERE order_id = current_setting('test.order1')::UUID),
    (SELECT COALESCE(max(net_amount)::TEXT, 'không có khoản phải trả') FROM supplier_payouts
     WHERE order_id = current_setting('test.order1')::UUID));
SELECT pg_temp.check('đơn 2 (đã hoàn 1.000.000): phí tính trên 4.000.000 = 200.000, trả xưởng 3.800.000',
    (SELECT refund_amount = 1000000 AND fee_amount = 200000 AND net_amount = 3800000
     FROM supplier_payouts WHERE order_id = current_setting('test.order2')::UUID),
    (SELECT COALESCE(max(net_amount)::TEXT, 'không có khoản phải trả') FROM supplier_payouts
     WHERE order_id = current_setting('test.order2')::UUID));
SELECT pg_temp.check('đơn chưa hoàn tất không có khoản phải trả',
    (SELECT count(*) = 0 FROM supplier_payouts WHERE order_id = current_setting('test.order3')::UUID),
    'đơn đang sản xuất đã có khoản phải trả');
SELECT pg_temp.expect_error('xưởng tự sửa khoản phải trả', 'DENIED',
    $q$UPDATE supplier_payouts SET net_amount = gross_amount, fee_amount = 0
       WHERE order_id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_error('xưởng tự đánh dấu đã nhận tiền', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_mark_payout_paid(
           (SELECT id FROM supplier_payouts WHERE order_id = current_setting('test.order1')::UUID), 'FT1')$q$);

CREATE FUNCTION pg_temp.sdelta(p_key TEXT) RETURNS NUMERIC LANGUAGE sql AS $$
    SELECT (public.supplier_finance_summary() ->> p_key)::NUMERIC
         - (current_setting('test.s_before')::JSONB ->> p_key)::NUMERIC;
$$;
SELECT pg_temp.check('số liệu của xưởng: chờ sàn trả +8.550.000, phí +450.000, đang giữ −10.000.000 (2 đơn vừa hoàn tất)',
    pg_temp.sdelta('payout_pending') = 8550000 AND pg_temp.sdelta('fees') = 450000
    AND pg_temp.sdelta('held_in_progress') = -10000000
    AND (public.supplier_finance_summary() ->> 'commission_percent')::NUMERIC = 5,
    public.supplier_finance_summary()::TEXT);

-- ── Hoàn tiền ghi sau khi đơn đã hoàn tất → khoản chưa chuyển được tính lại ──
SELECT pg_temp.as_system();
INSERT INTO refunds (order_id, amount, note)
VALUES (current_setting('test.order1')::UUID, 500000, 'test 6.6 hoàn muộn');
SELECT pg_temp.check('hoàn muộn 500.000 cho đơn 1 → phí 225.000, trả xưởng 4.275.000',
    (SELECT refund_amount = 500000 AND fee_amount = 225000 AND net_amount = 4275000
     FROM supplier_payouts WHERE order_id = current_setting('test.order1')::UUID),
    (SELECT net_amount::TEXT FROM supplier_payouts WHERE order_id = current_setting('test.order1')::UUID));

-- ── Admin chuyển tiền ──────────────────────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
SELECT set_config('test.payout1', (SELECT id::TEXT FROM supplier_payouts
    WHERE order_id = current_setting('test.order1')::UUID), TRUE);
SELECT pg_temp.expect_error('đánh dấu đã chuyển mà không có mã giao dịch', 'REASON_REQUIRED',
    $q$SELECT public.admin_mark_payout_paid(current_setting('test.payout1')::UUID, '  ')$q$);
SELECT public.admin_mark_payout_paid(current_setting('test.payout1')::UUID, 'FT26101300001', 'Chuyển đợt 1');
SELECT pg_temp.check('đánh dấu đã chuyển → paid, có mã giao dịch và nhật ký',
    (SELECT status = 'paid' AND bank_ref = 'FT26101300001' AND paid_by = auth.uid() AND paid_at IS NOT NULL
     FROM supplier_payouts WHERE id = current_setting('test.payout1')::UUID)
    AND (SELECT count(*) = 1 FROM admin_audit_log
         WHERE action = 'payout.paid' AND entity_id = current_setting('test.order1')),
    'khoản trả sai');
SELECT pg_temp.expect_error('đánh dấu lại khoản đã chuyển', 'PAYOUT_ALREADY_PAID',
    $q$SELECT public.admin_mark_payout_paid(current_setting('test.payout1')::UUID, 'FT2')$q$);

CREATE FUNCTION pg_temp.adelta(p_key TEXT) RETURNS NUMERIC LANGUAGE sql AS $$
    SELECT (public.admin_finance_summary() ->> p_key)::NUMERIC
         - (current_setting('test.a_before')::JSONB ->> p_key)::NUMERIC;
$$;
SELECT pg_temp.check('đối soát: tiền thu không đổi, đã trả xưởng +4.275.000, chờ trả +3.800.000, chờ hoàn +500.000, đang giữ −10.000.000, số dư phải có −4.275.000',
    pg_temp.adelta('collected') = 0 AND pg_temp.adelta('paid_out') = 4275000
    AND pg_temp.adelta('payout_pending') = 3800000 AND pg_temp.adelta('refund_pending') = 500000
    AND pg_temp.adelta('held_in_progress') = -10000000 AND pg_temp.adelta('fees') = 425000
    AND pg_temp.adelta('expected_balance') = -4275000,
    public.admin_finance_summary()::TEXT);

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('xưởng nhận thông báo sàn đã chuyển tiền',
    (SELECT count(*) = 1 AND bool_and(body LIKE '%4.275.000đ%FT26101300001%') FROM notifications
     WHERE user_id = auth.uid() AND type = 'payout_paid'
       AND payload ->> 'payout_id' = current_setting('test.payout1')),
    'thiếu thông báo payout_paid');

-- Hoàn muộn cho khoản ĐÃ chuyển: không tính lại.
SELECT pg_temp.as_system();
INSERT INTO refunds (order_id, amount, note)
VALUES (current_setting('test.order1')::UUID, 100000, 'test 6.6 hoàn sau khi đã trả xưởng');
SELECT pg_temp.check('khoản đã chuyển giữ nguyên 4.275.000 dù có hoàn tiền mới',
    (SELECT net_amount = 4275000 AND refund_amount = 500000 FROM supplier_payouts
     WHERE id = current_setting('test.payout1')::UUID),
    (SELECT net_amount::TEXT FROM supplier_payouts WHERE id = current_setting('test.payout1')::UUID));

-- ── Phí sàn ────────────────────────────────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.expect_error('phí sàn 31%', 'INVALID_SETTING',
    $q$SELECT public.admin_set_setting('commission_percent', '31'::JSONB)$q$);
SELECT pg_temp.expect_error('phí sàn không phải số', 'INVALID_SETTING',
    $q$SELECT public.admin_set_setting('commission_percent', '"năm"'::JSONB)$q$);
SELECT public.admin_set_setting('commission_percent', '2.5'::JSONB);
SELECT pg_temp.check('đổi phí sàn còn 2,5% → khoản cũ giữ phí 5%',
    (SELECT value = '2.5'::JSONB FROM platform_settings WHERE key = 'commission_percent')
    AND (SELECT fee_percent = 5 FROM supplier_payouts WHERE order_id = current_setting('test.order2')::UUID),
    'phí sàn sai');

DO $$ BEGIN RAISE NOTICE '6.6: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '6.6: TẤT CẢ ĐẠT (22 ca)' AS ket_qua;
