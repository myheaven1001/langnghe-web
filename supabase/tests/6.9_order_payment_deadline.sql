-- Test hạn chuyển khoản (migration 20261005094900): order_payment_days,
-- auto_cancel_unpaid_orders(), order_payment_started_at().
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "6.9: TẤT CẢ ĐẠT (9 ca)". Hỏng: "FAIL …".
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

-- Đặt một đơn 10–20 cái hàng có sẵn rồi cho xưởng nhận → đơn chờ thanh toán.
CREATE FUNCTION pg_temp.place_and_accept(p_qty INT, p_key TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_temp.login('buyer.a@langnghe.test');
    PERFORM public.cart_set_item(current_setting('test.p1')::UUID, NULL, p_qty);
    PERFORM public.checkout_cart();
    PERFORM set_config('test.' || p_key, (SELECT id::TEXT FROM public.orders
        WHERE supplier_id = current_setting('test.xa')::UUID AND status = 'pending_confirmation'
        ORDER BY created_at DESC LIMIT 1), TRUE);
    PERFORM pg_temp.login('xuong.a@langnghe.test');
    PERFORM public.supplier_respond_order(current_setting('test.' || p_key)::UUID, TRUE);
END $$;

-- Lùi mốc thời gian của một đơn (tạo đơn / xưởng nhận) về trước N ngày.
CREATE FUNCTION pg_temp.age(p_key TEXT, p_created_days INT, p_accepted_days INT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.orders SET created_at = created_at - make_interval(days => p_created_days)
    WHERE id = current_setting('test.' || p_key)::UUID;
    UPDATE public.order_events SET created_at = created_at - make_interval(days => p_accepted_days)
    WHERE order_id = current_setting('test.' || p_key)::UUID AND event_type = 'order_accepted';
END $$;

-- Dữ liệu riêng cho test: P1 của xưởng A, HÀNG CÓ SẴN (kho 100), MOQ 10, giá 50.000đ.
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_cat   UUID;
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
    UPDATE platform_settings SET value = '3' WHERE key = 'order_payment_days';
    DELETE FROM cart_items WHERE buyer_id = v_buyer;
    DELETE FROM buyer_addresses WHERE buyer_id = v_buyer;
    INSERT INTO buyer_addresses (buyer_id, recipient_name, phone, address_line, province)
    VALUES (v_buyer, 'Người nhận test 6.9', '0900000069', '1 Đường Test', 'Hà Nội');

    INSERT INTO products (id, supplier_id, category_id, name, min_order_qty, lead_time_days, status,
                          is_ready_stock, stock_qty)
    VALUES (v_p1, v_xa, v_cat, 'Bát gốm test 6.9', 10, 7, 'active', TRUE, 100);
    INSERT INTO price_tiers (product_id, min_qty, max_qty, unit_price) VALUES (v_p1, 10, NULL, 50000);

    PERFORM set_config('test.xa', v_xa::TEXT, TRUE), set_config('test.p1', v_p1::TEXT, TRUE);
END $$;

--   Đơn A (20 cái): tạo 5 ngày trước, xưởng nhận 4 ngày trước → quá hạn 3 ngày, tự huỷ.
--   Đơn B (10 cái): tạo 5 ngày trước nhưng xưởng mới nhận 1 ngày trước → còn hạn.
--   Đơn C (10 cái): quá hạn nhưng buyer đã tải biên lai → không huỷ.
SELECT pg_temp.place_and_accept(20, 'a');
SELECT pg_temp.place_and_accept(10, 'b');
SELECT pg_temp.place_and_accept(10, 'c');
SELECT pg_temp.check('3 đơn chờ thanh toán, kho còn 60',
    (SELECT count(*) = 3 FROM orders
     WHERE id IN (current_setting('test.a')::UUID, current_setting('test.b')::UUID, current_setting('test.c')::UUID)
       AND status = 'pending_payment')
    AND (SELECT stock_qty = 60 FROM products WHERE id = current_setting('test.p1')::UUID),
    (SELECT stock_qty::TEXT FROM products WHERE id = current_setting('test.p1')::UUID));

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('người dùng gọi thẳng hàm tự huỷ', 'DENIED',
    $q$SELECT public.auto_cancel_unpaid_orders()$q$);
SELECT pg_temp.check('buyer đọc được hạn thanh toán (3 ngày) và mốc bắt đầu của đơn mình',
    (SELECT value = '3'::JSONB FROM platform_settings WHERE key = 'order_payment_days')
    AND public.order_payment_started_at(current_setting('test.a')::UUID) IS NOT NULL,
    'không đọc được');

SELECT pg_temp.as_system();
SELECT pg_temp.age('a', 5, 4);
SELECT pg_temp.age('b', 5, 1);
SELECT pg_temp.age('c', 5, 4);
INSERT INTO order_documents (order_id, uploaded_by, uploader_role, doc_type, storage_path, file_name)
VALUES (current_setting('test.c')::UUID,
        (SELECT id FROM auth.users WHERE email = 'buyer.a@langnghe.test'), 'buyer', 'payment_receipt',
        current_setting('test.c') || '/bien-lai-test-6.9.jpg', 'bien-lai.jpg');

SELECT pg_temp.check('mốc bắt đầu = lúc xưởng nhận đơn, không phải lúc tạo đơn',
    public.order_payment_started_at(current_setting('test.b')::UUID)
        > (NOW() AT TIME ZONE 'UTC') - INTERVAL '2 days',
    public.order_payment_started_at(current_setting('test.b')::UUID)::TEXT);

SELECT set_config('test.n', public.auto_cancel_unpaid_orders()::TEXT, TRUE);
SELECT pg_temp.check('đơn A quá hạn → tự huỷ kèm lý do, kho cộng lại 20 (còn 80)',
    current_setting('test.n')::INT >= 1
    AND (SELECT status = 'cancelled' AND cancel_reason LIKE 'Buyer không chuyển khoản trong 3 ngày%'
         FROM orders WHERE id = current_setting('test.a')::UUID)
    AND (SELECT stock_qty = 80 FROM products WHERE id = current_setting('test.p1')::UUID),
    (SELECT status || ' / ' || COALESCE(cancel_reason, '∅') FROM orders WHERE id = current_setting('test.a')::UUID));
SELECT pg_temp.check('đơn B (xưởng mới nhận 1 ngày) vẫn chờ thanh toán',
    (SELECT status = 'pending_payment' FROM orders WHERE id = current_setting('test.b')::UUID),
    (SELECT status::TEXT FROM orders WHERE id = current_setting('test.b')::UUID));
SELECT pg_temp.check('đơn C quá hạn nhưng đã có biên lai → không huỷ',
    (SELECT status = 'pending_payment' FROM orders WHERE id = current_setting('test.c')::UUID),
    (SELECT status::TEXT FROM orders WHERE id = current_setting('test.c')::UUID));

SELECT pg_temp.check('buyer và xưởng nhận thông báo đơn A tự huỷ',
    (SELECT count(*) = 1 FROM notifications n JOIN buyer_profiles bp ON bp.user_id = n.user_id
     JOIN orders o ON o.buyer_id = bp.id AND o.id = current_setting('test.a')::UUID
     WHERE n.type = 'order_declined' AND n.payload ->> 'order_id' = current_setting('test.a'))
    AND (SELECT count(*) = 1 FROM notifications n JOIN supplier_profiles sp ON sp.user_id = n.user_id
         WHERE sp.id = current_setting('test.xa')::UUID AND n.type = 'order_declined'
           AND n.payload ->> 'order_id' = current_setting('test.a')),
    'thiếu thông báo');

SELECT set_config('test.n2', public.auto_cancel_unpaid_orders()::TEXT, TRUE);
SELECT pg_temp.check('chạy lại ngay: không huỷ thêm đơn nào trong 3 đơn test',
    (SELECT count(*) = 2 FROM orders
         WHERE id IN (current_setting('test.b')::UUID, current_setting('test.c')::UUID)
           AND status = 'pending_payment'),
    'đơn B hoặc C bị huỷ');

DO $$ BEGIN RAISE NOTICE '6.9: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '6.9: TẤT CẢ ĐẠT (9 ca)' AS ket_qua;
