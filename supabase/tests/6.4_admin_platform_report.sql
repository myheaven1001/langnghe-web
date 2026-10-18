-- Test bước 6 (Vận hành): admin_platform_report(), admin_rfq_monitor().
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "6.4: TẤT CẢ ĐẠT (11 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.
-- So sánh "trước / sau khi thêm dữ liệu test" nên không phụ thuộc dữ liệu sẵn có.

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

CREATE FUNCTION pg_temp.as_anon() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);
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

DO $$
BEGIN
    UPDATE users SET status = 'active'
    WHERE id IN (SELECT u.id FROM auth.users u
                 WHERE u.email IN ('admin@langnghe.test', 'buyer.a@langnghe.test', 'xuong.a@langnghe.test'));
END $$;

-- ── Quyền ──────────────────────────────────────────────────────────────
SELECT pg_temp.as_anon();
SELECT pg_temp.expect_error('khách gọi báo cáo toàn sàn', 'DENIED',
    $q$SELECT public.admin_platform_report()$q$);
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng gọi báo cáo toàn sàn', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_platform_report()$q$);
SELECT pg_temp.expect_error('xưởng gọi giám sát RFQ', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT count(*) FROM public.admin_rfq_monitor()$q$);

-- ── Số liệu trước khi thêm dữ liệu test ────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
SELECT set_config('test.before', public.admin_platform_report(30)::TEXT, TRUE);
SELECT pg_temp.check('báo cáo có đủ các khối, chuỗi ngày đủ 30 điểm',
    (SELECT b ? 'orders' AND b ? 'paid' AND b ? 'users' AND b ? 'rfq' AND b ? 'trust'
            AND b ? 'top_suppliers' AND jsonb_array_length(b -> 'daily') = 30
            AND (b ->> 'days')::INT = 30
     FROM (SELECT current_setting('test.before')::JSONB AS b) x),
    left(current_setting('test.before'), 300));
SELECT pg_temp.check('số ngày ngoài khoảng bị kẹp về 7–365',
    (public.admin_platform_report(1) ->> 'days')::INT = 7
    AND (public.admin_platform_report(9999) ->> 'days')::INT = 365,
    'không kẹp số ngày');

-- ── Thêm: 2 RFQ (1 có báo giá, 1 mở 3 ngày chưa ai báo), 2 đơn (1 đã thu 5tr, 1 huỷ) ──
SELECT pg_temp.as_system();
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_rfq1  UUID;
    v_rfq2  UUID;
    v_quote UUID;
BEGIN
    SELECT bp.id INTO v_buyer FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';

    INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
    VALUES (v_buyer, 'RFQ test 6.4 có báo giá', 100, 'cái', 'single', 'awarded')
    RETURNING id INTO v_rfq1;
    INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq1, v_xa);
    INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, min_qty, lead_time_days, status)
    VALUES (v_rfq1, v_xa, 50000, 100, 10, 'accepted')
    RETURNING id INTO v_quote;

    INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status, created_at)
    VALUES (v_buyer, 'RFQ test 6.4 không ai báo giá', 100, 'cái', 'single', 'published',
            (NOW() AT TIME ZONE 'UTC') - INTERVAL '3 days')
    RETURNING id INTO v_rfq2;
    INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq2, v_xa);

    INSERT INTO orders (rfq_quote_id, buyer_id, supplier_id, status,
                        confirmed_at, paid_amount, paid_at)
    VALUES (v_quote, v_buyer, v_xa, 'confirmed', NOW() AT TIME ZONE 'UTC', 5000000, NOW());
    INSERT INTO orders (source, buyer_id, supplier_id, status, cancel_reason)
    VALUES ('direct', v_buyer, v_xa, 'cancelled', 'test 6.4');

    PERFORM set_config('test.rfq2', v_rfq2::TEXT, TRUE), set_config('test.xa', v_xa::TEXT, TRUE);
