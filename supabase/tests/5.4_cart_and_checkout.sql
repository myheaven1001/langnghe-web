-- Test kế hoạch 5.4 + 5.6 (database): giỏ hàng, checkout_cart(),
-- supplier_respond_order(), trừ / hoàn kho hàng có sẵn.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "5.4: TẤT CẢ ĐẠT (28 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.
-- Chạy lại thêm 2.2, 4.5 (save_product) và 5.2 (order_items).

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
--   P1  xưởng A, đang bán, HÀNG CÓ SẴN, MOQ 100, giá 100–199: 20.000đ, 200+: 18.000đ
--       biến thể Xanh (kho 150), Trắng (+1.000đ, kho 50)
--   P2  xưởng B, đang bán, làm theo đơn, MOQ 10, giá 10+: 50.000đ, không biến thể
--   P3  xưởng A, nháp
--   P4  xưởng A, đang bán, chưa có bảng giá
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_xb    UUID;
    v_cat   UUID;
    v_p1 UUID := gen_random_uuid();
    v_p2 UUID := gen_random_uuid();
    v_p3 UUID := gen_random_uuid();
    v_p4 UUID := gen_random_uuid();
    v_xanh  UUID;
    v_trang UUID;
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

    -- Cả 2 xưởng công khai, đang hoạt động; giỏ và sổ địa chỉ của buyer A trống.
    UPDATE users SET status = 'active'
    WHERE id IN (SELECT user_id FROM supplier_profiles WHERE id IN (v_xa, v_xb));
    UPDATE supplier_profiles SET is_hidden = FALSE WHERE id IN (v_xa, v_xb);
    DELETE FROM cart_items WHERE buyer_id = v_buyer;
    DELETE FROM buyer_addresses WHERE buyer_id = v_buyer;

    INSERT INTO products (id, supplier_id, category_id, name, min_order_qty, lead_time_days, status,
                          is_ready_stock, stock_qty)
    VALUES (v_p1, v_xa, v_cat, 'Bát gốm test 5.4', 100, 7, 'active', TRUE, 0),
           (v_p2, v_xb, v_cat, 'Giỏ mây test 5.4', 10, 14, 'active', FALSE, 0),
           (v_p3, v_xa, v_cat, 'Hàng nháp test 5.4', 1, 7, 'draft', FALSE, 0),
           (v_p4, v_xa, v_cat, 'Chưa có giá test 5.4', 1, 7, 'active', FALSE, 0);
    INSERT INTO price_tiers (product_id, min_qty, max_qty, unit_price)
    VALUES (v_p1, 100, 199, 20000), (v_p1, 200, NULL, 18000), (v_p2, 10, NULL, 50000);
    INSERT INTO product_variants (product_id, color, stock_qty, price_adjustment)
    VALUES (v_p1, 'Xanh', 150, 0) RETURNING id INTO v_xanh;
    INSERT INTO product_variants (product_id, color, stock_qty, price_adjustment)
    VALUES (v_p1, 'Trắng', 50, 1000) RETURNING id INTO v_trang;

    PERFORM set_config('test.buyer', v_buyer::TEXT, TRUE),
            set_config('test.xa', v_xa::TEXT, TRUE), set_config('test.xb', v_xb::TEXT, TRUE),
            set_config('test.p1', v_p1::TEXT, TRUE), set_config('test.p2', v_p2::TEXT, TRUE),
            set_config('test.p3', v_p3::TEXT, TRUE), set_config('test.p4', v_p4::TEXT, TRUE),
            set_config('test.xanh', v_xanh::TEXT, TRUE), set_config('test.trang', v_trang::TEXT, TRUE);
END $$;

-- ── Giỏ hàng ───────────────────────────────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng (không có hồ sơ buyer) thêm vào giỏ', 'NOT_A_BUYER',
    $q$SELECT public.cart_set_item(current_setting('test.p2')::UUID, NULL, 10)$q$);

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('đặt hàng khi giỏ trống', 'CART_EMPTY', $q$SELECT public.checkout_cart()$q$);
SELECT pg_temp.expect_error('thêm sản phẩm nháp', 'PRODUCT_NOT_AVAILABLE',
    $q$SELECT public.cart_set_item(current_setting('test.p3')::UUID, NULL, 5)$q$);
