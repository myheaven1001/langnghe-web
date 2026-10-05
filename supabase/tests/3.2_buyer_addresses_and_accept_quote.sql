-- Test kế hoạch 3.2: sổ địa chỉ (buyer_addresses) + accept_quote bắt buộc
-- có địa chỉ và chép vào orders.shipping_address.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "3.2: TẤT CẢ ĐẠT (18 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.
-- Chạy lại thêm 1.2, 1.5, 1.7 (đều gọi accept_quote) sau migration này.

BEGIN;

-- Dữ liệu riêng cho test: xoá sổ địa chỉ sẵn có của buyer A (hoàn lại khi
-- ROLLBACK), 3 RFQ của buyer A gửi xưởng A, mỗi RFQ 1 báo giá đang chờ;
-- buyer B (đang hoạt động trong test này) có 1 địa chỉ.
DO $$
DECLARE
    v_buyer_a UUID;
    v_buyer_b UUID;
    v_xa      UUID;
    v_rfq     UUID;
    v_quote   UUID;
    v_addr    UUID;
    i         INT;
BEGIN
    SELECT bp.id INTO v_buyer_a FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT bp.id INTO v_buyer_b FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.b@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    IF v_buyer_a IS NULL OR v_buyer_b IS NULL OR v_xa IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a / buyer.b / xuong.a — chạy npm run seed:staging trước.';
    END IF;

    DELETE FROM buyer_addresses WHERE buyer_id IN (v_buyer_a, v_buyer_b);
    UPDATE users SET status = 'active'
    WHERE id = (SELECT user_id FROM buyer_profiles WHERE id = v_buyer_b);

    FOR i IN 1..3 LOOP
        INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
        VALUES (v_buyer_a, 'RFQ test 3.2 #' || i, 100, 'cái', 'single', 'published')
        RETURNING id INTO v_rfq;
        INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);
        INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, min_qty, lead_time_days, status)
        VALUES (v_rfq, v_xa, 50000, 100, 10, 'pending')
        RETURNING id INTO v_quote;
        PERFORM set_config('test.quote' || i, v_quote::TEXT, TRUE);
    END LOOP;

    INSERT INTO buyer_addresses (buyer_id, recipient_name, phone, address_line, province)
    VALUES (v_buyer_b, 'Người nhận B', '0911111111', '9 Phố B', 'Hải Phòng')
    RETURNING id INTO v_addr;

    PERFORM set_config('test.buyer_a', v_buyer_a::TEXT, TRUE),
            set_config('test.buyer_b', v_buyer_b::TEXT, TRUE),
            set_config('test.addr_b', v_addr::TEXT, TRUE);
END $$;

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

-- ── Buyer A: chưa có địa chỉ ───────────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('chốt báo giá khi chưa có địa chỉ', 'ADDRESS_REQUIRED',
    $q$SELECT public.accept_quote(current_setting('test.quote1')::UUID)$q$);
SELECT pg_temp.expect_error('chốt báo giá bằng địa chỉ của buyer khác', 'ADDRESS_NOT_FOUND',
    $q$SELECT public.accept_quote(current_setting('test.quote1')::UUID,
                                  current_setting('test.addr_b')::UUID)$q$);
SELECT pg_temp.check('2 lần lỗi trên không tạo đơn, báo giá vẫn đang chờ',
    (SELECT status = 'pending' FROM rfq_quotes WHERE id = current_setting('test.quote1')::UUID)
    AND NOT EXISTS (SELECT 1 FROM orders WHERE rfq_quote_id = current_setting('test.quote1')::UUID),
    'báo giá/đơn đã bị đổi');

-- ── Buyer A: sổ địa chỉ ────────────────────────────────────────────────
SELECT pg_temp.expect_error('số điện thoại có chữ', 'CHECK',
    $q$INSERT INTO buyer_addresses (buyer_id, recipient_name, phone, address_line, province)
       VALUES (current_setting('test.buyer_a')::UUID, 'Nguyễn Văn A', 'abc', '12 Phố Gốm', 'Hà Nội')$q$);
SELECT pg_temp.expect_error('thêm địa chỉ vào sổ của buyer khác', 'DENIED',
    $q$INSERT INTO buyer_addresses (buyer_id, recipient_name, phone, address_line, province)
       VALUES (current_setting('test.buyer_b')::UUID, 'Nguyễn Văn A', '0912345678', '12 Phố Gốm', 'Hà Nội')$q$);

DO $$
DECLARE
    v_a1 UUID;
    v_a2 UUID;
BEGIN
    INSERT INTO buyer_addresses (buyer_id, label, recipient_name, phone, address_line, ward, province)
    VALUES (current_setting('test.buyer_a')::UUID, 'Kho 1', 'Nguyễn Văn A', '0912 345 678',
            '12 Phố Gốm', 'Phường Bát Tràng', 'Hà Nội')
    RETURNING id INTO v_a1;
    INSERT INTO buyer_addresses (buyer_id, label, recipient_name, phone, address_line, province)
    VALUES (current_setting('test.buyer_a')::UUID, 'Kho 2', 'Trần Thị B', '0987654321',
            '34 Đường Lụa', 'Hà Nam')
    RETURNING id INTO v_a2;
    PERFORM set_config('test.a1', v_a1::TEXT, TRUE), set_config('test.a2', v_a2::TEXT, TRUE);
END $$;

