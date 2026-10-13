-- Test 2 lỗi sửa sau khi rà soát bước 5–6 (migration 20261005094800):
--   1. báo giá bị buyer từ chối khi RFQ còn mở → RFQ lại được tính "cần báo giá";
--   2. đơn hàng có sẵn huỷ SAU khi gửi hàng → không cộng lại kho.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "6.8: TẤT CẢ ĐẠT (6 ca)". Hỏng: "FAIL …".
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

-- Dữ liệu riêng cho test:
--   RFQ đang mở của buyer A, mời xưởng A
--   P1 của xưởng A: HÀNG CÓ SẴN (kho 100), MOQ 10, giá 10+: 50.000đ, không biến thể
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_cat   UUID;
    v_rfq   UUID;
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
    INSERT INTO buyer_addresses (buyer_id, recipient_name, phone, address_line, province)
    VALUES (v_buyer, 'Người nhận test 6.8', '0900000068', '1 Đường Test', 'Hà Nội');

    INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
    VALUES (v_buyer, 'RFQ test 6.8', 100, 'cái', 'single', 'published')
    RETURNING id INTO v_rfq;
    INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);

    INSERT INTO products (id, supplier_id, category_id, name, min_order_qty, lead_time_days, status,
                          is_ready_stock, stock_qty)
    VALUES (v_p1, v_xa, v_cat, 'Bát gốm test 6.8', 10, 7, 'active', TRUE, 100);
    INSERT INTO price_tiers (product_id, min_qty, max_qty, unit_price) VALUES (v_p1, 10, NULL, 50000);

    PERFORM set_config('test.xa', v_xa::TEXT, TRUE), set_config('test.rfq', v_rfq::TEXT, TRUE),
            set_config('test.p1', v_p1::TEXT, TRUE);
END $$;

-- ── 1. Báo giá bị từ chối khi RFQ còn mở ───────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT set_config('test.before', public.supplier_dashboard_stats() ->> 'new_rfq_count', TRUE);
INSERT INTO rfq_quotes (rfq_id, unit_price, min_qty, lead_time_days)
VALUES (current_setting('test.rfq')::UUID, 50000, 100, 10);
SELECT set_config('test.q1', (SELECT id::TEXT FROM rfq_quotes
    WHERE rfq_id = current_setting('test.rfq')::UUID
      AND supplier_id = current_setting('test.xa')::UUID), TRUE);
SELECT set_config('test.quoted', public.supplier_dashboard_stats() ->> 'new_rfq_count', TRUE);
SELECT pg_temp.check('gửi báo giá → RFQ ra khỏi "cần báo giá"',
    current_setting('test.quoted')::INT = current_setting('test.before')::INT - 1,
    current_setting('test.before') || ' → ' || current_setting('test.quoted'));

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT public.reject_quote(current_setting('test.q1')::UUID, 'Giá cao');

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT set_config('test.after', public.supplier_dashboard_stats() ->> 'new_rfq_count', TRUE);
SELECT pg_temp.check('buyer từ chối khi RFQ còn mở → RFQ quay lại "cần báo giá"',
    current_setting('test.after')::INT = current_setting('test.before')::INT,
    current_setting('test.before') || ' → ' || current_setting('test.after'));
INSERT INTO rfq_quotes (rfq_id, unit_price, min_qty, lead_time_days)
VALUES (current_setting('test.rfq')::UUID, 47000, 100, 10);
SELECT pg_temp.check('xưởng báo giá lại được → RFQ lại ra khỏi "cần báo giá"',
    (public.supplier_dashboard_stats() ->> 'new_rfq_count')::INT = current_setting('test.before')::INT - 1,
    public.supplier_dashboard_stats() ->> 'new_rfq_count');

-- ── 2. Hoàn kho khi huỷ đơn hàng có sẵn ────────────────────────────────
-- Đơn A (20 cái): xưởng nhận, đã gửi hàng rồi mới bị huỷ → kho KHÔNG cộng lại.
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT public.cart_set_item(current_setting('test.p1')::UUID, NULL, 20);
SELECT public.checkout_cart();
SELECT set_config('test.order_a', (SELECT id::TEXT FROM orders
    WHERE supplier_id = current_setting('test.xa')::UUID AND status = 'pending_confirmation'
    ORDER BY created_at DESC LIMIT 1), TRUE);
SELECT pg_temp.check('đặt 20 → kho còn 80',
    (SELECT stock_qty = 80 FROM products WHERE id = current_setting('test.p1')::UUID),
    (SELECT stock_qty::TEXT FROM products WHERE id = current_setting('test.p1')::UUID));

SELECT pg_temp.as_system();
UPDATE orders SET status = 'shipped', logistics_provider = 'GHTK', tracking_number = 'T68'
WHERE id = current_setting('test.order_a')::UUID;
UPDATE orders SET status = 'cancelled', cancel_reason = 'test 6.8: hoàn tiền sau khi gửi hàng'
WHERE id = current_setting('test.order_a')::UUID;
SELECT pg_temp.check('huỷ SAU khi gửi hàng → kho vẫn 80, dòng hàng vẫn ghi "đã trừ kho"',
    (SELECT stock_qty = 80 FROM products WHERE id = current_setting('test.p1')::UUID)
    AND (SELECT bool_and(stock_deducted) FROM order_items
         WHERE order_id = current_setting('test.order_a')::UUID),
    (SELECT stock_qty::TEXT FROM products WHERE id = current_setting('test.p1')::UUID));

-- Đơn B (10 cái): huỷ khi chưa gửi hàng → kho được cộng lại như trước.
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT public.cart_set_item(current_setting('test.p1')::UUID, NULL, 10);
SELECT public.checkout_cart();
SELECT set_config('test.order_b', (SELECT id::TEXT FROM orders
    WHERE supplier_id = current_setting('test.xa')::UUID AND status = 'pending_confirmation'
    ORDER BY created_at DESC LIMIT 1), TRUE);
SELECT pg_temp.as_system();
UPDATE orders SET status = 'producing' WHERE id = current_setting('test.order_b')::UUID;
UPDATE orders SET status = 'cancelled', cancel_reason = 'test 6.8: huỷ trước khi gửi hàng'
WHERE id = current_setting('test.order_b')::UUID;
SELECT pg_temp.check('huỷ TRƯỚC khi gửi hàng → kho từ 70 về 80, dòng hàng hết ghi "đã trừ kho"',
    (SELECT stock_qty = 80 FROM products WHERE id = current_setting('test.p1')::UUID)
    AND (SELECT bool_and(NOT stock_deducted) FROM order_items
         WHERE order_id = current_setting('test.order_b')::UUID),
    (SELECT stock_qty::TEXT FROM products WHERE id = current_setting('test.p1')::UUID));

DO $$ BEGIN RAISE NOTICE '6.8: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '6.8: TẤT CẢ ĐẠT (6 ca)' AS ket_qua;