SELECT pg_temp.expect_error('thêm sản phẩm có biến thể mà không chọn biến thể', 'VARIANT_REQUIRED',
    $q$SELECT public.cart_set_item(current_setting('test.p1')::UUID, NULL, 100)$q$);
SELECT pg_temp.expect_error('biến thể của sản phẩm khác', 'VARIANT_NOT_AVAILABLE',
    $q$SELECT public.cart_set_item(current_setting('test.p2')::UUID, current_setting('test.xanh')::UUID, 10)$q$);
SELECT pg_temp.expect_error('số lượng âm', 'INVALID_QUANTITY',
    $q$SELECT public.cart_set_item(current_setting('test.p2')::UUID, NULL, -1)$q$);

SELECT public.cart_set_item(current_setting('test.p1')::UUID, current_setting('test.xanh')::UUID, 40);
SELECT public.cart_set_item(current_setting('test.p1')::UUID, current_setting('test.xanh')::UUID, 20);
SELECT public.cart_set_item(current_setting('test.p1')::UUID, current_setting('test.trang')::UUID, 30);
SELECT public.cart_set_item(current_setting('test.p2')::UUID, NULL, 10);
SELECT pg_temp.check('thêm 2 lần cùng biến thể → cộng dồn 60; giỏ có 3 dòng',
    (SELECT count(*) = 3 FROM cart_items)
    AND (SELECT quantity = 60 FROM cart_items WHERE variant_id = current_setting('test.xanh')::UUID),
    (SELECT string_agg(quantity::TEXT, ', ') FROM cart_items));

SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT pg_temp.check('buyer khác không thấy giỏ của buyer A',
    (SELECT count(*) = 0 FROM cart_items), 'buyer B đọc được giỏ của buyer A');

-- ── Kiểm tra lúc đặt ───────────────────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('đặt hàng khi chưa có địa chỉ', 'ADDRESS_REQUIRED',
    $q$SELECT public.checkout_cart()$q$);
INSERT INTO buyer_addresses (buyer_id, recipient_name, phone, address_line, province)
VALUES (current_setting('test.buyer')::UUID, 'Nguyễn Văn A', '0912345678', '12 Phố Gốm', 'Hà Nội');

SELECT pg_temp.expect_error('tổng 90 cái < MOQ 100 của sản phẩm', 'BELOW_MIN_ORDER_QTY',
    $q$SELECT public.checkout_cart()$q$);
SELECT public.cart_set_item(current_setting('test.p1')::UUID, current_setting('test.trang')::UUID, 60, 'set');
SELECT pg_temp.expect_error('biến thể Trắng chỉ còn 50, đặt 60', 'OUT_OF_STOCK',
    $q$SELECT public.checkout_cart()$q$);
SELECT public.cart_set_item(current_setting('test.p1')::UUID, current_setting('test.trang')::UUID, 40, 'set');
SELECT public.cart_set_item(current_setting('test.p4')::UUID, NULL, 1);
SELECT pg_temp.expect_error('sản phẩm chưa có bảng giá', 'PRICE_NOT_AVAILABLE',
    $q$SELECT public.checkout_cart()$q$);
SELECT public.cart_set_item(current_setting('test.p4')::UUID, NULL, 0, 'set');
SELECT pg_temp.check('các lần đặt lỗi không tạo đơn, không trừ kho, giỏ còn nguyên 3 dòng',
    (SELECT count(*) = 0 FROM orders o JOIN order_items i ON i.order_id = o.id
     WHERE i.product_id IN (current_setting('test.p1')::UUID, current_setting('test.p2')::UUID))
    AND (SELECT stock_qty = 150 FROM product_variants WHERE id = current_setting('test.xanh')::UUID)
    AND (SELECT count(*) = 3 FROM cart_items),
    'có đơn / kho bị trừ / giỏ bị đổi sau lần đặt lỗi');

