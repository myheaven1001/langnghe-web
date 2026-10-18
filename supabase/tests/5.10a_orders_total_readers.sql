-- Test chuẩn bị 5.10 (migration 20261005095000): các hàm số liệu đọc
-- orders.total thay cho orders.total_amount.
--
-- CHỈ chạy trên STAGING (project alxaicpqwjszejmxplvh), KHÔNG chạy trên
-- production. Sau `npm run seed:staging`, dán cả file vào SQL Editor rồi Run.
-- Đạt: kết quả cuối là "5.10a: TẤT CẢ ĐẠT (3 ca)". Hỏng: "FAIL …".
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

-- ── 1. Không hàm nào còn đọc total_amount ──────────────────────────────
SELECT pg_temp.check('5 hàm số liệu không còn đọc orders.total_amount',
    (SELECT count(*) = 5 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('get_supplier_analytics', 'admin_confirm_payment', 'supplier_dashboard_stats',
                         'buyer_dashboard_stats', 'admin_queue_counts')
       -- Chỉ còn được phép là khoá JSON 'total_amount' trong nhật ký.
       AND regexp_replace(p.prosrc, '''total_amount''', '', 'g') !~ 'total_amount'),
    (SELECT string_agg(p.proname, ', ') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('get_supplier_analytics', 'admin_confirm_payment', 'supplier_dashboard_stats',
                         'buyer_dashboard_stats', 'admin_queue_counts')
       AND regexp_replace(p.prosrc, '''total_amount''', '', 'g') ~ 'total_amount'));

-- ── 2. Số liệu lấy từ total (tổng dòng hàng), không từ quantity × unit_price ──
-- Một đơn chờ thanh toán có total = 300.000 (2 dòng hàng) nhưng cột cũ
-- total_amount = 1 × 1 = 1: số "chưa thanh toán" của buyer phải tăng 300.000.
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT set_config('test.unpaid_before', public.buyer_dashboard_stats() ->> 'unpaid_amount', TRUE);

RESET ROLE;
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_order UUID;
BEGIN
    SELECT bp.id INTO v_buyer FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    UPDATE users SET status = 'active'
    WHERE id IN (SELECT user_id FROM buyer_profiles WHERE id = v_buyer);

    INSERT INTO orders (source, buyer_id, supplier_id, quantity, unit_price, status)
    VALUES ('direct', v_buyer, v_xa, 1, 1, 'pending_payment')
    RETURNING id INTO v_order;
    INSERT INTO order_items (order_id, product_name, unit, quantity, unit_price, sort_order)
    VALUES (v_order, 'Dòng 1 test 5.10a', 'cái', 10, 20000, 0),
           (v_order, 'Dòng 2 test 5.10a', 'cái', 5, 20000, 1);
    PERFORM set_config('test.order', v_order::TEXT, TRUE);
END $$;

SELECT pg_temp.check('đơn test: total 300.000, cột cũ total_amount = 1',
    (SELECT total = 300000 AND total_amount = 1 FROM orders WHERE id = current_setting('test.order')::UUID),
    (SELECT total::TEXT || ' / ' || total_amount FROM orders WHERE id = current_setting('test.order')::UUID));

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('buyer_dashboard_stats: tiền chưa thanh toán tăng đúng 300.000',
    (public.buyer_dashboard_stats() ->> 'unpaid_amount')::NUMERIC
        - current_setting('test.unpaid_before')::NUMERIC = 300000,
    public.buyer_dashboard_stats() ->> 'unpaid_amount');

DO $$ BEGIN RAISE NOTICE '5.10a: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '5.10a: TẤT CẢ ĐẠT (3 ca)' AS ket_qua;
