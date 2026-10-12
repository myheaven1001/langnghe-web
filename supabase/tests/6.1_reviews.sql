-- Test bước 6 (Uy tín): reviews, submit_review(), reply_review(),
-- admin_moderate_review(), supplier_reviews(), supplier_review_summary(),
-- rating_avg / rating_count, chặn xưởng tự sửa điểm.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "6.1: TẤT CẢ ĐẠT (25 ca)". Hỏng: "FAIL …".
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

-- Dữ liệu riêng cho test: 3 đơn của buyer A với xưởng A
--   order1, order2 đã hoàn tất · order3 đang giao
--   xưởng A công khai, xoá sẵn đánh giá cũ của xưởng A (ROLLBACK trả lại)
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
                 WHERE u.email IN ('buyer.a@langnghe.test', 'buyer.b@langnghe.test', 'xuong.b@langnghe.test'));
    UPDATE supplier_profiles SET is_hidden = FALSE WHERE id = v_xa;
    DELETE FROM reviews WHERE supplier_id = v_xa;

    FOR i IN 1..3 LOOP
        INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
        VALUES (v_buyer, 'RFQ test 6.1 #' || i, 100, 'cái', 'single', 'awarded')
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
    UPDATE orders SET status = 'completed'
    WHERE id IN (current_setting('test.order1')::UUID, current_setting('test.order2')::UUID);
    UPDATE orders SET status = 'shipped', logistics_provider = 'GHTK', tracking_number = 'T61'
    WHERE id = current_setting('test.order3')::UUID;

    PERFORM set_config('test.xa', v_xa::TEXT, TRUE);
END $$;

-- ── Gửi đánh giá ───────────────────────────────────────────────────────
SELECT pg_temp.as_anon();
SELECT pg_temp.expect_error('khách chưa đăng nhập gửi đánh giá', 'DENIED',
    $q$SELECT public.submit_review(current_setting('test.order1')::UUID, 5)$q$);
SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT pg_temp.expect_error('buyer khác đánh giá đơn không phải của mình', 'ORDER_NOT_FOUND',
    $q$SELECT public.submit_review(current_setting('test.order1')::UUID, 1, 'chê')$q$);
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng tự đánh giá đơn của mình', 'ORDER_NOT_FOUND',
    $q$SELECT public.submit_review(current_setting('test.order1')::UUID, 5, 'tuyệt')$q$);

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('đơn chưa hoàn tất', 'ORDER_NOT_COMPLETED',
    $q$SELECT public.submit_review(current_setting('test.order3')::UUID, 5)$q$);
SELECT pg_temp.expect_error('6 sao', 'INVALID_RATING',
    $q$SELECT public.submit_review(current_setting('test.order1')::UUID, 6)$q$);
SELECT pg_temp.expect_error('client tự ghi vào bảng reviews', 'DENIED',
    $q$INSERT INTO reviews (order_id, buyer_id, supplier_id, rating)
       SELECT id, buyer_id, supplier_id, 5 FROM orders WHERE id = current_setting('test.order1')::UUID$q$);
SELECT set_config('test.r1',
    public.submit_review(current_setting('test.order1')::UUID, 5, '  Hàng đẹp, giao đúng hẹn ')::TEXT, TRUE);
SELECT pg_temp.expect_error('đánh giá lần hai cho cùng đơn', 'REVIEW_EXISTS',
    $q$SELECT public.submit_review(current_setting('test.order1')::UUID, 1)$q$);
SELECT set_config('test.r2',
    public.submit_review(current_setting('test.order2')::UUID, 2, 'Sứt mẻ vài cái')::TEXT, TRUE);
SELECT pg_temp.check('2 đánh giá (5★, 2★) → buyer đọc được, nhận xét đã cắt khoảng trắng',
    (SELECT count(*) = 2 FROM reviews WHERE id IN (current_setting('test.r1')::UUID, current_setting('test.r2')::UUID))
    AND (SELECT comment = 'Hàng đẹp, giao đúng hẹn' FROM reviews WHERE id = current_setting('test.r1')::UUID),
    'đánh giá sai');

-- ── Điểm của xưởng + phần công khai ────────────────────────────────────
SELECT pg_temp.as_anon();
SELECT pg_temp.check('khách thấy tổng hợp: 2 đánh giá, trung bình 3.5',
    (SELECT (s ->> 'count')::INT = 2 AND (s ->> 'average')::NUMERIC = 3.5
            AND (s -> 'stars' ->> '5')::INT = 1 AND (s -> 'stars' ->> '2')::INT = 1
     FROM public.supplier_review_summary(current_setting('test.xa')::UUID) s),
    public.supplier_review_summary(current_setting('test.xa')::UUID)::TEXT);
SELECT pg_temp.check('khách đọc được 2 đánh giá, tên buyer đã che',
    (SELECT count(*) = 2 AND bool_and(buyer_name LIKE '%*%') FROM public.supplier_reviews(current_setting('test.xa')::UUID)),
    (SELECT string_agg(buyer_name, ' | ') FROM public.supplier_reviews(current_setting('test.xa')::UUID)));