-- ── Đặt hàng: 60 Xanh + 40 Trắng (xưởng A) + 10 giỏ mây (xưởng B) ──────
SELECT set_config('test.result', public.checkout_cart(NULL, 'Giao giờ hành chính')::TEXT, TRUE);
SELECT set_config('test.order_a', (SELECT id::TEXT FROM orders WHERE supplier_id = current_setting('test.xa')::UUID
                                   AND buyer_id = current_setting('test.buyer')::UUID AND source = 'direct'), TRUE),
       set_config('test.order_b', (SELECT id::TEXT FROM orders WHERE supplier_id = current_setting('test.xb')::UUID
                                   AND buyer_id = current_setting('test.buyer')::UUID AND source = 'direct'), TRUE);

SELECT pg_temp.check('giỏ có hàng của 2 xưởng → đúng 2 đơn, giỏ trống',
    jsonb_array_length(current_setting('test.result')::JSONB -> 'order_ids') = 2
    AND current_setting('test.order_a') <> '' AND current_setting('test.order_b') <> ''
    AND (SELECT count(*) = 0 FROM cart_items),
    current_setting('test.result'));
SELECT pg_temp.check('giá tính lại phía server theo TỔNG 100 cái: Xanh 20.000, Trắng 21.000 → 2.040.000',
    (SELECT total = 60 * 20000 + 40 * 21000 
            AND status = 'pending_confirmation' AND source = 'direct' AND rfq_quote_id IS NULL
            AND shipping_address = E'Nguyễn Văn A — 0912345678\n12 Phố Gốm, Hà Nội'
     FROM orders WHERE id = current_setting('test.order_a')::UUID)
    AND (SELECT count(*) = 2 AND bool_and(product_name = 'Bát gốm test 5.4' AND stock_deducted)
                AND bool_or(variant_label = 'Trắng' AND unit_price = 21000)
         FROM order_items WHERE order_id = current_setting('test.order_a')::UUID),
    (SELECT total::TEXT || ' / ' || status FROM orders WHERE id = current_setting('test.order_a')::UUID));
SELECT pg_temp.check('đơn của xưởng B: 10 × 50.000 = 500.000, không trừ kho (hàng làm theo đơn)',
    (SELECT total = 500000 FROM orders WHERE id = current_setting('test.order_b')::UUID)
    AND (SELECT count(*) = 1 AND bool_and(NOT stock_deducted AND variant_label IS NULL)
         FROM order_items WHERE order_id = current_setting('test.order_b')::UUID),
    (SELECT total::TEXT FROM orders WHERE id = current_setting('test.order_b')::UUID));
SELECT pg_temp.check('kho hàng có sẵn bị trừ: Xanh 150 → 90, Trắng 50 → 10',
    (SELECT stock_qty = 90 FROM product_variants WHERE id = current_setting('test.xanh')::UUID)
    AND (SELECT stock_qty = 10 FROM product_variants WHERE id = current_setting('test.trang')::UUID),
    'kho sai');
SELECT pg_temp.check('ghi chú của buyer nằm trên dòng thời gian của cả 2 đơn',
    (SELECT count(*) = 2 FROM order_events
     WHERE order_id IN (current_setting('test.order_a')::UUID, current_setting('test.order_b')::UUID)
       AND event_type = 'note' AND note = 'Giao giờ hành chính'),
    'thiếu ghi chú');
SELECT pg_temp.expect_error('buyer tự chuyển đơn sang "chờ thanh toán"', 'FORBIDDEN_ORDER_STATUS_CHANGE',
    $q$UPDATE orders SET status = 'pending_payment' WHERE id = current_setting('test.order_a')::UUID$q$);

-- ── Xưởng nhận / từ chối ───────────────────────────────────────────────
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.check('xưởng B nhận thông báo order_placed và chỉ thấy đơn của mình',
    (SELECT count(*) = 1 FROM notifications
     WHERE user_id = auth.uid() AND type = 'order_placed'
       AND payload ->> 'order_id' = current_setting('test.order_b'))
    AND (SELECT count(*) = 0 FROM orders WHERE id = current_setting('test.order_a')::UUID),
    'thiếu thông báo hoặc thấy đơn của xưởng khác');
SELECT pg_temp.expect_error('xưởng B xử lý đơn của xưởng A', 'ORDER_NOT_FOUND',
    $q$SELECT public.supplier_respond_order(current_setting('test.order_a')::UUID, TRUE)$q$);
