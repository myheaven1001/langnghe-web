-- Test kế hoạch 5.2: order_items, orders.source, orders.total.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "5.2: TẤT CẢ ĐẠT (13 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.
-- Chạy lại thêm 1.2, 1.3, 3.2, 3.6_3.7 (đều tạo / sửa đơn).

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

-- Câu lệnh phải lỗi p_code ('DENIED' = quyền 42501, 'CHECK' = vi phạm CHECK).
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
        WHEN check_violation THEN
            IF p_code = 'CHECK' THEN
                RAISE NOTICE 'PASS  % (vi phạm ràng buộc)', p_label;
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

-- ── Đơn cũ đã được chuyển đúng ─────────────────────────────────────────
SELECT pg_temp.check('mọi đơn có đúng 1 dòng hàng trở lên và total = total_amount',
    (SELECT count(*) = 0 FROM orders o
     WHERE o.total IS DISTINCT FROM o.total_amount
        OR NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)),
    (SELECT count(*)::TEXT || ' đơn lệch' FROM orders o
     WHERE o.total IS DISTINCT FROM o.total_amount
        OR NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)));
SELECT pg_temp.check('tổng mọi dòng hàng = tổng total_amount của mọi đơn',
    (SELECT COALESCE(sum(line_total), 0) FROM order_items)
        = (SELECT COALESCE(sum(total_amount), 0) FROM orders),
    'tổng tiền lệch');

-- Dữ liệu riêng cho test: 1 RFQ đang mở của buyer A + báo giá của xưởng A.
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_rfq   UUID;
    v_quote UUID;
BEGIN
    SELECT bp.id INTO v_buyer FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    IF v_buyer IS NULL OR v_xa IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a / xuong.a — chạy npm run seed:staging trước.';
    END IF;

    INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
    VALUES (v_buyer, 'Bình gốm test 5.2', 120, 'chiếc', 'single', 'published')
    RETURNING id INTO v_rfq;
    INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);
    INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, min_qty, lead_time_days, status)
    VALUES (v_rfq, v_xa, 45000, 100, 10, 'pending')
    RETURNING id INTO v_quote;
    INSERT INTO buyer_addresses (buyer_id, recipient_name, phone, address_line, province)
    VALUES (v_buyer, 'Người nhận test', '0900000000', '1 Phố Test', 'Hà Nội');

    PERFORM set_config('test.buyer', v_buyer::TEXT, TRUE),
            set_config('test.xa', v_xa::TEXT, TRUE),
            set_config('test.quote', v_quote::TEXT, TRUE);
END $$;

-- ── Đơn mới từ báo giá: dòng hàng tự tạo, accept_quote không đổi ───────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT set_config('test.order',
                  public.accept_quote(current_setting('test.quote')::UUID) ->> 'order_id', TRUE);
SELECT pg_temp.check('chấp nhận báo giá → đơn source = rfq, total = 120 × 45.000 = 5.400.000',
    (SELECT source = 'rfq' AND total = 5400000 AND total = total_amount
     FROM orders WHERE id = current_setting('test.order')::UUID),
    (SELECT total::TEXT FROM orders WHERE id = current_setting('test.order')::UUID));
SELECT pg_temp.check('đơn có đúng 1 dòng hàng, chép tên và đơn vị từ RFQ',
    (SELECT count(*) = 1 AND bool_and(product_name = 'Bình gốm test 5.2' AND unit = 'chiếc'
                                      AND quantity = 120 AND unit_price = 45000
                                      AND line_total = 5400000)
     FROM order_items WHERE order_id = current_setting('test.order')::UUID),
    'dòng hàng sai');

-- ── Không ai sửa tổng tiền / dòng hàng qua API ─────────────────────────
SELECT pg_temp.expect_error('buyer sửa thẳng total của đơn', 'FORBIDDEN_ORDER_FIELD_CHANGE',
    $q$UPDATE orders SET total = 1 WHERE id = current_setting('test.order')::UUID$q$);
SELECT pg_temp.expect_error('buyer đổi nguồn đơn', 'FORBIDDEN_ORDER_FIELD_CHANGE',
    $q$UPDATE orders SET source = 'direct' WHERE id = current_setting('test.order')::UUID$q$);
DO $$
DECLARE
    v_rows INT;
BEGIN
    UPDATE order_items SET unit_price = 1 WHERE order_id = current_setting('test.order')::UUID;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN
        RAISE EXCEPTION 'FAIL  buyer sửa giá dòng hàng — đổi được % dòng', v_rows;
    END IF;
    RAISE NOTICE 'PASS  buyer sửa giá dòng hàng → không đổi gì';
END $$;
SELECT pg_temp.expect_error('buyer tự thêm dòng hàng vào đơn', 'DENIED',
    $q$INSERT INTO order_items (order_id, product_name, quantity, unit_price)
       VALUES (current_setting('test.order')::UUID, 'Hàng lậu', 1, 1)$q$);

SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.check('xưởng không liên quan không thấy dòng hàng của đơn',
    (SELECT count(*) = 0 FROM order_items WHERE order_id = current_setting('test.order')::UUID),
    'xưởng khác đọc được dòng hàng');
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('xưởng của đơn thấy dòng hàng',
    (SELECT count(*) = 1 FROM order_items WHERE order_id = current_setting('test.order')::UUID),
    'xưởng của đơn không đọc được dòng hàng');

-- ── Đơn nhiều dòng (như checkout_cart sẽ tạo): total tự tính ───────────
RESET ROLE;
DO $$
DECLARE
    v_order UUID;
BEGIN
    INSERT INTO orders (source, buyer_id, supplier_id, quantity, unit_price, status)
    VALUES ('direct', current_setting('test.buyer')::UUID, current_setting('test.xa')::UUID, 1, 0, 'pending_confirmation')
    RETURNING id INTO v_order;
    INSERT INTO order_items (order_id, product_name, variant_label, unit, quantity, unit_price, sort_order)
    VALUES (v_order, 'Bát gốm', 'Xanh', 'cái', 60, 20000, 0),
           (v_order, 'Bát gốm', 'Trắng', 'cái', 40, 21000, 1);
    PERFORM set_config('test.direct', v_order::TEXT, TRUE);
END $$;
SELECT pg_temp.check('đơn đặt thẳng 2 dòng: total = 60×20.000 + 40×21.000 = 2.040.000, không tự sinh dòng thừa',
    (SELECT total = 2040000 FROM orders WHERE id = current_setting('test.direct')::UUID)
    AND (SELECT count(*) = 2 FROM order_items WHERE order_id = current_setting('test.direct')::UUID),
    (SELECT total::TEXT FROM orders WHERE id = current_setting('test.direct')::UUID));
DELETE FROM order_items WHERE order_id = current_setting('test.direct')::UUID AND variant_label = 'Trắng';
SELECT pg_temp.check('bỏ 1 dòng hàng → total tự giảm còn 1.200.000',
    (SELECT total = 1200000 FROM orders WHERE id = current_setting('test.direct')::UUID),
    (SELECT total::TEXT FROM orders WHERE id = current_setting('test.direct')::UUID));
SELECT pg_temp.expect_error('đơn rfq mà không có báo giá', 'CHECK',
    $q$INSERT INTO orders (source, buyer_id, supplier_id, quantity, unit_price)
       VALUES ('rfq', current_setting('test.buyer')::UUID, current_setting('test.xa')::UUID, 1, 1)$q$);

DO $$ BEGIN RAISE NOTICE '5.2: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '5.2: TẤT CẢ ĐẠT (13 ca)' AS ket_qua;