SELECT pg_temp.expect_error('khách đọc thẳng bảng reviews', 'DENIED', $q$SELECT count(*) FROM reviews$q$);

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('hồ sơ xưởng: rating_avg 3.50, rating_count 2; xưởng nhận 2 thông báo',
    (SELECT rating_avg = 3.50 AND rating_count = 2 FROM supplier_profiles WHERE id = current_setting('test.xa')::UUID)
    AND (SELECT count(*) = 2 FROM notifications
         WHERE user_id = auth.uid() AND type = 'review_received'
           AND payload ->> 'review_id' IN (current_setting('test.r1'), current_setting('test.r2'))),
    (SELECT rating_avg::TEXT || ' / ' || rating_count FROM supplier_profiles WHERE id = current_setting('test.xa')::UUID));
SELECT pg_temp.expect_error('xưởng tự sửa điểm của mình', 'FORBIDDEN_SYSTEM_COLUMN_CHANGE',
    $q$UPDATE supplier_profiles SET rating_avg = 5 WHERE id = current_setting('test.xa')::UUID$q$);
SELECT pg_temp.expect_error('xưởng tự sửa số đơn đã bán', 'FORBIDDEN_SYSTEM_COLUMN_CHANGE',
    $q$UPDATE supplier_profiles SET total_orders = 999 WHERE id = current_setting('test.xa')::UUID$q$);
UPDATE supplier_profiles SET working_hours = working_hours WHERE id = current_setting('test.xa')::UUID;
SELECT pg_temp.check('xưởng vẫn sửa được các cột thường của hồ sơ', TRUE, '');

-- ── Xưởng trả lời ──────────────────────────────────────────────────────
SELECT pg_temp.expect_error('trả lời trống', 'INVALID_COMMENT',
    $q$SELECT public.reply_review(current_setting('test.r2')::UUID, '  ')$q$);
SELECT public.reply_review(current_setting('test.r2')::UUID, 'Xưởng xin lỗi, đã gửi bù 5 cái.');
SELECT public.reply_review(current_setting('test.r2')::UUID, 'Xưởng xin lỗi, đã gửi bù 10 cái.');
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.expect_error('xưởng khác trả lời đánh giá không phải của mình', 'REVIEW_NOT_FOUND',
    $q$SELECT public.reply_review(current_setting('test.r2')::UUID, 'chen vào')$q$);
SELECT pg_temp.check('xưởng khác không đọc được đánh giá qua bảng',
    (SELECT count(*) = 0 FROM reviews WHERE supplier_id = current_setting('test.xa')::UUID),
    'lộ đánh giá');
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('buyer thấy câu trả lời mới nhất, chỉ nhận 1 thông báo dù xưởng sửa lại',
    (SELECT supplier_reply = 'Xưởng xin lỗi, đã gửi bù 10 cái.' AND replied_at IS NOT NULL
     FROM reviews WHERE id = current_setting('test.r2')::UUID)
    AND (SELECT count(*) = 1 FROM notifications
         WHERE user_id = auth.uid() AND type = 'review_replied'
           AND payload ->> 'review_id' = current_setting('test.r2')),
    'trả lời hoặc thông báo sai');

-- ── Admin ẩn / hiện ────────────────────────────────────────────────────
SELECT pg_temp.expect_error('buyer tự ẩn đánh giá', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_moderate_review(current_setting('test.r2')::UUID, TRUE, 'x')$q$);
SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.expect_error('ẩn mà không ghi lý do', 'REASON_REQUIRED',
    $q$SELECT public.admin_moderate_review(current_setting('test.r2')::UUID, TRUE)$q$);
SELECT public.admin_moderate_review(current_setting('test.r2')::UUID, TRUE, 'Lời lẽ xúc phạm');
SELECT pg_temp.check('ẩn đánh giá 2★ → điểm xưởng còn 5.00 / 1, có nhật ký',
    (SELECT rating_avg = 5.00 AND rating_count = 1 FROM supplier_profiles WHERE id = current_setting('test.xa')::UUID)
    AND (SELECT hidden_at IS NOT NULL AND hidden_by = auth.uid() FROM reviews WHERE id = current_setting('test.r2')::UUID)
    AND (SELECT count(*) = 1 FROM admin_audit_log
         WHERE action = 'review.hide' AND entity_id = current_setting('test.r2')),
    (SELECT rating_avg::TEXT || ' / ' || rating_count FROM supplier_profiles WHERE id = current_setting('test.xa')::UUID));
SELECT pg_temp.as_anon();
SELECT pg_temp.check('khách chỉ còn thấy 1 đánh giá',
    (SELECT count(*) = 1 FROM public.supplier_reviews(current_setting('test.xa')::UUID))
    AND (SELECT (s ->> 'count')::INT = 1 FROM public.supplier_review_summary(current_setting('test.xa')::UUID) s),
    'đánh giá bị ẩn vẫn hiện');
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng trả lời đánh giá đang bị ẩn', 'REVIEW_HIDDEN',
    $q$SELECT public.reply_review(current_setting('test.r2')::UUID, 'bổ sung')$q$);
SELECT pg_temp.login('admin@langnghe.test');
SELECT public.admin_moderate_review(current_setting('test.r2')::UUID, FALSE);
SELECT pg_temp.check('hiện lại → điểm về 3.50 / 2',
    (SELECT rating_avg = 3.50 AND rating_count = 2 FROM supplier_profiles WHERE id = current_setting('test.xa')::UUID),
    (SELECT rating_avg::TEXT || ' / ' || rating_count FROM supplier_profiles WHERE id = current_setting('test.xa')::UUID));

DO $$ BEGIN RAISE NOTICE '6.1: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '6.1: TẤT CẢ ĐẠT (25 ca)' AS ket_qua;