SELECT public.supplier_respond_order(current_setting('test.order_b')::UUID, TRUE);
SELECT pg_temp.check('xưởng B nhận đơn → chờ thanh toán, có event order_accepted',
    (SELECT status = 'pending_payment' FROM orders WHERE id = current_setting('test.order_b')::UUID)
    AND (SELECT count(*) = 1 FROM order_events
         WHERE order_id = current_setting('test.order_b')::UUID AND event_type = 'order_accepted'),
    'nhận đơn sai');
SELECT pg_temp.expect_error('nhận lại đơn đã nhận', 'ORDER_NOT_PENDING_CONFIRMATION',
    $q$SELECT public.supplier_respond_order(current_setting('test.order_b')::UUID, FALSE, 'đổi ý')$q$);

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('từ chối không ghi lý do', 'REASON_REQUIRED',
    $q$SELECT public.supplier_respond_order(current_setting('test.order_a')::UUID, FALSE, ' ')$q$);
SELECT public.supplier_respond_order(current_setting('test.order_a')::UUID, FALSE, 'Hết men xanh');
SELECT pg_temp.check('xưởng A từ chối → đơn huỷ kèm lý do, kho được cộng lại (150 / 50)',
    (SELECT status = 'cancelled' AND cancel_reason = 'Hết men xanh' FROM orders
     WHERE id = current_setting('test.order_a')::UUID)
    AND (SELECT stock_qty = 150 FROM product_variants WHERE id = current_setting('test.xanh')::UUID)
    AND (SELECT stock_qty = 50 FROM product_variants WHERE id = current_setting('test.trang')::UUID)
    AND (SELECT bool_and(NOT stock_deducted) FROM order_items
         WHERE order_id = current_setting('test.order_a')::UUID),
    'từ chối đơn sai hoặc kho không được hoàn');

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('buyer nhận thông báo: xưởng B đã nhận đơn, xưởng A từ chối (có lý do)',
    (SELECT count(*) = 1 FROM notifications
     WHERE user_id = auth.uid() AND type = 'order_placed'
       AND payload ->> 'order_id' = current_setting('test.order_b'))
    AND (SELECT count(*) = 1 AND bool_and(body LIKE '%Hết men xanh%') FROM notifications
         WHERE user_id = auth.uid() AND type = 'order_declined'),
    'thiếu thông báo');

-- ── Hàng có sẵn qua save_product ───────────────────────────────────────
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT public.save_product(current_setting('test.p2')::UUID,
    jsonb_build_object('name', 'Giỏ mây test 5.4', 'category_id', (SELECT id FROM categories WHERE slug = 'gom-su'),
                       'min_order_qty', 10, 'lead_time_days', 14, 'status', 'active',
                       'is_ready_stock', TRUE, 'stock_qty', 25),
    '[{"min_qty":10,"max_qty":null,"unit_price":50000}]');
SELECT public.save_product(current_setting('test.p2')::UUID,
    jsonb_build_object('name', 'Giỏ mây test 5.4', 'category_id', (SELECT id FROM categories WHERE slug = 'gom-su'),
                       'min_order_qty', 10, 'lead_time_days', 14, 'status', 'active'),
    '[{"min_qty":10,"max_qty":null,"unit_price":50000}]');
SELECT pg_temp.check('save_product lưu "hàng có sẵn" + tồn kho; lưu kiểu cũ (không gửi 2 khoá) giữ nguyên',
    (SELECT is_ready_stock AND stock_qty = 25 FROM products WHERE id = current_setting('test.p2')::UUID),
    (SELECT is_ready_stock::TEXT || ' / ' || stock_qty FROM products WHERE id = current_setting('test.p2')::UUID));

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT public.cart_set_item(current_setting('test.p2')::UUID, NULL, 30);
SELECT pg_temp.expect_error('sản phẩm không biến thể: đặt 30 khi kho còn 25', 'OUT_OF_STOCK',
    $q$SELECT public.checkout_cart()$q$);

DO $$ BEGIN RAISE NOTICE '5.4: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '5.4: TẤT CẢ ĐẠT (28 ca)' AS ket_qua;
