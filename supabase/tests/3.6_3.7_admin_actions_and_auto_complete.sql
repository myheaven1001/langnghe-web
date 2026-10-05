-- Test kế hoạch 3.6 + 3.7: hàm admin_* có nhật ký (xác nhận tiền, khoá
-- user, duyệt hồ sơ, mở tranh chấp); thông báo khi đơn đổi trạng thái; cộng
-- total_orders; tự hoàn tất đơn.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "3.6+3.7: TẤT CẢ ĐẠT (26 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.

BEGIN;

-- Dữ liệu riêng cho test: 3 đơn của buyer A với xưởng A (order1: đi hết
-- luồng; order2: tự hoàn tất; order3: đã nhận hàng lâu nhưng đang tranh
-- chấp), 1 hồ sơ xác minh đang chờ của xưởng B.
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_xb    UUID;
    v_rfq   UUID;
    v_quote UUID;
    v_order UUID;
    v_ver   UUID;
    i       INT;
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
        VALUES (v_buyer, 'RFQ test 3.6 #' || i, 100, 'cái', 'single', 'awarded')
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

    -- order2, order3: đã nhận hàng 10 ngày trước; ngưỡng tự hoàn tất 7 ngày.
    -- Đơn 'delivered' sẵn có khác trên staging: coi như vừa nhận hôm nay để
    -- không lẫn vào kết quả.
    UPDATE orders SET delivered_at = NOW() WHERE status = 'delivered';
    UPDATE orders SET status = 'delivered', delivered_at = NOW() - INTERVAL '10 days'
    WHERE id IN (current_setting('test.order2')::UUID, current_setting('test.order3')::UUID);
    UPDATE platform_settings SET value = '7' WHERE key = 'order_auto_complete_days';

    INSERT INTO verifications (entity_id, entity_type, tax_code, attempt_number)
    VALUES (v_xb, 'supplier', '0100000099',
            (SELECT COALESCE(max(attempt_number), 0) + 1 FROM verifications
             WHERE entity_type = 'supplier' AND entity_id = v_xb))
    RETURNING id INTO v_ver;

    UPDATE users SET status = 'active'
    WHERE id IN (SELECT user_id FROM supplier_profiles WHERE id = v_xb);
    DELETE FROM notifications
    WHERE user_id IN (SELECT user_id FROM supplier_profiles WHERE id IN (v_xa, v_xb)
                      UNION SELECT user_id FROM buyer_profiles WHERE id = v_buyer);
    DELETE FROM admin_audit_log;

    PERFORM set_config('test.xa', v_xa::TEXT, TRUE),
            set_config('test.ver', v_ver::TEXT, TRUE),
            set_config('test.xb_user', (SELECT user_id::TEXT FROM supplier_profiles WHERE id = v_xb), TRUE),
            set_config('test.xa_user', (SELECT user_id::TEXT FROM supplier_profiles WHERE id = v_xa), TRUE),
            set_config('test.buyer_user', (SELECT user_id::TEXT FROM buyer_profiles WHERE id = v_buyer), TRUE),
            set_config('test.total_before', (SELECT total_orders::TEXT FROM supplier_profiles WHERE id = v_xa), TRUE);
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

-- Như pg_cron / SQL Editor: không có người đăng nhập.
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

-- ── Người không phải admin ─────────────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('buyer tự xác nhận tiền cho đơn của mình', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_confirm_payment(current_setting('test.order1')::UUID, 5000000)$q$);
SELECT pg_temp.expect_error('buyer khoá tài khoản người khác', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_set_user_status(current_setting('test.xb_user')::UUID, 'suspended', 'x')$q$);
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.expect_error('xưởng tự duyệt hồ sơ của mình', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_review_verification(current_setting('test.ver')::UUID, TRUE)$q$);

-- ── Admin: xác nhận thanh toán ─────────────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.expect_error('số tiền 0', 'INVALID_PAYMENT',
    $q$SELECT public.admin_confirm_payment(current_setting('test.order1')::UUID, 0)$q$);
SELECT pg_temp.expect_error('số tiền lệch tổng đơn mà không ghi chú', 'PAYMENT_AMOUNT_MISMATCH',
    $q$SELECT public.admin_confirm_payment(current_setting('test.order1')::UUID, 4900000)$q$);
SELECT pg_temp.expect_error('admin sửa thẳng paid_amount qua API', 'FORBIDDEN_ORDER_FIELD_CHANGE',
    $q$UPDATE orders SET paid_amount = 1 WHERE id = current_setting('test.order1')::UUID$q$);

