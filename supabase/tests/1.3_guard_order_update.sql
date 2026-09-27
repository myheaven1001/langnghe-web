-- Test kế hoạch 1.3: chuyển trạng thái đơn hàng theo vai trò + cột chỉ admin sửa.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào Supabase
-- Dashboard → SQL Editor rồi Run, hoặc:
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/1.3_guard_order_update.sql
-- Đạt: kết quả cuối là "1.3: TẤT CẢ ĐẠT (23 ca)" (psql còn in NOTICE "PASS …").
-- Hỏng: dừng ở ca đầu tiên sai với thông báo "FAIL …".
-- Cả file chạy trong một transaction và ROLLBACK ở cuối: không đổi dữ liệu.

BEGIN;

-- ── Dữ liệu riêng cho test: 3 đơn của buyer A với xưởng A ──────────────
--   đơn 1 pending_payment — đi trọn luồng
--   đơn 2 producing       — giao bằng "Tự vận chuyển"
--   đơn 3 pending_payment — admin huỷ
DO $$
DECLARE
    v_buyer    UUID;
    v_supplier UUID;
    v_rfq      UUID;
    v_quote    UUID;
    v_order    UUID;
    i          INT;
BEGIN
    SELECT bp.id INTO v_buyer FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT sp.id INTO v_supplier FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    IF v_buyer IS NULL OR v_supplier IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a hoặc xuong.a — chạy npm run seed:staging trước.';
    END IF;

    FOR i IN 1..3 LOOP
        INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
        VALUES (v_buyer, 'RFQ test 1.3 #' || i, 100, 'cái', 'single', 'awarded')
        RETURNING id INTO v_rfq;
        INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, status)
        VALUES (v_rfq, v_supplier, 50000, 'accepted')
        RETURNING id INTO v_quote;
        INSERT INTO orders (rfq_quote_id, buyer_id, supplier_id, quantity, unit_price, status)
        VALUES (v_quote, v_buyer, v_supplier, 100, 50000,
                CASE i WHEN 2 THEN 'producing' ELSE 'pending_payment' END::order_status)
        RETURNING id INTO v_order;
        PERFORM set_config('test.order' || i, v_order::TEXT, TRUE);
    END LOOP;
END $$;

-- ── Công cụ ─────────────────────────────────────────────────────────────
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