SELECT pg_temp.check('địa chỉ đầu tiên tự thành mặc định, địa chỉ thứ hai thì không',
    (SELECT is_default FROM buyer_addresses WHERE id = current_setting('test.a1')::UUID)
    AND NOT (SELECT is_default FROM buyer_addresses WHERE id = current_setting('test.a2')::UUID),
    'cờ mặc định sai');
SELECT pg_temp.check('buyer A chỉ thấy địa chỉ của mình',
    (SELECT count(*) = 2 FROM buyer_addresses), (SELECT count(*)::TEXT FROM buyer_addresses));

UPDATE buyer_addresses SET is_default = FALSE WHERE id = current_setting('test.a1')::UUID;
SELECT pg_temp.check('không bỏ mặc định trực tiếp được',
    (SELECT is_default FROM buyer_addresses WHERE id = current_setting('test.a1')::UUID),
    'địa chỉ mặc định bị bỏ, sổ không còn mặc định');

UPDATE buyer_addresses SET is_default = TRUE WHERE id = current_setting('test.a2')::UUID;
SELECT pg_temp.check('đặt địa chỉ 2 làm mặc định → địa chỉ 1 tự bỏ mặc định',
    (SELECT count(*) = 1 AND bool_and(id = current_setting('test.a2')::UUID)
     FROM buyer_addresses WHERE is_default),
    'không đúng 1 mặc định');

-- ── Buyer A: chốt báo giá ──────────────────────────────────────────────
SELECT public.accept_quote(current_setting('test.quote1')::UUID);
SELECT pg_temp.check('chốt không chọn địa chỉ → dùng mặc định (địa chỉ 2)',
    (SELECT shipping_address = E'Trần Thị B — 0987654321\n34 Đường Lụa, Hà Nam'
     FROM orders WHERE rfq_quote_id = current_setting('test.quote1')::UUID),
    (SELECT shipping_address FROM orders WHERE rfq_quote_id = current_setting('test.quote1')::UUID));
SELECT public.accept_quote(current_setting('test.quote2')::UUID, current_setting('test.a1')::UUID);
SELECT pg_temp.check('chốt có chọn địa chỉ 1 → chép đủ người nhận, SĐT, phường, tỉnh',
    (SELECT shipping_address = E'Nguyễn Văn A — 0912 345 678\n12 Phố Gốm, Phường Bát Tràng, Hà Nội'
     FROM orders WHERE rfq_quote_id = current_setting('test.quote2')::UUID),
    (SELECT shipping_address FROM orders WHERE rfq_quote_id = current_setting('test.quote2')::UUID));
SELECT pg_temp.check('đơn mới: chờ thanh toán, giá và số lượng lấy từ báo giá/RFQ',
    (SELECT status = 'pending_payment' AND unit_price = 50000 AND quantity = 100
     FROM orders WHERE rfq_quote_id = current_setting('test.quote2')::UUID),
    'đơn sai');
SELECT pg_temp.expect_error('chốt lại báo giá đã chốt', 'RFQ_ALREADY_SETTLED',
    $q$SELECT public.accept_quote(current_setting('test.quote1')::UUID)$q$);

UPDATE buyer_addresses SET address_line = '99 Đường Mới' WHERE id = current_setting('test.a2')::UUID;
SELECT pg_temp.check('sửa sổ địa chỉ sau đó không làm đổi đơn đã tạo',
    (SELECT shipping_address LIKE '%34 Đường Lụa%' FROM orders
     WHERE rfq_quote_id = current_setting('test.quote1')::UUID),
    'địa chỉ trên đơn bị đổi theo sổ');

DELETE FROM buyer_addresses WHERE id = current_setting('test.a2')::UUID;
SELECT pg_temp.check('xoá địa chỉ mặc định → địa chỉ còn lại thành mặc định',
    (SELECT is_default FROM buyer_addresses WHERE id = current_setting('test.a1')::UUID),
    'sổ không còn địa chỉ mặc định');

-- ── Người khác ─────────────────────────────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('xưởng không đọc được sổ địa chỉ, nhưng thấy địa chỉ trên đơn của mình',
    (SELECT count(*) = 0 FROM buyer_addresses)
    AND (SELECT shipping_address IS NOT NULL FROM orders
         WHERE rfq_quote_id = current_setting('test.quote2')::UUID),
    'xưởng thấy sổ địa chỉ hoặc không thấy địa chỉ trên đơn');

-- Buyer A bị khoá: không thêm được địa chỉ, chốt báo giá báo đúng lỗi.
RESET ROLE;
UPDATE users SET status = 'suspended'
WHERE id = (SELECT user_id FROM buyer_profiles WHERE id = current_setting('test.buyer_a')::UUID);
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('buyer bị khoá thêm địa chỉ', 'DENIED',
    $q$INSERT INTO buyer_addresses (buyer_id, recipient_name, phone, address_line, province)
       VALUES (current_setting('test.buyer_a')::UUID, 'Nguyễn Văn A', '0912345678', '12 Phố Gốm', 'Hà Nội')$q$);
SELECT pg_temp.expect_error('buyer bị khoá chốt báo giá', 'ACCOUNT_SUSPENDED',
    $q$SELECT public.accept_quote(current_setting('test.quote3')::UUID)$q$);

DO $$ BEGIN RAISE NOTICE '3.2: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '3.2: TẤT CẢ ĐẠT (18 ca)' AS ket_qua;
