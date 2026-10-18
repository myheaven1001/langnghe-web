-- Test kế hoạch 5.10 (migration 20261005095100): đã bỏ orders.quantity /
-- unit_price / total_amount và rfq_messages; chốt báo giá và đặt từ giỏ vẫn
-- tạo đúng dòng hàng.
--
-- CHỈ chạy trên STAGING (project alxaicpqwjszejmxplvh), KHÔNG chạy trên
-- production. Sau `npm run seed:staging`, dán cả file vào SQL Editor rồi Run.
-- Đạt: kết quả cuối là "5.10: TẤT CẢ ĐẠT (6 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.
-- Chạy lại thêm 1.2, 1.3, 5.2, 5.4, 5.7 (các test đã sửa theo 5.10).

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

CREATE FUNCTION pg_temp.expect_error(p_label TEXT, p_code TEXT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = p_code THEN
                RAISE NOTICE 'PASS  %', p_label;
                RETURN;
            END IF;
            RAISE EXCEPTION 'FAIL  % — cần lỗi %, nhận %', p_label, p_code, SQLERRM;
    END;
    RAISE EXCEPTION 'FAIL  % — không bị chặn (cần %)', p_label, p_code;
END $$;

-- ── Cấu trúc ───────────────────────────────────────────────────────────
SELECT pg_temp.check('orders không còn cột quantity / unit_price / total_amount',
    (SELECT count(*) = 0 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders'
       AND column_name IN ('quantity', 'unit_price', 'total_amount')),
    (SELECT string_agg(column_name, ', ') FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders'
       AND column_name IN ('quantity', 'unit_price', 'total_amount')));
SELECT pg_temp.check('rfq_messages, mark_thread_read, mark_all_messages_read đã bỏ',
    to_regclass('public.rfq_messages') IS NULL
    AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('mark_thread_read', 'mark_all_messages_read')),
    'còn đối tượng cũ');

-- Dữ liệu riêng cho test: RFQ 120 chiếc của buyer A, xưởng A báo 45.000đ;
-- P1 của xưởng A làm theo đơn, MOQ 10, giá 10+: 30.000đ.
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_cat   UUID;
    v_rfq   UUID;
    v_quote UUID;
    v_p1    UUID := gen_random_uuid();
BEGIN
    SELECT bp.id INTO v_buyer FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    SELECT id INTO v_cat FROM categories WHERE slug = 'gom-su';
    IF v_buyer IS NULL OR v_xa IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a / xuong.a — chạy npm run seed:staging trước.';
    END IF;
    UPDATE users SET status = 'active'
    WHERE id IN (SELECT user_id FROM supplier_profiles WHERE id = v_xa)
       OR id IN (SELECT user_id FROM buyer_profiles WHERE id = v_buyer);
    UPDATE supplier_profiles SET is_hidden = FALSE WHERE id = v_xa;
    DELETE FROM cart_items WHERE buyer_id = v_buyer;
    DELETE FROM buyer_addresses WHERE buyer_id = v_buyer;
    INSERT INTO buyer_addresses (buyer_id, recipient_name, phone, address_line, province, is_default)
    VALUES (v_buyer, 'Người nhận test 5.10', '0900000510', '1 Đường Test', 'Hà Nội', TRUE);

    INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
    VALUES (v_buyer, 'Bình gốm test 5.10', 120, 'chiếc', 'single', 'quoted')
    RETURNING id INTO v_rfq;
    INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);
    INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, min_qty, lead_time_days, status)
    VALUES (v_rfq, v_xa, 45000, 100, 10, 'pending')
    RETURNING id INTO v_quote;

    INSERT INTO products (id, supplier_id, category_id, name, min_order_qty, lead_time_days, status)
    VALUES (v_p1, v_xa, v_cat, 'Giỏ test 5.10', 10, 7, 'active');
    INSERT INTO price_tiers (product_id, min_qty, max_qty, unit_price) VALUES (v_p1, 10, NULL, 30000);

    PERFORM set_config('test.quote', v_quote::TEXT, TRUE), set_config('test.p1', v_p1::TEXT, TRUE),
            set_config('test.xa', v_xa::TEXT, TRUE);
END $$;

-- ── Chốt báo giá ───────────────────────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT set_config('test.order_rfq',
    public.accept_quote(current_setting('test.quote')::UUID) ->> 'order_id', TRUE);
SELECT pg_temp.check('chốt báo giá → 1 dòng hàng 120 × 45.000 (từ RFQ và báo giá), total 5.400.000',
    (SELECT total = 5400000 AND source = 'rfq' AND status = 'pending_payment'
     FROM orders WHERE id = current_setting('test.order_rfq')::UUID)
    AND (SELECT count(*) = 1 AND bool_and(quantity = 120 AND unit_price = 45000
                                          AND product_name = 'Bình gốm test 5.10' AND unit = 'chiếc')
         FROM order_items WHERE order_id = current_setting('test.order_rfq')::UUID),
    (SELECT COALESCE(max(total)::TEXT, 'không có đơn') FROM orders
     WHERE id = current_setting('test.order_rfq')::UUID));

-- ── Đặt từ giỏ ─────────────────────────────────────────────────────────
SELECT public.cart_set_item(current_setting('test.p1')::UUID, NULL, 25);
SELECT public.checkout_cart();
SELECT pg_temp.check('đặt từ giỏ 25 × 30.000 → đơn chờ xưởng xác nhận, total 750.000',
    (SELECT count(*) = 1 AND bool_and(total = 750000 AND source = 'direct')
     FROM orders o
     WHERE o.supplier_id = current_setting('test.xa')::UUID AND o.status = 'pending_confirmation'
       AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id
                   AND i.product_id = current_setting('test.p1')::UUID AND i.quantity = 25)),
    'đơn đặt từ giỏ sai');

-- ── Chặn sửa tổng tiền vẫn còn ─────────────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng sửa tổng tiền đơn', 'FORBIDDEN_ORDER_FIELD_CHANGE',
    $q$UPDATE orders SET total = 1 WHERE id = current_setting('test.order_rfq')::UUID$q$);
SELECT pg_temp.check('xưởng vẫn đọc được đơn và dòng hàng',
    (SELECT count(*) = 1 FROM order_items WHERE order_id = current_setting('test.order_rfq')::UUID),
    'không đọc được');

DO $$ BEGIN RAISE NOTICE '5.10: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '5.10: TẤT CẢ ĐẠT (6 ca)' AS ket_qua;