SELECT public.admin_confirm_payment(current_setting('test.order1')::UUID, 5000000, NULL,
                                    'Chuyển khoản ngân hàng', 'FT123', NULL);
SELECT pg_temp.check('xác nhận đúng số tiền → confirmed, ghi paid_amount/paid_at/người xác nhận/ghi chú',
    (SELECT status = 'confirmed' AND paid_amount = 5000000 AND paid_at IS NOT NULL
            AND confirmed_at IS NOT NULL AND payment_confirmed_by = auth.uid()
            AND payment_note = 'Phương thức: Chuyển khoản ngân hàng · Mã GD: FT123'
     FROM orders WHERE id = current_setting('test.order1')::UUID),
    (SELECT status || ' / ' || COALESCE(payment_note, 'NULL') FROM orders
     WHERE id = current_setting('test.order1')::UUID));
SELECT pg_temp.check('có event payment_confirmed và 1 dòng nhật ký order.confirm_payment',
    (SELECT count(*) = 1 FROM order_events
     WHERE order_id = current_setting('test.order1')::UUID AND event_type = 'payment_confirmed')
    AND (SELECT count(*) = 1 AND bool_and(admin_id = auth.uid()
                                          AND (details ->> 'paid_amount')::NUMERIC = 5000000)
         FROM admin_audit_log
         WHERE action = 'order.confirm_payment' AND entity_id = current_setting('test.order1')),
    'thiếu event hoặc nhật ký');
SELECT pg_temp.expect_error('xác nhận lần hai', 'ORDER_NOT_PENDING_PAYMENT',
    $q$SELECT public.admin_confirm_payment(current_setting('test.order1')::UUID, 5000000)$q$);

-- ── Admin: khoá / mở khoá ──────────────────────────────────────────────
SELECT pg_temp.expect_error('khoá không ghi lý do', 'REASON_REQUIRED',
    $q$SELECT public.admin_set_user_status(current_setting('test.xb_user')::UUID, 'suspended', '  ')$q$);
SELECT pg_temp.expect_error('admin tự khoá mình', 'CANNOT_CHANGE_SELF',
    $q$SELECT public.admin_set_user_status(auth.uid(), 'suspended', 'thử')$q$);
SELECT public.admin_set_user_status(current_setting('test.xb_user')::UUID, 'suspended', 'Giả mạo giấy phép');
SELECT pg_temp.check('khoá xưởng B → suspended + nhật ký user.suspend có lý do',
    (SELECT status = 'suspended' FROM users WHERE id = current_setting('test.xb_user')::UUID)
    AND (SELECT count(*) = 1 AND bool_and(details ->> 'reason' = 'Giả mạo giấy phép')
         FROM admin_audit_log
         WHERE action = 'user.suspend' AND entity_id = current_setting('test.xb_user')),
    'không khoá được hoặc thiếu nhật ký');
SELECT public.admin_set_user_status(current_setting('test.xb_user')::UUID, 'active');
SELECT pg_temp.check('mở khoá → active + nhật ký user.reactivate',
    (SELECT status = 'active' FROM users WHERE id = current_setting('test.xb_user')::UUID)
    AND (SELECT count(*) = 1 FROM admin_audit_log
         WHERE action = 'user.reactivate' AND entity_id = current_setting('test.xb_user')),
    'không mở khoá được hoặc thiếu nhật ký');

-- ── Admin: duyệt hồ sơ ─────────────────────────────────────────────────
SELECT pg_temp.expect_error('từ chối hồ sơ không ghi lý do', 'REASON_REQUIRED',
    $q$SELECT public.admin_review_verification(current_setting('test.ver')::UUID, FALSE)$q$);
SELECT public.admin_review_verification(current_setting('test.ver')::UUID, TRUE);
SELECT pg_temp.check('duyệt hồ sơ → approved, ghi người duyệt + nhật ký verification.approve',
    (SELECT status = 'approved' AND verified_by = auth.uid() AND verified_at IS NOT NULL
     FROM verifications WHERE id = current_setting('test.ver')::UUID)
    AND (SELECT count(*) = 1 FROM admin_audit_log
         WHERE action = 'verification.approve' AND entity_id = current_setting('test.ver')),
    'không duyệt được hoặc thiếu nhật ký');
SELECT pg_temp.expect_error('duyệt lại hồ sơ đã xử lý', 'VERIFICATION_NOT_PENDING',
    $q$SELECT public.admin_review_verification(current_setting('test.ver')::UUID, FALSE, 'đổi ý')$q$);

