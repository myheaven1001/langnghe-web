-- Test kế hoạch 5.8: open_dispute(), dispute_messages / add_dispute_message(),
-- refunds, admin_resolve_dispute() có tác động, admin_mark_refund_paid(),
-- chặn chuyển trạng thái đơn đang tranh chấp.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "5.8: TẤT CẢ ĐẠT (31 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.
-- Chạy lại thêm 3.6_3.7, 3.6b (tranh chấp phía admin) và 1.3 (trigger đơn).

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

-- Dữ liệu riêng cho test: 4 đơn 100 × 50.000 = 5.000.000 của buyer A với xưởng A
--   order1 chờ thanh toán · order2 đang giao (sàn đã thu 5.000.000)
--   order3 đã giao (không ghi số đã thu) · order4 đang sản xuất
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_rfq   UUID;
    v_quote UUID;
    v_order UUID;
    i       INT;
BEGIN
    SELECT bp.id INTO v_buyer FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    IF v_buyer IS NULL OR v_xa IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a / xuong.a — chạy npm run seed:staging trước.';
    END IF;
    UPDATE users SET status = 'active'
    WHERE id IN (SELECT user_id FROM supplier_profiles WHERE id = v_xa)
       OR id IN (SELECT u.id FROM auth.users u
                 WHERE u.email IN ('buyer.b@langnghe.test', 'xuong.b@langnghe.test'));

    FOR i IN 1..4 LOOP
        INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
        VALUES (v_buyer, 'RFQ test 5.8 #' || i, 100, 'cái', 'single', 'awarded')
        RETURNING id INTO v_rfq;
        INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);
        INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, min_qty, lead_time_days, status)
        VALUES (v_rfq, v_xa, 50000, 100, 10, 'accepted')
        RETURNING id INTO v_quote;
        INSERT INTO orders (rfq_quote_id, buyer_id, supplier_id)
        VALUES (v_quote, v_buyer, v_xa)
        RETURNING id INTO v_order;
        PERFORM set_config('test.order' || i, v_order::TEXT, TRUE);
    END LOOP;

    UPDATE orders SET status = 'shipped', logistics_provider = 'GHTK', tracking_number = 'T58',
                      paid_amount = 5000000, paid_at = NOW()
    WHERE id = current_setting('test.order2')::UUID;
    UPDATE orders SET status = 'delivered' WHERE id = current_setting('test.order3')::UUID;
    UPDATE orders SET status = 'producing' WHERE id = current_setting('test.order4')::UUID;
END $$;

-- ── Mở tranh chấp ──────────────────────────────────────────────────────
SELECT pg_temp.as_anon();
SELECT pg_temp.expect_error('khách chưa đăng nhập mở tranh chấp', 'DENIED',
    $q$SELECT public.open_dispute(current_setting('test.order2')::UUID, 'Hàng sứt mẻ khi nhận')$q$);
SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT pg_temp.expect_error('buyer khác mở tranh chấp trên đơn không phải của mình', 'ORDER_NOT_FOUND',
    $q$SELECT public.open_dispute(current_setting('test.order2')::UUID, 'Hàng sứt mẻ khi nhận')$q$);

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('đơn chưa thanh toán', 'ORDER_NOT_DISPUTABLE',
    $q$SELECT public.open_dispute(current_setting('test.order1')::UUID, 'Hàng sứt mẻ khi nhận')$q$);
SELECT pg_temp.expect_error('lý do quá ngắn', 'REASON_REQUIRED',
    $q$SELECT public.open_dispute(current_setting('test.order2')::UUID, 'lỗi')$q$);
SELECT set_config('test.d2',
    public.open_dispute(current_setting('test.order2')::UUID, '  Hàng sứt mẻ 20 cái khi nhận ')::TEXT, TRUE);
SELECT pg_temp.check('buyer mở tranh chấp → open, ghi đúng bên báo',
    (SELECT status = 'open' AND reporter_role = 'buyer' AND raised_by = auth.uid()
            AND reason = 'Hàng sứt mẻ 20 cái khi nhận'
     FROM disputes WHERE id = current_setting('test.d2')::UUID),
    'tranh chấp sai');

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('xưởng thấy tranh chấp và nhận thông báo',
    (SELECT count(*) = 1 FROM disputes WHERE id = current_setting('test.d2')::UUID)
    AND (SELECT count(*) = 1 FROM notifications
         WHERE user_id = auth.uid() AND type = 'dispute_opened'
           AND payload ->> 'dispute_id' = current_setting('test.d2')),
    'thiếu thông báo dispute_opened');
SELECT pg_temp.expect_error('mở tranh chấp thứ hai trên cùng đơn', 'DISPUTE_ALREADY_OPEN',
    $q$SELECT public.open_dispute(current_setting('test.order2')::UUID, 'Buyer không nghe máy khi giao')$q$);
SELECT set_config('test.d3',
    public.open_dispute(current_setting('test.order3')::UUID, 'Buyer báo thiếu hàng nhưng đã ký nhận đủ')::TEXT, TRUE);
