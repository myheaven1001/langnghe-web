-- Test kế hoạch 4.8: buyer_dashboard_stats() trả đúng số liệu của buyer đang
-- đăng nhập và chỉ của buyer đó.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "4.8: TẤT CẢ ĐẠT (6 ca)". Hỏng: "FAIL …".
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

CREATE FUNCTION pg_temp.check(p_label TEXT, p_ok BOOLEAN, p_detail TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'FAIL  % — %', p_label, p_detail;
    END IF;
    RAISE NOTICE 'PASS  %', p_label;
END $$;

-- Chênh lệch một số đếm giữa "sau" và "trước".
CREATE FUNCTION pg_temp.delta(p_path TEXT[]) RETURNS NUMERIC LANGUAGE sql AS $$
    SELECT (current_setting('test.after')::JSONB #>> p_path)::NUMERIC
         - (current_setting('test.before')::JSONB #>> p_path)::NUMERIC;
$$;

-- Buyer B đang hoạt động trong test này (để gọi được hàm).
UPDATE users SET status = 'active'
WHERE id = (SELECT id FROM auth.users WHERE email = 'buyer.b@langnghe.test');

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT set_config('test.before', public.buyer_dashboard_stats()::TEXT, TRUE);
SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT set_config('test.before_b', public.buyer_dashboard_stats()::TEXT, TRUE);

-- Dữ liệu thêm cho buyer A:
--   rfq1  đang mở, 2 báo giá đang chờ (xưởng A, xưởng B)
--   rfq2  đang mở, 1 báo giá đã rút  → không tính
--   rfq3  đang mở, chưa có báo giá
--   rfq4  đã chốt → đơn chờ thanh toán 5.000.000đ
--   rfq5  đã chốt → đơn đang giao
RESET ROLE;
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_xb    UUID;
    v_rfq   UUID;
    v_quote UUID;
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

    FOR i IN 1..5 LOOP
        INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
        VALUES (v_buyer, 'RFQ test 4.8 #' || i, 100, 'cái', 'single',
                CASE WHEN i <= 3 THEN 'published' ELSE 'awarded' END::rfq_status)
        RETURNING id INTO v_rfq;
        INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);

        IF i = 1 THEN
            INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, status)
            VALUES (v_rfq, v_xa, 50000, 'pending'), (v_rfq, v_xb, 52000, 'pending');
        ELSIF i = 2 THEN
            INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, status)
            VALUES (v_rfq, v_xa, 50000, 'withdrawn');
        ELSIF i >= 4 THEN
            INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, status)
            VALUES (v_rfq, v_xa, 50000, 'accepted')
            RETURNING id INTO v_quote;
            INSERT INTO orders (rfq_quote_id, buyer_id, supplier_id, quantity, unit_price, status)
            VALUES (v_quote, v_buyer, v_xa, 100, 50000,
                    CASE WHEN i = 4 THEN 'pending_payment' ELSE 'shipped' END::order_status);
        END IF;
    END LOOP;
END $$;

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT set_config('test.after', public.buyer_dashboard_stats()::TEXT, TRUE);

SELECT pg_temp.check('RFQ còn mở: tăng đúng số RFQ test chưa chốt',
    pg_temp.delta('{active_rfq_count}')
        = (SELECT count(*) FROM rfq_requests
           WHERE title LIKE 'RFQ test 4.8 #%' AND status IN ('published', 'quoted', 'negotiating')),
    current_setting('test.after'));
SELECT pg_temp.check('báo giá chờ xem +2 trên 1 RFQ (không tính báo giá đã rút)',
    pg_temp.delta('{quotes_to_review}') = 2 AND pg_temp.delta('{rfq_with_quotes}') = 1,
    current_setting('test.after'));
SELECT pg_temp.check('đơn: chờ thanh toán +1, đang giao +1, hoàn tất không đổi',
    pg_temp.delta('{orders,pending_payment}') = 1 AND pg_temp.delta('{orders,shipped}') = 1
    AND pg_temp.delta('{orders,completed}') = 0,
    current_setting('test.after')::JSONB ->> 'orders');
SELECT pg_temp.check('số tiền chờ thanh toán +5.000.000',
    pg_temp.delta('{unpaid_amount}') = 5000000,
    current_setting('test.after')::JSONB ->> 'unpaid_amount');

SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT pg_temp.check('số liệu của buyer B không đổi vì dữ liệu của buyer A',
    public.buyer_dashboard_stats() = current_setting('test.before_b')::JSONB,
    public.buyer_dashboard_stats()::TEXT);

SELECT pg_temp.login('xuong.a@langnghe.test');
DO $$
BEGIN
    BEGIN
        PERFORM public.buyer_dashboard_stats();
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'NOT_A_BUYER' THEN
            RAISE NOTICE 'PASS  xưởng gọi hàm → NOT_A_BUYER';
            RETURN;
        END IF;
        RAISE EXCEPTION 'FAIL  xưởng gọi hàm — cần NOT_A_BUYER, nhận %', SQLERRM;
    END;
    RAISE EXCEPTION 'FAIL  xưởng gọi hàm — không bị chặn';
END $$;

DO $$ BEGIN RAISE NOTICE '4.8: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '4.8: TẤT CẢ ĐẠT (6 ca)' AS ket_qua;
