-- Test kế hoạch 5.6 (bổ sung): buyer_cancel_order(), auto_cancel_unconfirmed_orders(),
-- cài đặt order_confirmation_days.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "5.6: TẤT CẢ ĐẠT (18 ca)". Hỏng: "FAIL …".
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

-- Về vai trò chạy file (postgres): dùng cho pg_cron và để "lùi ngày" đơn.
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

-- Dữ liệu riêng cho test:
--   P1  xưởng A, HÀNG CÓ SẴN (kho 100), MOQ 10, giá 10+: 50.000đ, không biến thể
--   P2  xưởng B, làm theo đơn, MOQ 10, giá 10+: 30.000đ
--   Hạn xác nhận đặt về 3 ngày.
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_xb    UUID;
    v_cat   UUID;
    v_p1 UUID := gen_random_uuid();
    v_p2 UUID := gen_random_uuid();
BEGIN
    SELECT bp.id INTO v_buyer FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    SELECT sp.id INTO v_xb FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.b@langnghe.test';
    SELECT id INTO v_cat FROM categories WHERE slug = 'gom-su';
    IF v_buyer IS NULL OR v_xa IS NULL OR v_xb IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a / xuong.a / xuong.b — chạy npm run seed:staging trước.';
    END IF;

    UPDATE users SET status = 'active'
    WHERE id IN (SELECT user_id FROM supplier_profiles WHERE id IN (v_xa, v_xb));
    UPDATE supplier_profiles SET is_hidden = FALSE WHERE id IN (v_xa, v_xb);
    DELETE FROM cart_items WHERE buyer_id = v_buyer;
    DELETE FROM buyer_addresses WHERE buyer_id = v_buyer;
    INSERT INTO buyer_addresses (buyer_id, recipient_name, phone, address_line, province)
    VALUES (v_buyer, 'Người nhận test 5.6', '0900000056', '1 Đường Test', 'Hà Nội');
    UPDATE platform_settings SET value = '3' WHERE key = 'order_confirmation_days';

    INSERT INTO products (id, supplier_id, category_id, name, min_order_qty, lead_time_days, status,
                          is_ready_stock, stock_qty)
    VALUES (v_p1, v_xa, v_cat, 'Bát gốm test 5.6', 10, 7, 'active', TRUE, 100),
           (v_p2, v_xb, v_cat, 'Giỏ mây test 5.6', 10, 14, 'active', FALSE, 0);
    INSERT INTO price_tiers (product_id, min_qty, max_qty, unit_price)
    VALUES (v_p1, 10, NULL, 50000), (v_p2, 10, NULL, 30000);

    PERFORM set_config('test.xa', v_xa::TEXT, TRUE), set_config('test.xb', v_xb::TEXT, TRUE),
            set_config('test.p1', v_p1::TEXT, TRUE), set_config('test.p2', v_p2::TEXT, TRUE);
END $$;

-- ── Buyer huỷ đơn đang chờ xưởng xác nhận ──────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('buyer đọc được hạn xác nhận (3 ngày)',
    (SELECT value = '3'::JSONB FROM platform_settings WHERE key = 'order_confirmation_days'),
    'không đọc được cài đặt order_confirmation_days');
SELECT public.cart_set_item(current_setting('test.p1')::UUID, NULL, 20);
SELECT public.cart_set_item(current_setting('test.p2')::UUID, NULL, 10);
SELECT public.checkout_cart();
SELECT set_config('test.order_a', (SELECT id::TEXT FROM orders
    WHERE supplier_id = current_setting('test.xa')::UUID AND status = 'pending_confirmation'
    ORDER BY created_at DESC LIMIT 1), TRUE);
SELECT set_config('test.order_b', (SELECT id::TEXT FROM orders
    WHERE supplier_id = current_setting('test.xb')::UUID AND status = 'pending_confirmation'
    ORDER BY created_at DESC LIMIT 1), TRUE);
SELECT pg_temp.check('đặt 20 hàng có sẵn → kho còn 80',
    (SELECT stock_qty = 80 FROM products WHERE id = current_setting('test.p1')::UUID),
    (SELECT stock_qty::TEXT FROM products WHERE id = current_setting('test.p1')::UUID));

SELECT pg_temp.as_anon();
SELECT pg_temp.expect_error('khách chưa đăng nhập gọi buyer_cancel_order', 'DENIED',
    $q$SELECT public.buyer_cancel_order(current_setting('test.order_a')::UUID)$q$);
SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT pg_temp.expect_error('buyer B huỷ đơn của buyer A', 'ORDER_NOT_FOUND',
    $q$SELECT public.buyer_cancel_order(current_setting('test.order_a')::UUID)$q$);
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng dùng hàm huỷ của buyer', 'ORDER_NOT_FOUND',
    $q$SELECT public.buyer_cancel_order(current_setting('test.order_a')::UUID)$q$);

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT public.buyer_cancel_order(current_setting('test.order_a')::UUID, '  Đặt nhầm số lượng ');
SELECT pg_temp.check('buyer A huỷ → đơn huỷ kèm lý do, kho được cộng lại (100)',
    (SELECT status = 'cancelled' AND cancel_reason = 'Buyer huỷ trước khi xưởng xác nhận: Đặt nhầm số lượng'
     FROM orders WHERE id = current_setting('test.order_a')::UUID)
    AND (SELECT stock_qty = 100 FROM products WHERE id = current_setting('test.p1')::UUID)
    AND (SELECT bool_and(NOT stock_deducted) FROM order_items
         WHERE order_id = current_setting('test.order_a')::UUID),
    (SELECT status || ' / ' || COALESCE(cancel_reason, '∅') FROM orders
     WHERE id = current_setting('test.order_a')::UUID));