SELECT pg_temp.check('xưởng mở tranh chấp → ghi bên báo là xưởng',
    (SELECT reporter_role = 'supplier' FROM disputes WHERE id = current_setting('test.d3')::UUID),
    'bên báo sai');

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('đơn đang tranh chấp: buyer bấm hoàn tất', 'ORDER_IN_DISPUTE',
    $q$UPDATE orders SET status = 'completed' WHERE id = current_setting('test.order3')::UUID$q$);

-- ── Trao đổi ───────────────────────────────────────────────────────────
SELECT pg_temp.expect_error('tin trống', 'INVALID_MESSAGE',
    $q$SELECT public.add_dispute_message(current_setting('test.d2')::UUID, '   ')$q$);
SELECT pg_temp.expect_error('đính kèm file chưa tải lên', 'INVALID_ATTACHMENT',
    $q$SELECT public.add_dispute_message(current_setting('test.d2')::UUID, 'Ảnh hàng lỗi',
           current_setting('test.d2') || '/khong-co.jpg', 'khong-co.jpg')$q$);
SELECT pg_temp.expect_error('đính kèm file ở thư mục tranh chấp khác', 'INVALID_ATTACHMENT',
    $q$SELECT public.add_dispute_message(current_setting('test.d2')::UUID, 'Ảnh hàng lỗi',
           current_setting('test.d3') || '/anh.jpg', 'anh.jpg')$q$);
SELECT pg_temp.expect_error('client tự ghi vào dispute_messages', 'DENIED',
    $q$INSERT INTO dispute_messages (dispute_id, sender_role, body)
       VALUES (current_setting('test.d2')::UUID, 'admin', 'giả danh sàn')$q$);
SELECT public.add_dispute_message(current_setting('test.d2')::UUID, '  Tôi gửi ảnh qua Zalo cho sàn rồi ');

SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.expect_error('xưởng ngoài cuộc gửi tin', 'DISPUTE_NOT_FOUND',
    $q$SELECT public.add_dispute_message(current_setting('test.d2')::UUID, 'chen vào')$q$);
SELECT pg_temp.check('xưởng ngoài cuộc không đọc được tin và khoản hoàn',
    (SELECT count(*) = 0 FROM dispute_messages WHERE dispute_id = current_setting('test.d2')::UUID)
    AND (SELECT count(*) = 0 FROM disputes WHERE id = current_setting('test.d2')::UUID),
    'lộ dữ liệu tranh chấp');

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('xưởng đọc được tin của buyer và nhận thông báo dispute_reply',
    (SELECT count(*) = 1 AND bool_and(sender_role = 'buyer' AND body = 'Tôi gửi ảnh qua Zalo cho sàn rồi')
     FROM dispute_messages WHERE dispute_id = current_setting('test.d2')::UUID)
    AND (SELECT count(*) = 1 FROM notifications
         WHERE user_id = auth.uid() AND type = 'dispute_reply'
           AND payload ->> 'dispute_id' = current_setting('test.d2')),
    'thiếu tin hoặc thông báo');
SELECT public.add_dispute_message(current_setting('test.d2')::UUID, 'Xưởng đóng gói đủ, có video');
SELECT pg_temp.check('buyer / xưởng trả lời: tranh chấp vẫn open',
    (SELECT status = 'open' FROM disputes WHERE id = current_setting('test.d2')::UUID),
    'trạng thái đổi sai');

SELECT pg_temp.login('admin@langnghe.test');
SELECT public.add_dispute_message(current_setting('test.d2')::UUID, 'Sàn đã nhận ảnh, đang đối chiếu');
SELECT pg_temp.check('admin trả lời lần đầu → investigating',
    (SELECT status = 'investigating' FROM disputes WHERE id = current_setting('test.d2')::UUID),
    (SELECT status::TEXT FROM disputes WHERE id = current_setting('test.d2')::UUID));

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('buyer nhận 2 thông báo trả lời (xưởng, sàn), không nhận tin của chính mình',
    (SELECT count(*) = 2 FROM notifications
     WHERE user_id = auth.uid() AND type = 'dispute_reply'
       AND payload ->> 'dispute_id' = current_setting('test.d2')),
    (SELECT count(*)::TEXT FROM notifications
     WHERE user_id = auth.uid() AND type = 'dispute_reply'
       AND payload ->> 'dispute_id' = current_setting('test.d2')));

-- ── Giải quyết: chia tỷ lệ ─────────────────────────────────────────────
SELECT pg_temp.expect_error('buyer tự đánh dấu đã hoàn tiền', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_mark_refund_paid(gen_random_uuid(), 'FT123')$q$);
SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.expect_error('chia tỷ lệ 100%', 'INVALID_RESOLUTION',
    $q$SELECT public.admin_resolve_dispute(current_setting('test.d2')::UUID, 'partial', 1)$q$);