-- Câu UPDATE phải bị chặn với đúng mã lỗi p_code.
CREATE FUNCTION pg_temp.expect_error(p_label TEXT, p_code TEXT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM = p_code THEN
            RAISE NOTICE 'PASS  %', p_label;
            RETURN;
        END IF;
        RAISE EXCEPTION 'FAIL  % — cần lỗi %, nhận %', p_label, p_code, SQLERRM;
    END;
    RAISE EXCEPTION 'FAIL  % — câu lệnh không bị chặn (cần %)', p_label, p_code;
END $$;

-- Câu UPDATE phải chạy được và đổi đúng 1 dòng.
CREATE FUNCTION pg_temp.expect_ok(p_label TEXT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_rows INT;
BEGIN
    BEGIN
        EXECUTE p_sql;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'FAIL  % — bị chặn nhầm: %', p_label, SQLERRM;
    END;
    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'FAIL  % — cập nhật % dòng, cần 1', p_label, v_rows;
    END IF;
    RAISE NOTICE 'PASS  %', p_label;
END $$;

-- ── Đơn 1: chờ thanh toán ──────────────────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng tự đặt "đã xác nhận thanh toán"', 'FORBIDDEN_ORDER_STATUS_CHANGE',
    $q$UPDATE orders SET status = 'confirmed' WHERE id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_error('xưởng sửa số lượng', 'FORBIDDEN_ORDER_FIELD_CHANGE',
    $q$UPDATE orders SET quantity = 1 WHERE id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_error('xưởng sửa địa chỉ nhận hàng', 'FORBIDDEN_ORDER_FIELD_CHANGE',
    $q$UPDATE orders SET shipping_address = 'x' WHERE id = current_setting('test.order1')::UUID$q$);

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('buyer sửa đơn giá', 'FORBIDDEN_ORDER_FIELD_CHANGE',
    $q$UPDATE orders SET unit_price = 1 WHERE id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_error('buyer tự ghi "đã thanh toán"', 'FORBIDDEN_ORDER_FIELD_CHANGE',
    $q$UPDATE orders SET payment_note = 'Đã CK' WHERE id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_error('buyer tự đặt hoàn tất', 'FORBIDDEN_ORDER_STATUS_CHANGE',
    $q$UPDATE orders SET status = 'completed' WHERE id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_ok('buyer sửa địa chỉ nhận hàng',
    $q$UPDATE orders SET shipping_address = '12 Trần Duy Hưng, Hà Nội' WHERE id = current_setting('test.order1')::UUID$q$);

-- Admin xác nhận thanh toán — đúng các cột nút "Xác nhận thanh toán" gửi.
SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.expect_ok('admin xác nhận thanh toán (nút hiện có)',
    $q$UPDATE orders SET status = 'confirmed', payment_confirmed_by = auth.uid(),
          confirmed_at = NOW(), payment_note = 'Phương thức: Chuyển khoản · Mã GD: TEST'
       WHERE id = current_setting('test.order1')::UUID$q$);

-- ── Đơn 1: đã xác nhận → sản xuất → giao ───────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('buyer đặt "đang sản xuất"', 'FORBIDDEN_ORDER_STATUS_CHANGE',
    $q$UPDATE orders SET status = 'producing' WHERE id = current_setting('test.order1')::UUID$q$);

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng nhảy thẳng sang "đã giao"', 'FORBIDDEN_ORDER_STATUS_CHANGE',
    $q$UPDATE orders SET status = 'shipped', logistics_provider = 'GHN', tracking_number = 'X1'
       WHERE id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_ok('xưởng bấm "Bắt đầu sản xuất" (nút hiện có)',
    $q$UPDATE orders SET status = 'producing' WHERE id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_error('xưởng giao qua GHN thiếu mã vận đơn', 'ORDER_TRACKING_REQUIRED',
    $q$UPDATE orders SET status = 'shipped', logistics_provider = 'GHN', tracking_number = NULL
       WHERE id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_ok('xưởng giao qua GHN có mã vận đơn (nút hiện có)',
    $q$UPDATE orders SET status = 'shipped', logistics_provider = 'GHN', tracking_number = 'GHN123456'
       WHERE id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_ok('xưởng sửa mã vận đơn sau khi giao',
    $q$UPDATE orders SET tracking_number = 'GHN999' WHERE id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_error('xưởng tự đặt "buyer đã nhận"', 'FORBIDDEN_ORDER_STATUS_CHANGE',
    $q$UPDATE orders SET status = 'delivered' WHERE id = current_setting('test.order1')::UUID$q$);

-- ── Đơn 1: buyer nhận hàng → hoàn tất ──────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('buyer sửa mã vận đơn', 'FORBIDDEN_ORDER_FIELD_CHANGE',
    $q$UPDATE orders SET tracking_number = 'X' WHERE id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_ok('buyer xác nhận đã nhận hàng',
    $q$UPDATE orders SET status = 'delivered' WHERE id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_ok('buyer hoàn tất đơn',
    $q$UPDATE orders SET status = 'completed' WHERE id = current_setting('test.order1')::UUID$q$);

-- ── Đơn 2: giao bằng "Tự vận chuyển" không cần mã vận đơn ──────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_ok('xưởng "Tự vận chuyển" không có mã vận đơn',
    $q$UPDATE orders SET status = 'shipped', logistics_provider = 'Tự vận chuyển', tracking_number = NULL
       WHERE id = current_setting('test.order2')::UUID$q$);

-- ── Đơn 3 và đơn 1: admin huỷ ──────────────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.expect_error('admin huỷ không ghi lý do', 'ORDER_CANCEL_REASON_REQUIRED',
    $q$UPDATE orders SET status = 'cancelled' WHERE id = current_setting('test.order3')::UUID$q$);
SELECT pg_temp.expect_ok('admin huỷ có lý do',
    $q$UPDATE orders SET status = 'cancelled', cancel_reason = 'Buyer không chuyển khoản sau 7 ngày'
       WHERE id = current_setting('test.order3')::UUID$q$);
SELECT pg_temp.expect_error('admin huỷ đơn đã hoàn tất', 'FORBIDDEN_ORDER_STATUS_CHANGE',
    $q$UPDATE orders SET status = 'cancelled', cancel_reason = 'x' WHERE id = current_setting('test.order1')::UUID$q$);

-- ── Nhật ký đơn (trigger cũ) vẫn ghi đủ các bước của đơn 1 ─────────────
RESET ROLE;
DO $$
DECLARE
    v_events TEXT;
BEGIN
    SELECT string_agg(event_type, ',' ORDER BY created_at, event_type) INTO v_events
    FROM order_events
    WHERE order_id = current_setting('test.order1')::UUID
      AND event_type IN ('payment_confirmed', 'producing_started', 'shipped', 'delivered', 'completed');
    IF v_events IS NULL OR array_length(string_to_array(v_events, ','), 1) <> 5 THEN
        RAISE EXCEPTION 'FAIL  nhật ký đơn 1 — cần 5 bước, có: %', v_events;
    END IF;
    RAISE NOTICE 'PASS  nhật ký đơn vẫn ghi đủ 5 bước';
END $$;

DO $$ BEGIN RAISE NOTICE '1.3: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

-- SQL Editor không hiện NOTICE: dòng này chỉ hiện khi mọi ca ở trên đều đạt.
SELECT '1.3: TẤT CẢ ĐẠT (23 ca)' AS ket_qua;