SELECT pg_temp.expect_error('huỷ lại đơn đã huỷ', 'ORDER_NOT_PENDING_CONFIRMATION',
    $q$SELECT public.buyer_cancel_order(current_setting('test.order_a')::UUID)$q$);

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('xưởng A nhận thông báo buyer đã huỷ (có lý do)',
    (SELECT count(*) = 1 AND bool_and(body LIKE '%Đặt nhầm số lượng%') FROM notifications
     WHERE user_id = auth.uid() AND type = 'order_declined'
       AND payload ->> 'order_id' = current_setting('test.order_a')),
    'thiếu thông báo cho xưởng');

SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT public.supplier_respond_order(current_setting('test.order_b')::UUID, TRUE);
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng đã nhận đơn thì buyer không tự huỷ được nữa', 'ORDER_NOT_PENDING_CONFIRMATION',
    $q$SELECT public.buyer_cancel_order(current_setting('test.order_b')::UUID)$q$);

-- ── Tự huỷ đơn quá hạn xác nhận ────────────────────────────────────────
SELECT public.cart_set_item(current_setting('test.p1')::UUID, NULL, 30);
SELECT public.cart_set_item(current_setting('test.p2')::UUID, NULL, 10);
SELECT public.checkout_cart();
SELECT set_config('test.order_c', (SELECT id::TEXT FROM orders
    WHERE supplier_id = current_setting('test.xa')::UUID AND status = 'pending_confirmation'
    ORDER BY created_at DESC LIMIT 1), TRUE);
SELECT set_config('test.order_d', (SELECT id::TEXT FROM orders
    WHERE supplier_id = current_setting('test.xb')::UUID AND status = 'pending_confirmation'
    ORDER BY created_at DESC LIMIT 1), TRUE);
SELECT pg_temp.expect_error('người dùng gọi thẳng hàm tự huỷ', 'DENIED',
    $q$SELECT public.auto_cancel_unconfirmed_orders()$q$);

-- Đơn C đã 4 ngày (quá hạn 3 ngày), đơn D mới 2 ngày.
SELECT pg_temp.as_system();
UPDATE orders SET created_at = created_at - INTERVAL '4 days' WHERE id = current_setting('test.order_c')::UUID;
UPDATE orders SET created_at = created_at - INTERVAL '2 days' WHERE id = current_setting('test.order_d')::UUID;
SELECT set_config('test.n', public.auto_cancel_unconfirmed_orders()::TEXT, TRUE);
SELECT pg_temp.check('đơn quá 3 ngày tự huỷ kèm lý do, kho cộng lại (100); đơn 2 ngày còn nguyên',
    current_setting('test.n')::INT >= 1
    AND (SELECT status = 'cancelled' AND cancel_reason LIKE 'Xưởng không xác nhận trong 3 ngày%'
         FROM orders WHERE id = current_setting('test.order_c')::UUID)
    AND (SELECT stock_qty = 100 FROM products WHERE id = current_setting('test.p1')::UUID)
    AND (SELECT status = 'pending_confirmation' FROM orders WHERE id = current_setting('test.order_d')::UUID),
    (SELECT status || ' / ' || COALESCE(cancel_reason, '∅') FROM orders
     WHERE id = current_setting('test.order_c')::UUID));
SELECT set_config('test.n', public.auto_cancel_unconfirmed_orders()::TEXT, TRUE);
SELECT pg_temp.check('chạy lại ngay: không còn đơn nào để huỷ',
    current_setting('test.n')::INT = 0, current_setting('test.n'));

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('buyer nhận thông báo đơn tự huỷ',
    (SELECT count(*) = 1 FROM notifications
     WHERE user_id = auth.uid() AND type = 'order_declined'
       AND payload ->> 'order_id' = current_setting('test.order_c')),
    'thiếu thông báo cho buyer');
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('xưởng nhận thông báo đơn tự huỷ',
    (SELECT count(*) = 1 FROM notifications
     WHERE user_id = auth.uid() AND type = 'order_declined'
       AND payload ->> 'order_id' = current_setting('test.order_c')),
    'thiếu thông báo cho xưởng');

-- ── Cài đặt hạn xác nhận ───────────────────────────────────────────────
SELECT pg_temp.expect_error('xưởng sửa hạn xác nhận', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_set_setting('order_confirmation_days', '5'::JSONB)$q$);
SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.expect_error('hạn 0 ngày', 'INVALID_SETTING',
    $q$SELECT public.admin_set_setting('order_confirmation_days', '0'::JSONB)$q$);
SELECT pg_temp.expect_error('hạn 15 ngày', 'INVALID_SETTING',
    $q$SELECT public.admin_set_setting('order_confirmation_days', '15'::JSONB)$q$);
SELECT public.admin_set_setting('order_confirmation_days', '1'::JSONB);

-- Hạn mới 1 ngày: đơn D (2 ngày tuổi) giờ đã quá hạn.
SELECT pg_temp.as_system();
SELECT set_config('test.n', public.auto_cancel_unconfirmed_orders()::TEXT, TRUE);
SELECT pg_temp.check('admin đổi hạn còn 1 ngày → đơn 2 ngày tuổi tự huỷ theo hạn mới',
    current_setting('test.n')::INT >= 1
    AND (SELECT status = 'cancelled' AND cancel_reason LIKE 'Xưởng không xác nhận trong 1 ngày%'
         FROM orders WHERE id = current_setting('test.order_d')::UUID),
    (SELECT status || ' / ' || COALESCE(cancel_reason, '∅') FROM orders
     WHERE id = current_setting('test.order_d')::UUID));

DO $$ BEGIN RAISE NOTICE '5.6: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '5.6: TẤT CẢ ĐẠT (18 ca)' AS ket_qua;