-- ── Admin: tranh chấp (sửa lỗi raised_by) ──────────────────────────────
SELECT public.admin_open_dispute(current_setting('test.order3')::UUID, 'Xưởng báo buyer không nhận hàng', 'supplier');
SELECT pg_temp.check('tranh chấp do xưởng báo: raised_by là xưởng, created_by là admin',
    (SELECT raised_by = current_setting('test.xa_user')::UUID AND reporter_role = 'supplier'
            AND created_by = auth.uid()
     FROM disputes WHERE order_id = current_setting('test.order3')::UUID),
    'raised_by/reporter_role/created_by sai');
SELECT pg_temp.expect_error('mở tranh chấp thứ hai cho cùng đơn', 'DISPUTE_ALREADY_OPEN',
    $q$SELECT public.admin_open_dispute(current_setting('test.order3')::UUID, 'lần 2', 'buyer')$q$);

-- ── Thông báo + luồng xưởng/buyer (3.7) ────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('xưởng nhận thông báo order_confirmed có order_id',
    (SELECT count(*) = 1 FROM notifications
     WHERE user_id = auth.uid() AND type = 'order_confirmed'
       AND payload ->> 'order_id' = current_setting('test.order1')),
    'thiếu thông báo');
UPDATE orders SET status = 'producing' WHERE id = current_setting('test.order1')::UUID;
UPDATE orders SET status = 'shipped', logistics_provider = 'GHTK', tracking_number = 'GH123'
WHERE id = current_setting('test.order1')::UUID;

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('buyer nhận thông báo order_confirmed và order_shipped (có mã vận đơn)',
    (SELECT count(*) = 1 FROM notifications
     WHERE user_id = auth.uid() AND type = 'order_confirmed'
       AND payload ->> 'order_id' = current_setting('test.order1'))
    AND (SELECT count(*) = 1 AND bool_and(body LIKE '%GH123%') FROM notifications
         WHERE user_id = auth.uid() AND type = 'order_shipped'),
    'thiếu thông báo');
UPDATE orders SET status = 'delivered' WHERE id = current_setting('test.order1')::UUID;
UPDATE orders SET status = 'completed' WHERE id = current_setting('test.order1')::UUID;

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('xưởng nhận thông báo order_delivered',
    (SELECT count(*) = 1 FROM notifications WHERE user_id = auth.uid() AND type = 'order_delivered'),
    'thiếu thông báo');
SELECT pg_temp.check('đơn hoàn tất → total_orders của xưởng tăng 1',
    (SELECT total_orders = current_setting('test.total_before')::INT + 1
     FROM supplier_profiles WHERE id = current_setting('test.xa')::UUID),
    (SELECT total_orders::TEXT FROM supplier_profiles WHERE id = current_setting('test.xa')::UUID));
SELECT pg_temp.expect_error('xưởng tự gọi hàm tự hoàn tất', 'DENIED',
    $q$SELECT public.auto_complete_delivered_orders()$q$);

-- ── Tự hoàn tất (như pg_cron) ──────────────────────────────────────────
SELECT pg_temp.as_system();
SELECT set_config('test.auto_count', public.auto_complete_delivered_orders()::TEXT, TRUE);
SELECT pg_temp.check('tự hoàn tất: đúng 1 đơn (order2) — bỏ qua đơn đang tranh chấp',
    current_setting('test.auto_count') = '1'
    AND (SELECT status = 'completed' AND completed_at IS NOT NULL FROM orders
         WHERE id = current_setting('test.order2')::UUID)
    AND (SELECT status = 'delivered' FROM orders WHERE id = current_setting('test.order3')::UUID),
    'tự hoàn tất ' || current_setting('test.auto_count') || ' đơn');
SELECT pg_temp.check('event completed ghi rõ hệ thống tự làm, total_orders tăng thêm 1',
    (SELECT count(*) = 1 AND bool_and(actor_id IS NULL AND (metadata ->> 'auto')::BOOLEAN
                                      AND note LIKE 'Hệ thống tự hoàn tất sau%')
     FROM order_events
     WHERE order_id = current_setting('test.order2')::UUID AND event_type = 'completed')
    AND (SELECT total_orders = current_setting('test.total_before')::INT + 2
         FROM supplier_profiles WHERE id = current_setting('test.xa')::UUID),
    'event hoặc total_orders sai');
SELECT pg_temp.check('chạy lại không hoàn tất thêm đơn nào',
    public.auto_complete_delivered_orders() = 0, 'vẫn còn đơn bị hoàn tất');

DO $$ BEGIN RAISE NOTICE '3.6+3.7: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '3.6+3.7: TẤT CẢ ĐẠT (26 ca)' AS ket_qua;
