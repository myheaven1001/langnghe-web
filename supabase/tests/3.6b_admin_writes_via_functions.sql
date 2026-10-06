-- Test kế hoạch 3.6 (phần thu hẹp, 20261005092200): admin không ghi thẳng
-- orders / users / verifications / disputes qua API; admin_cancel_order() và
-- admin_resolve_dispute() có nhật ký; buyer/xưởng và người dùng thường không
-- bị ảnh hưởng.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "3.6b: TẤT CẢ ĐẠT (22 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.
-- Chạy lại thêm 1.1, 1.3 và 3.6_3.7 (đã đổi sang gọi hàm admin_*).

BEGIN;

-- Dữ liệu riêng cho test: 3 đơn của buyer A với xưởng A (order1: chờ thanh
-- toán; order2: đã giao, có tranh chấp đang mở; order3: đã hoàn tất), 1 hồ
-- sơ xác minh đang chờ của xưởng B, buyer B ở trạng thái pending.
DO $$
DECLARE
    v_buyer   UUID;
    v_xa      UUID;
    v_xb      UUID;
    v_rfq     UUID;
    v_quote   UUID;
    v_order   UUID;
    v_ver     UUID;
    v_dispute UUID;
    i         INT;
BEGIN
    SELECT bp.id INTO v_buyer FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    SELECT sp.id INTO v_xb FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.b@langnghe.test';
    IF v_buyer IS NULL OR v_xa IS NULL OR v_xb IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a / xuong.a / xuong.b — chạy npm run seed:staging trước.';
    END IF;

    FOR i IN 1..3 LOOP
        INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
        VALUES (v_buyer, 'RFQ test 3.6b #' || i, 100, 'cái', 'single', 'awarded')
        RETURNING id INTO v_rfq;
        INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);
        INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, min_qty, lead_time_days, status)
        VALUES (v_rfq, v_xa, 50000, 100, 10, 'accepted')
        RETURNING id INTO v_quote;
        INSERT INTO orders (rfq_quote_id, buyer_id, supplier_id, quantity, unit_price)
        VALUES (v_quote, v_buyer, v_xa, 100, 50000)
        RETURNING id INTO v_order;
        PERFORM set_config('test.order' || i, v_order::TEXT, TRUE);
    END LOOP;

    UPDATE orders SET status = 'shipped', logistics_provider = 'GHTK', tracking_number = 'T1'
    WHERE id = current_setting('test.order2')::UUID;
    UPDATE orders SET status = 'completed' WHERE id = current_setting('test.order3')::UUID;

    INSERT INTO disputes (order_id, reason, reporter_role)
    VALUES (current_setting('test.order2')::UUID, 'Hàng sứt mẻ', 'buyer')
    RETURNING id INTO v_dispute;

    INSERT INTO verifications (entity_id, entity_type, tax_code, attempt_number)
    VALUES (v_xb, 'supplier', '0100000098',
            (SELECT COALESCE(max(attempt_number), 0) + 1 FROM verifications
             WHERE entity_type = 'supplier' AND entity_id = v_xb))
    RETURNING id INTO v_ver;

    UPDATE users SET status = 'active'
    WHERE id IN (SELECT user_id FROM supplier_profiles WHERE id = v_xb);
    UPDATE users SET status = 'pending'
    WHERE id = (SELECT u.id FROM auth.users u WHERE u.email = 'buyer.b@langnghe.test');
    DELETE FROM admin_audit_log;

    PERFORM set_config('test.ver', v_ver::TEXT, TRUE),
            set_config('test.dispute', v_dispute::TEXT, TRUE),
            set_config('test.xb_user', (SELECT user_id::TEXT FROM supplier_profiles WHERE id = v_xb), TRUE);
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

-- Câu lệnh phải lỗi p_code ('DENIED' = bị từ chối quyền 42501).
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

