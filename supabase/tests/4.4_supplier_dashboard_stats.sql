-- Test kế hoạch 4.4: supplier_dashboard_stats() trả đúng số liệu của xưởng
-- đang đăng nhập và chỉ của xưởng đó.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "4.4: TẤT CẢ ĐẠT (7 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.

BEGIN;

-- Dữ liệu riêng cho test (thêm vào dữ liệu sẵn có của xưởng A, nên các ca
-- dưới so "trước" với "sau"):
--   2 RFQ mở gửi xưởng A chưa báo giá (1 còn 5 giờ, 1 còn 5 ngày)
--   1 RFQ mở gửi xưởng A đã báo giá
--   1 đơn đã xác nhận thanh toán hôm nay (5.000.000đ), 1 đơn chờ thanh toán
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

-- Số liệu trước khi thêm dữ liệu test.
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT set_config('test.before', public.supplier_dashboard_stats()::TEXT, TRUE);
SELECT set_config('test.before_b', '', TRUE);
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT set_config('test.before_b', public.supplier_dashboard_stats()::TEXT, TRUE);

RESET ROLE;
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_rfq   UUID;
    v_quote UUID;
    i       INT;
BEGIN
    SELECT bp.id INTO v_buyer FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    IF v_buyer IS NULL OR v_xa IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a / xuong.a — chạy npm run seed:staging trước.';
    END IF;

    -- 2 RFQ chưa báo giá: #1 hết hạn sau 5 giờ, #2 sau 5 ngày.
    INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status, expires_at)
    VALUES (v_buyer, 'RFQ test 4.4 gấp', 10, 'cái', 'single', 'published',
            (NOW() AT TIME ZONE 'UTC') + INTERVAL '5 hours')
    RETURNING id INTO v_rfq;
    INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);
    INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status, deadline_days)
    VALUES (v_buyer, 'RFQ test 4.4 thường', 10, 'cái', 'single', 'published', 5)
    RETURNING id INTO v_rfq;
    INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);

    -- 1 RFQ đã báo giá (đang chờ) + 2 RFQ đã chốt thành đơn.
    FOR i IN 1..3 LOOP
        INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
        VALUES (v_buyer, 'RFQ test 4.4 #' || i, 100, 'cái', 'single',
                CASE WHEN i = 1 THEN 'published' ELSE 'awarded' END::rfq_status)
        RETURNING id INTO v_rfq;
        INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);
        INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, min_qty, lead_time_days, status)
        VALUES (v_rfq, v_xa, 50000, 100, 10,
                CASE WHEN i = 1 THEN 'pending' ELSE 'accepted' END::quote_status)
        RETURNING id INTO v_quote;
        IF i > 1 THEN
            INSERT INTO orders (rfq_quote_id, buyer_id, supplier_id, quantity, unit_price, status, confirmed_at)
            VALUES (v_quote, v_buyer, v_xa, 100, 50000,
                    CASE WHEN i = 2 THEN 'confirmed' ELSE 'pending_payment' END::order_status,
                    CASE WHEN i = 2 THEN NOW() AT TIME ZONE 'UTC' END);
        END IF;
    END LOOP;
END $$;

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT set_config('test.after', public.supplier_dashboard_stats()::TEXT, TRUE);

SELECT pg_temp.check('RFQ cần báo giá +2 (không tính RFQ đã báo giá), RFQ gấp +1',
    (current_setting('test.after')::JSONB ->> 'new_rfq_count')::INT
        = (current_setting('test.before')::JSONB ->> 'new_rfq_count')::INT + 2
    AND (current_setting('test.after')::JSONB ->> 'urgent_rfq_count')::INT
        = (current_setting('test.before')::JSONB ->> 'urgent_rfq_count')::INT + 1,
    current_setting('test.before') || ' → ' || current_setting('test.after'));
SELECT pg_temp.check('đơn theo trạng thái: confirmed +1, pending_payment +1, còn lại không đổi',
    (current_setting('test.after')::JSONB #>> '{orders,confirmed}')::INT
        = (current_setting('test.before')::JSONB #>> '{orders,confirmed}')::INT + 1
    AND (current_setting('test.after')::JSONB #>> '{orders,pending_payment}')::INT
        = (current_setting('test.before')::JSONB #>> '{orders,pending_payment}')::INT + 1
    AND (current_setting('test.after')::JSONB #>> '{orders,shipped}')
        = (current_setting('test.before')::JSONB #>> '{orders,shipped}'),
    current_setting('test.after')::JSONB ->> 'orders');
SELECT pg_temp.check('doanh thu tháng +5.000.000 (chỉ đơn đã xác nhận thanh toán)',
    (current_setting('test.after')::JSONB ->> 'revenue_month')::NUMERIC
        = (current_setting('test.before')::JSONB ->> 'revenue_month')::NUMERIC + 5000000,
    current_setting('test.after')::JSONB ->> 'revenue_month');
SELECT pg_temp.check('được mời +5, đã báo giá +3, được chấp nhận +2',
    (current_setting('test.after')::JSONB ->> 'targeted_count')::INT
        = (current_setting('test.before')::JSONB ->> 'targeted_count')::INT + 5
    AND (current_setting('test.after')::JSONB ->> 'quotes_count')::INT
        = (current_setting('test.before')::JSONB ->> 'quotes_count')::INT + 3
    AND (current_setting('test.after')::JSONB ->> 'accepted_count')::INT
        = (current_setting('test.before')::JSONB ->> 'accepted_count')::INT + 2,
    current_setting('test.after'));

SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.check('số liệu của xưởng B không đổi vì dữ liệu của xưởng A',
    public.supplier_dashboard_stats() = current_setting('test.before_b')::JSONB,
    public.supplier_dashboard_stats()::TEXT);

SELECT pg_temp.login('buyer.a@langnghe.test');
DO $$
BEGIN
    BEGIN
        PERFORM public.supplier_dashboard_stats();
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'NOT_A_SUPPLIER' THEN
            RAISE NOTICE 'PASS  buyer gọi hàm → NOT_A_SUPPLIER';
            RETURN;
        END IF;
        RAISE EXCEPTION 'FAIL  buyer gọi hàm — cần NOT_A_SUPPLIER, nhận %', SQLERRM;
    END;
    RAISE EXCEPTION 'FAIL  buyer gọi hàm — không bị chặn';
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', TRUE);
SET LOCAL ROLE anon;
DO $$
BEGIN
    BEGIN
        PERFORM public.supplier_dashboard_stats();
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'PASS  khách chưa đăng nhập không gọi được hàm';
        RETURN;
    END;
    RAISE EXCEPTION 'FAIL  khách gọi được supplier_dashboard_stats()';
END $$;

DO $$ BEGIN RAISE NOTICE '4.4: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '4.4: TẤT CẢ ĐẠT (7 ca)' AS ket_qua;