SELECT public.admin_resolve_dispute(current_setting('test.d2')::UUID, 'partial', 0.4, 'Hoàn 40% vì 20 cái sứt');
SELECT set_config('test.refund2', (SELECT id::TEXT FROM refunds
    WHERE dispute_id = current_setting('test.d2')::UUID), TRUE);
SELECT pg_temp.check('chia 40% → khoản hoàn 2.000.000 chờ chuyển, đơn vẫn đang giao',
    (SELECT count(*) = 1 AND bool_and(amount = 2000000 AND status = 'pending') FROM refunds
     WHERE dispute_id = current_setting('test.d2')::UUID)
    AND (SELECT status = 'shipped' FROM orders WHERE id = current_setting('test.order2')::UUID),
    (SELECT COALESCE(max(amount)::TEXT, 'không có khoản hoàn') FROM refunds
     WHERE dispute_id = current_setting('test.d2')::UUID));
SELECT pg_temp.expect_error('gửi tin sau khi đã giải quyết', 'DISPUTE_ALREADY_RESOLVED',
    $q$SELECT public.add_dispute_message(current_setting('test.d2')::UUID, 'bổ sung')$q$);
SELECT pg_temp.expect_error('đánh dấu đã hoàn mà không có mã giao dịch', 'REASON_REQUIRED',
    $q$SELECT public.admin_mark_refund_paid(current_setting('test.refund2')::UUID, ' ')$q$);
SELECT public.admin_mark_refund_paid(current_setting('test.refund2')::UUID, 'FT26101234567');
SELECT pg_temp.check('đánh dấu đã hoàn → paid, có mã giao dịch và nhật ký',
    (SELECT status = 'paid' AND bank_ref = 'FT26101234567' AND paid_by = auth.uid() AND paid_at IS NOT NULL
     FROM refunds WHERE id = current_setting('test.refund2')::UUID)
    AND (SELECT count(*) = 1 FROM admin_audit_log
         WHERE action = 'refund.paid' AND entity_id = current_setting('test.order2')),
    'khoản hoàn sai');
SELECT pg_temp.expect_error('đánh dấu lại khoản đã hoàn', 'REFUND_ALREADY_PAID',
    $q$SELECT public.admin_mark_refund_paid(current_setting('test.refund2')::UUID, 'FT2')$q$);

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('buyer thấy khoản hoàn của mình và nhận thông báo đã chuyển',
    (SELECT count(*) = 1 FROM refunds WHERE id = current_setting('test.refund2')::UUID)
    AND (SELECT count(*) = 1 FROM notifications
         WHERE user_id = auth.uid() AND payload ->> 'refund_id' = current_setting('test.refund2')),
    'buyer không thấy khoản hoàn');
UPDATE orders SET status = 'delivered' WHERE id = current_setting('test.order2')::UUID;
SELECT pg_temp.check('tranh chấp đã xong → buyer lại chuyển bước đơn được',
    (SELECT status = 'delivered' FROM orders WHERE id = current_setting('test.order2')::UUID),
    'đơn vẫn bị khoá');
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.check('xưởng ngoài cuộc không thấy khoản hoàn',
    (SELECT count(*) = 0 FROM refunds WHERE id = current_setting('test.refund2')::UUID),
    'lộ khoản hoàn');

-- ── Giải quyết: hoàn toàn bộ / xưởng thắng ─────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT set_config('test.d4',
    public.open_dispute(current_setting('test.order4')::UUID, 'Buyer đòi đổi mẫu sau khi đã chốt')::TEXT, TRUE);
SELECT pg_temp.login('admin@langnghe.test');
SELECT public.admin_resolve_dispute(current_setting('test.d3')::UUID, 'refund_buyer', NULL, 'Thiếu hàng thật');
SELECT pg_temp.check('hoàn toàn bộ → đơn huỷ, khoản hoàn = tổng đơn 5.000.000',
    (SELECT status = 'cancelled' AND cancel_reason LIKE 'Tranh chấp: hoàn tiền cho buyer%'
     FROM orders WHERE id = current_setting('test.order3')::UUID)
    AND (SELECT count(*) = 1 AND bool_and(amount = 5000000 AND status = 'pending') FROM refunds
         WHERE dispute_id = current_setting('test.d3')::UUID),
    (SELECT status::TEXT FROM orders WHERE id = current_setting('test.order3')::UUID));
SELECT public.admin_resolve_dispute(current_setting('test.d4')::UUID, 'release_supplier');
SELECT pg_temp.check('xưởng thắng → không có khoản hoàn, đơn giữ nguyên',
    (SELECT count(*) = 0 FROM refunds WHERE dispute_id = current_setting('test.d4')::UUID)
    AND (SELECT status = 'producing' FROM orders WHERE id = current_setting('test.order4')::UUID),
    'xưởng thắng mà vẫn hoàn tiền');

DO $$ BEGIN RAISE NOTICE '5.8: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '5.8: TẤT CẢ ĐẠT (31 ca)' AS ket_qua;