-- Câu lệnh chạy không lỗi nhưng phải đổi đúng p_rows dòng.
CREATE FUNCTION pg_temp.expect_rows(p_label TEXT, p_rows INT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_rows INT;
BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> p_rows THEN
        RAISE EXCEPTION 'FAIL  % — đổi % dòng, cần %', p_label, v_rows, p_rows;
    END IF;
    RAISE NOTICE 'PASS  %', p_label;
END $$;

-- ── Admin: đường ghi thẳng đã đóng ─────────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.expect_error('admin UPDATE thẳng đơn sang "đã thanh toán"', 'FORBIDDEN_ADMIN_DIRECT_WRITE',
    $q$UPDATE orders SET status = 'confirmed', payment_confirmed_by = auth.uid()
       WHERE id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_error('admin UPDATE thẳng huỷ đơn', 'FORBIDDEN_ADMIN_DIRECT_WRITE',
    $q$UPDATE orders SET status = 'cancelled', cancel_reason = 'x'
       WHERE id = current_setting('test.order1')::UUID$q$);
SELECT pg_temp.expect_error('admin UPDATE thẳng khoá tài khoản người khác', 'FORBIDDEN_ADMIN_DIRECT_WRITE',
    $q$UPDATE users SET status = 'suspended' WHERE id = current_setting('test.xb_user')::UUID$q$);
SELECT pg_temp.expect_error('admin UPDATE thẳng nâng người khác lên admin', 'FORBIDDEN_ADMIN_DIRECT_WRITE',
    $q$UPDATE users SET role = 'admin' WHERE id = current_setting('test.xb_user')::UUID$q$);
SELECT pg_temp.expect_rows('admin UPDATE thẳng duyệt hồ sơ → không đổi gì', 0,
    $q$UPDATE verifications SET status = 'approved' WHERE id = current_setting('test.ver')::UUID$q$);
SELECT pg_temp.expect_error('admin INSERT thẳng tranh chấp', 'DENIED',
    $q$INSERT INTO disputes (order_id, reason) VALUES (current_setting('test.order1')::UUID, 'x')$q$);
SELECT pg_temp.expect_rows('admin UPDATE thẳng giải quyết tranh chấp → không đổi gì', 0,
    $q$UPDATE disputes SET status = 'resolved', resolution = 'refund_buyer', resolved_by = auth.uid(),
          resolved_at = NOW() WHERE id = current_setting('test.dispute')::UUID$q$);
SELECT pg_temp.check('sau các lần thử trên: không có dòng nhật ký nào, dữ liệu giữ nguyên',
    (SELECT count(*) = 0 FROM admin_audit_log)
    AND (SELECT status = 'pending_payment' FROM orders WHERE id = current_setting('test.order1')::UUID)
    AND (SELECT status = 'active' AND role = 'supplier' FROM users
         WHERE id = current_setting('test.xb_user')::UUID)
    AND (SELECT status = 'pending' FROM verifications WHERE id = current_setting('test.ver')::UUID)
    AND (SELECT status = 'open' FROM disputes WHERE id = current_setting('test.dispute')::UUID),
    'dữ liệu đã bị đổi hoặc có nhật ký');

-- ── Admin: qua hàm thì được, có nhật ký ────────────────────────────────
SELECT public.admin_set_user_status(current_setting('test.xb_user')::UUID, 'suspended', 'Thử khoá');
SELECT public.admin_review_verification(current_setting('test.ver')::UUID, FALSE, 'Ảnh mờ');
SELECT pg_temp.check('khoá user và từ chối hồ sơ qua hàm vẫn chạy',
    (SELECT status = 'suspended' FROM users WHERE id = current_setting('test.xb_user')::UUID)
    AND (SELECT status = 'rejected' AND rejection_reason = 'Ảnh mờ' FROM verifications
         WHERE id = current_setting('test.ver')::UUID),
    'hàm admin_* không chạy');

SELECT pg_temp.expect_error('huỷ đơn không ghi lý do', 'ORDER_CANCEL_REASON_REQUIRED',
    $q$SELECT public.admin_cancel_order(current_setting('test.order1')::UUID, ' ')$q$);
SELECT pg_temp.expect_error('huỷ đơn đã hoàn tất', 'FORBIDDEN_ORDER_STATUS_CHANGE',
    $q$SELECT public.admin_cancel_order(current_setting('test.order3')::UUID, 'x')$q$);
SELECT public.admin_cancel_order(current_setting('test.order1')::UUID, 'Buyer không chuyển khoản');
SELECT pg_temp.check('huỷ đơn qua hàm → cancelled, có lý do, event và nhật ký order.cancel',
    (SELECT status = 'cancelled' AND cancel_reason = 'Buyer không chuyển khoản'
     FROM orders WHERE id = current_setting('test.order1')::UUID)
    AND (SELECT count(*) = 1 FROM order_events
         WHERE order_id = current_setting('test.order1')::UUID AND event_type = 'cancelled')
    AND (SELECT count(*) = 1 AND bool_and(details ->> 'old_status' = 'pending_payment')
         FROM admin_audit_log
         WHERE action = 'order.cancel' AND entity_id = current_setting('test.order1')),
    'huỷ đơn sai');

SELECT pg_temp.expect_error('quyết định tranh chấp không hợp lệ', 'INVALID_RESOLUTION',
    $q$SELECT public.admin_resolve_dispute(current_setting('test.dispute')::UUID, 'khac')$q$);
SELECT pg_temp.expect_error('chia tỷ lệ mà không có tỷ lệ', 'INVALID_RESOLUTION',
    $q$SELECT public.admin_resolve_dispute(current_setting('test.dispute')::UUID, 'partial')$q$);
SELECT public.admin_resolve_dispute(current_setting('test.dispute')::UUID, 'partial', 0.3, 'Hoàn 30%');
SELECT pg_temp.check('giải quyết tranh chấp qua hàm → resolved, đủ thông tin, có nhật ký',
    (SELECT status = 'resolved' AND resolution = 'partial' AND refund_ratio = 0.3
            AND resolution_note = 'Hoàn 30%' AND resolved_by = auth.uid() AND resolved_at IS NOT NULL
     FROM disputes WHERE id = current_setting('test.dispute')::UUID)
    AND (SELECT count(*) = 1 FROM admin_audit_log
         WHERE action = 'dispute.resolve' AND entity_id = current_setting('test.order2')),
    'giải quyết tranh chấp sai');
SELECT pg_temp.expect_error('giải quyết lại tranh chấp đã xong', 'DISPUTE_ALREADY_RESOLVED',
    $q$SELECT public.admin_resolve_dispute(current_setting('test.dispute')::UUID, 'refund_buyer')$q$);

-- ── Người không phải admin ─────────────────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng tự huỷ đơn qua hàm admin', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_cancel_order(current_setting('test.order2')::UUID, 'x')$q$);
SELECT pg_temp.expect_error('xưởng tự giải quyết tranh chấp', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_resolve_dispute(current_setting('test.dispute')::UUID, 'release_supplier')$q$);
SELECT pg_temp.expect_rows('xưởng vẫn sửa mã vận đơn đơn của mình', 1,
    $q$UPDATE orders SET tracking_number = 'T2' WHERE id = current_setting('test.order2')::UUID$q$);

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_rows('buyer vẫn xác nhận đã nhận hàng', 1,
    $q$UPDATE orders SET status = 'delivered' WHERE id = current_setting('test.order2')::UUID$q$);

SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT pg_temp.expect_rows('tài khoản mới vẫn tự chuyển pending → active (hoàn tất đăng ký)', 1,
    $q$UPDATE users SET status = 'active' WHERE id = auth.uid()$q$);
SELECT pg_temp.expect_error('người dùng tự nâng mình lên admin', 'FORBIDDEN_ROLE_CHANGE',
    $q$UPDATE users SET role = 'admin' WHERE id = auth.uid()$q$);

DO $$ BEGIN RAISE NOTICE '3.6b: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '3.6b: TẤT CẢ ĐẠT (22 ca)' AS ket_qua;