END $$;

SELECT pg_temp.login('admin@langnghe.test');
SELECT set_config('test.after', public.admin_platform_report(30)::TEXT, TRUE);

CREATE FUNCTION pg_temp.delta(p_path TEXT[]) RETURNS NUMERIC LANGUAGE sql AS $$
    SELECT (current_setting('test.after')::JSONB #>> p_path)::NUMERIC
         - (current_setting('test.before')::JSONB #>> p_path)::NUMERIC;
$$;

SELECT pg_temp.check('đơn hàng: +2 đơn (1 từ RFQ, 1 đặt thẳng), +1 huỷ; giá trị chỉ tính đơn không huỷ (+5.000.000)',
    pg_temp.delta('{orders,created}') = 2 AND pg_temp.delta('{orders,from_rfq}') = 1
    AND pg_temp.delta('{orders,direct}') = 1 AND pg_temp.delta('{orders,cancelled}') = 1
    AND pg_temp.delta('{orders,value}') = 5000000,
    (current_setting('test.after')::JSONB -> 'orders')::TEXT);
SELECT pg_temp.check('tiền đã xác nhận thu: +1 đơn, +5.000.000',
    pg_temp.delta('{paid,orders}') = 1 AND pg_temp.delta('{paid,amount}') = 5000000,
    (current_setting('test.after')::JSONB -> 'paid')::TEXT);
SELECT pg_temp.check('phễu RFQ: +2 tạo, +1 có báo giá, +1 chốt',
    pg_temp.delta('{rfq,created}') = 2 AND pg_temp.delta('{rfq,with_quotes}') = 1
    AND pg_temp.delta('{rfq,awarded}') = 1,
    (current_setting('test.after')::JSONB -> 'rfq')::TEXT);
SELECT pg_temp.check('chuỗi theo ngày: hôm nay tăng 2 đơn và 5.000.000 đã thu',
    (SELECT (a ->> 'orders')::INT - (b ->> 'orders')::INT = 2
            AND (a ->> 'paid')::NUMERIC - (b ->> 'paid')::NUMERIC = 5000000
     FROM (SELECT current_setting('test.after')::JSONB -> 'daily' -> 29 AS a,
                  current_setting('test.before')::JSONB -> 'daily' -> 29 AS b) x),
    (current_setting('test.after')::JSONB -> 'daily' -> 29)::TEXT);
SELECT pg_temp.check('xưởng A có mặt trong 5 xưởng doanh thu cao nhất hoặc danh sách đã đủ 5 xưởng lớn hơn',
    (SELECT bool_or(t ->> 'id' = current_setting('test.xa'))
            OR jsonb_array_length(current_setting('test.after')::JSONB -> 'top_suppliers') = 5
     FROM jsonb_array_elements(current_setting('test.after')::JSONB -> 'top_suppliers') t),
    (current_setting('test.after')::JSONB -> 'top_suppliers')::TEXT);

-- ── Giám sát RFQ ───────────────────────────────────────────────────────
SELECT pg_temp.check('RFQ mở 3 ngày chưa có báo giá: 1 xưởng được mời, 0 báo giá, ≥ 72 giờ, bị đánh dấu',
    (SELECT count(*) = 1 AND bool_and(targets = 1 AND quotes = 0 AND hours_open >= 72 AND stale
                                      AND status = 'published')
     FROM public.admin_rfq_monitor(300) WHERE id = current_setting('test.rfq2')::UUID),
    (SELECT COALESCE(string_agg(hours_open::TEXT || 'h/' || quotes || ' báo giá/stale=' || stale, ', '), 'không thấy RFQ')
     FROM public.admin_rfq_monitor(300) WHERE id = current_setting('test.rfq2')::UUID));

DO $$ BEGIN RAISE NOTICE '6.4: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '6.4: TẤT CẢ ĐẠT (11 ca)' AS ket_qua;
