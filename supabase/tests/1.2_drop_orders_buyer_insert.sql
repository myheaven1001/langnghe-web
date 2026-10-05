-- Test kế hoạch 1.2: buyer không tạo đơn thẳng vào orders; chấp nhận báo
-- giá (accept_quote) vẫn tạo đơn.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào Supabase
-- Dashboard → SQL Editor rồi Run, hoặc:
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/1.2_drop_orders_buyer_insert.sql
-- Đạt: kết quả cuối là "1.2: TẤT CẢ ĐẠT (3 ca)" (psql còn in NOTICE "PASS …").
-- Hỏng: dừng ở ca đầu tiên sai với thông báo "FAIL …".
-- Cả file chạy trong một transaction và ROLLBACK ở cuối: không đổi dữ liệu.

BEGIN;

-- Dữ liệu riêng cho test (bị huỷ khi ROLLBACK): 1 RFQ của buyer A gửi xưởng
-- A và 1 báo giá đang chờ. ID lưu vào test.* để đọc lại sau khi đổi role.
DO $$
DECLARE
    v_buyer    UUID;
    v_supplier UUID;
    v_rfq      UUID;
    v_quote    UUID;
BEGIN
    SELECT bp.id INTO v_buyer FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT sp.id INTO v_supplier FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    IF v_buyer IS NULL OR v_supplier IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a hoặc xuong.a — chạy npm run seed:staging trước.';
    END IF;

    INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
    VALUES (v_buyer, 'RFQ test 1.2', 200, 'cái', 'single', 'published')
    RETURNING id INTO v_rfq;
    INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_supplier);
    INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, min_qty, lead_time_days, status)
    VALUES (v_rfq, v_supplier, 99000, 200, 20, 'pending')
    RETURNING id INTO v_quote;
    -- Từ 3.2 accept_quote bắt buộc có địa chỉ giao hàng.
    INSERT INTO buyer_addresses (buyer_id, recipient_name, phone, address_line, province)
    VALUES (v_buyer, 'Người nhận test', '0900000000', '1 Phố Test', 'Hà Nội');

    PERFORM set_config('test.buyer_a', v_buyer::TEXT, TRUE),
            set_config('test.xuong_a', v_supplier::TEXT, TRUE),
            set_config('test.quote', v_quote::TEXT, TRUE);
END $$;

-- Giả lập đăng nhập: auth.uid() đọc `sub` trong request.jwt.claims.
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

-- ── Buyer A tạo đơn thẳng với giá tự đặt → bị RLS từ chối ─────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
DO $$
BEGIN
    BEGIN
        INSERT INTO orders (rfq_quote_id, buyer_id, supplier_id, quantity, unit_price, status)
        VALUES (current_setting('test.quote')::UUID, current_setting('test.buyer_a')::UUID,
                current_setting('test.xuong_a')::UUID, 1000, 1, 'confirmed');
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'PASS  buyer tạo đơn thẳng bị từ chối (%)', SQLERRM;
        RETURN;
    END;
    RAISE EXCEPTION 'FAIL  buyer tạo đơn thẳng (giá 1đ, trạng thái confirmed) — không bị chặn';
END $$;

-- ── Buyer A chấp nhận báo giá → vẫn có đơn, giá lấy từ báo giá ────────
DO $$
DECLARE
    v_result JSONB;
    v_order  orders%ROWTYPE;
BEGIN
    v_result := public.accept_quote(current_setting('test.quote')::UUID);

    SELECT * INTO v_order FROM orders WHERE rfq_quote_id = current_setting('test.quote')::UUID;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL  accept_quote không tạo đơn (kết quả: %)', v_result;
    END IF;
    RAISE NOTICE 'PASS  chấp nhận báo giá vẫn tạo đơn';

    IF v_order.unit_price <> 99000 OR v_order.quantity <> 200
       OR v_order.status <> 'pending_payment' THEN
        RAISE EXCEPTION 'FAIL  đơn sai: giá %, số lượng %, trạng thái %',
            v_order.unit_price, v_order.quantity, v_order.status;
    END IF;
    RAISE NOTICE 'PASS  đơn lấy giá 99.000đ × 200 từ báo giá, chờ thanh toán';
END $$;

DO $$ BEGIN RAISE NOTICE '1.2: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

-- SQL Editor không hiện NOTICE: dòng này chỉ hiện khi mọi ca ở trên đều đạt.
SELECT '1.2: TẤT CẢ ĐẠT (3 ca)' AS ket_qua;
