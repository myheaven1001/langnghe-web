-- Test kế hoạch 4.10: admin_queue_counts(), admin_adjust_score(),
-- admin_grant_credit(), supplier_profiles.verified_at; admin không sửa thẳng
-- cột hệ thống của hồ sơ.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "4.10: TẤT CẢ ĐẠT (16 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.
-- Chạy lại thêm 1.1 (đã đổi sang gọi admin_adjust_score).

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
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = p_code THEN
            RAISE NOTICE 'PASS  %', p_label;
            RETURN;
        END IF;
        RAISE EXCEPTION 'FAIL  % — cần lỗi %, nhận %', p_label, p_code, SQLERRM;
    END;
    RAISE EXCEPTION 'FAIL  % — không bị chặn (cần %)', p_label, p_code;
END $$;

CREATE FUNCTION pg_temp.delta(p_key TEXT) RETURNS NUMERIC LANGUAGE sql AS $$
    SELECT (current_setting('test.after')::JSONB ->> p_key)::NUMERIC
         - (current_setting('test.before')::JSONB ->> p_key)::NUMERIC;
$$;

-- Hồ sơ dùng trong test; xưởng B chưa xác minh, đang hoạt động.
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_xb    UUID;
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

    UPDATE users SET status = 'active'
    WHERE id IN (SELECT user_id FROM supplier_profiles WHERE id = v_xb);
    UPDATE supplier_profiles SET verified_at = NULL WHERE id = v_xb;
    UPDATE buyer_profiles SET credit_balance = 2, trust_score = 70, risk_score = 30 WHERE id = v_buyer;
    DELETE FROM admin_audit_log;

    PERFORM set_config('test.buyer', v_buyer::TEXT, TRUE),
            set_config('test.xa', v_xa::TEXT, TRUE),
            set_config('test.xb', v_xb::TEXT, TRUE),
            set_config('test.buyer_user', (SELECT user_id::TEXT FROM buyer_profiles WHERE id = v_buyer), TRUE);
END $$;

-- ── Xưởng A đã xác minh từ seed: verified_at được điền lại ─────────────
SELECT pg_temp.check('xưởng đã duyệt xác minh có verified_at (điền lại từ hồ sơ cũ)',
    (SELECT verified_at IS NOT NULL FROM supplier_profiles WHERE id = current_setting('test.xa')::UUID),
    'verified_at của xưởng A trống');

-- ── Hàng đợi: trước / sau khi thêm việc ────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
SELECT set_config('test.before', public.admin_queue_counts()::TEXT, TRUE);

RESET ROLE;
DO $$
DECLARE
    v_rfq   UUID;
    v_quote UUID;
    v_order UUID;
    i       INT;
BEGIN
    -- 1 hồ sơ chờ duyệt (gửi 3 ngày trước), 2 đơn chờ thanh toán (1 có biên
    -- lai), 1 đơn đã xác nhận tiền hôm nay (5.000.000đ) đang tranh chấp.
    INSERT INTO verifications (entity_id, entity_type, tax_code, attempt_number, created_at)
    VALUES (current_setting('test.xb')::UUID, 'supplier', '0100000097',
            (SELECT COALESCE(max(attempt_number), 0) + 1 FROM verifications
             WHERE entity_type = 'supplier' AND entity_id = current_setting('test.xb')::UUID),
            (NOW() AT TIME ZONE 'UTC') - INTERVAL '3 days')
    RETURNING id INTO v_rfq;
    PERFORM set_config('test.ver', v_rfq::TEXT, TRUE);

    FOR i IN 1..3 LOOP
        INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
        VALUES (current_setting('test.buyer')::UUID, 'RFQ test 4.10 #' || i, 100, 'cái', 'single', 'awarded')
        RETURNING id INTO v_rfq;
        INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, status)
        VALUES (v_rfq, current_setting('test.xa')::UUID, 50000, 'accepted')
        RETURNING id INTO v_quote;
        INSERT INTO orders (rfq_quote_id, buyer_id, supplier_id, quantity, unit_price, status,
                            confirmed_at, paid_amount)
        VALUES (v_quote, current_setting('test.buyer')::UUID, current_setting('test.xa')::UUID, 100, 50000,
                CASE WHEN i = 3 THEN 'confirmed' ELSE 'pending_payment' END::order_status,
                CASE WHEN i = 3 THEN NOW() AT TIME ZONE 'UTC' END,
                CASE WHEN i = 3 THEN 5000000 END)
        RETURNING id INTO v_order;
        IF i = 1 THEN
            INSERT INTO order_documents (order_id, uploaded_by, uploader_role, doc_type, storage_path, file_name)
            VALUES (v_order, current_setting('test.buyer_user')::UUID, 'buyer', 'payment_receipt',
                    v_order || '/bien-lai-410.pdf', 'bien-lai-410.pdf');
        ELSIF i = 3 THEN
            INSERT INTO disputes (order_id, reason, reporter_role) VALUES (v_order, 'Test 4.10', 'buyer');
        END IF;
    END LOOP;
END $$;

SELECT pg_temp.login('admin@langnghe.test');
SELECT set_config('test.after', public.admin_queue_counts()::TEXT, TRUE);
SELECT pg_temp.check('hàng đợi: hồ sơ chờ +1, đơn chờ tiền +2 (1 có biên lai), tranh chấp +1',
    pg_temp.delta('pending_verifications') = 1 AND pg_temp.delta('orders_pending_payment') = 2
    AND pg_temp.delta('orders_with_receipt') = 1 AND pg_temp.delta('open_disputes') = 1,
    current_setting('test.after'));
SELECT pg_temp.check('hồ sơ chờ lâu nhất ≥ 3 ngày; tiền đã xác nhận trong tháng +5.000.000',
    (current_setting('test.after')::JSONB ->> 'oldest_verification_days')::INT >= 3
    AND pg_temp.delta('paid_amount_month') = 5000000,
    current_setting('test.after'));

-- ── Duyệt hồ sơ xưởng B → verified_at ──────────────────────────────────
SELECT public.admin_review_verification(current_setting('test.ver')::UUID, TRUE);
SELECT pg_temp.check('duyệt hồ sơ xưởng → supplier_profiles.verified_at được ghi',
    (SELECT verified_at IS NOT NULL FROM supplier_profiles WHERE id = current_setting('test.xb')::UUID),
    'verified_at vẫn trống');

-- ── Chỉnh điểm ─────────────────────────────────────────────────────────
SELECT pg_temp.expect_error('chỉnh điểm không ghi lý do', 'REASON_REQUIRED',
    $q$SELECT public.admin_adjust_score('buyer', current_setting('test.buyer')::UUID, 80, NULL, ' ')$q$);
SELECT pg_temp.expect_error('điểm ngoài khoảng 0–100', 'INVALID_INPUT',
    $q$SELECT public.admin_adjust_score('buyer', current_setting('test.buyer')::UUID, 120, NULL, 'x')$q$);
SELECT pg_temp.expect_error('hồ sơ không tồn tại', 'PROFILE_NOT_FOUND',
    $q$SELECT public.admin_adjust_score('supplier', gen_random_uuid(), 50, NULL, 'x')$q$);
SELECT public.admin_adjust_score('buyer', current_setting('test.buyer')::UUID, 85, NULL, 'Thanh toán đúng hạn 5 đơn');
SELECT public.admin_adjust_score('supplier', current_setting('test.xb')::UUID, NULL, 60, 'Giao trễ nhiều lần');
SELECT pg_temp.check('chỉnh điểm: chỉ đổi điểm được gửi, điểm kia giữ nguyên; có 2 dòng nhật ký',
    (SELECT trust_score = 85 AND risk_score = 30 FROM buyer_profiles WHERE id = current_setting('test.buyer')::UUID)
    AND (SELECT risk_score = 60 FROM supplier_profiles WHERE id = current_setting('test.xb')::UUID)
    AND (SELECT count(*) = 2 AND bool_and(details ? 'reason' AND admin_id = auth.uid())
         FROM admin_audit_log WHERE action = 'user.adjust_score'),
    'điểm hoặc nhật ký sai');

-- ── Credit ─────────────────────────────────────────────────────────────
SELECT pg_temp.expect_error('trừ credit quá số dư', 'INSUFFICIENT_CREDIT',
    $q$SELECT public.admin_grant_credit(current_setting('test.buyer')::UUID, -5, 'x')$q$);
SELECT pg_temp.expect_error('cấp 0 credit', 'INVALID_INPUT',
    $q$SELECT public.admin_grant_credit(current_setting('test.buyer')::UUID, 0, 'x')$q$);
SELECT public.admin_grant_credit(current_setting('test.buyer')::UUID, 10, 'Tặng khách mới');
SELECT public.admin_grant_credit(current_setting('test.buyer')::UUID, -3, 'Thu hồi do cấp nhầm');
SELECT pg_temp.check('cấp 10 rồi trừ 3 → số dư 9, nhật ký ghi số dư trước/sau',
    (SELECT credit_balance = 9 FROM buyer_profiles WHERE id = current_setting('test.buyer')::UUID)
    AND (SELECT count(*) = 2 FROM admin_audit_log WHERE action = 'user.grant_credit')
    AND (SELECT (details ->> 'old_balance')::INT = 12 AND (details ->> 'new_balance')::INT = 9
         FROM admin_audit_log WHERE action = 'user.grant_credit' AND (details ->> 'amount')::INT = -3),
    (SELECT credit_balance::TEXT FROM buyer_profiles WHERE id = current_setting('test.buyer')::UUID));

-- ── Admin sửa thẳng cột hệ thống → bị chặn ─────────────────────────────
SELECT pg_temp.expect_error('admin UPDATE thẳng credit của buyer', 'FORBIDDEN_SYSTEM_COLUMN_CHANGE',
    $q$UPDATE buyer_profiles SET credit_balance = 999 WHERE id = current_setting('test.buyer')::UUID$q$);
SELECT pg_temp.expect_error('admin UPDATE thẳng điểm của xưởng', 'FORBIDDEN_SYSTEM_COLUMN_CHANGE',
    $q$UPDATE supplier_profiles SET trust_score = 100 WHERE id = current_setting('test.xb')::UUID$q$);

-- ── Người không phải admin ─────────────────────────────────────────────
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.expect_error('xưởng tự đặt verified_at', 'FORBIDDEN_SYSTEM_COLUMN_CHANGE',
    $q$UPDATE supplier_profiles SET verified_at = NOW() - INTERVAL '5 years' WHERE user_id = auth.uid()$q$);
SELECT pg_temp.expect_error('xưởng xem hàng đợi admin', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_queue_counts()$q$);
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('buyer tự cấp credit cho mình', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_grant_credit(current_setting('test.buyer')::UUID, 100, 'tự cấp')$q$);

DO $$ BEGIN RAISE NOTICE '4.10: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '4.10: TẤT CẢ ĐẠT (16 ca)' AS ket_qua;
