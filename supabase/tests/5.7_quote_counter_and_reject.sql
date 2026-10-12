-- Test kế hoạch 5.7: rfq_quote_revisions, counter_quote(), reject_quote(),
-- accept_quote() chốt theo giá mới nhất của xưởng.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "5.7: TẤT CẢ ĐẠT (29 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.
-- Chạy lại thêm 1.5, 4.6 (trigger báo giá) và 3.2 (accept_quote).

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

CREATE FUNCTION pg_temp.as_system() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);
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

-- Số dòng lịch sử / bên đề nghị gần nhất của một báo giá, theo quyền người gọi.
CREATE FUNCTION pg_temp.rev_count(p_quote TEXT) RETURNS INT LANGUAGE sql AS $$
    SELECT count(*)::INT FROM public.rfq_quote_revisions WHERE quote_id = p_quote::UUID;
$$;
CREATE FUNCTION pg_temp.last_by(p_quote TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT proposed_by FROM public.rfq_quote_revisions WHERE quote_id = p_quote::UUID
    ORDER BY created_at DESC, id DESC LIMIT 1;
$$;

-- Dữ liệu riêng cho test: 1 RFQ đang mở của buyer A (100 cái) gửi xưởng A và B;
-- buyer A có một địa chỉ mặc định để chốt đơn.
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_xb    UUID;
    v_rfq   UUID;
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
    WHERE id IN (SELECT user_id FROM supplier_profiles WHERE id IN (v_xa, v_xb));
    DELETE FROM buyer_addresses WHERE buyer_id = v_buyer;
    INSERT INTO buyer_addresses (buyer_id, recipient_name, phone, address_line, province, is_default)
    VALUES (v_buyer, 'Người nhận test 5.7', '0900000057', '1 Đường Test', 'Hà Nội', TRUE);

    INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
    VALUES (v_buyer, 'RFQ test 5.7', 100, 'cái', 'single', 'published')
    RETURNING id INTO v_rfq;
    INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa), (v_rfq, v_xb);

    PERFORM set_config('test.rfq', v_rfq::TEXT, TRUE), set_config('test.xb', v_xb::TEXT, TRUE);
END $$;

-- ── Báo giá gốc và lịch sử ─────────────────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
INSERT INTO rfq_quotes (rfq_id, unit_price, min_qty, lead_time_days)
VALUES (current_setting('test.rfq')::UUID, 50000, 100, 10);
SELECT set_config('test.q1', (SELECT id::TEXT FROM rfq_quotes
    WHERE rfq_id = current_setting('test.rfq')::UUID
      AND supplier_id IN (SELECT id FROM supplier_profiles WHERE user_id = auth.uid())), TRUE);
SELECT pg_temp.check('gửi báo giá → 1 dòng lịch sử của xưởng, giá 50.000',
    (SELECT count(*) = 1 AND bool_and(proposed_by = 'supplier' AND unit_price = 50000 AND lead_time_days = 10)
     FROM rfq_quote_revisions WHERE quote_id = current_setting('test.q1')::UUID),
    pg_temp.rev_count(current_setting('test.q1'))::TEXT);
UPDATE rfq_quotes SET unit_price = 48000 WHERE id = current_setting('test.q1')::UUID;
UPDATE rfq_quotes SET note = 'Giao tận nơi' WHERE id = current_setting('test.q1')::UUID;
SELECT pg_temp.check('xưởng sửa giá khi còn pending → thêm 1 dòng; sửa ghi chú thì không',
    pg_temp.rev_count(current_setting('test.q1')) = 2,
    pg_temp.rev_count(current_setting('test.q1'))::TEXT);
SELECT pg_temp.expect_error('xưởng tự trả giá khi lượt gần nhất là của mình', 'NOT_YOUR_TURN',
    $q$SELECT public.counter_quote(current_setting('test.q1')::UUID, 47000)$q$);
SELECT pg_temp.expect_error('client tự ghi vào bảng lịch sử', 'DENIED',
    $q$INSERT INTO rfq_quote_revisions (quote_id, proposed_by, unit_price)
       VALUES (current_setting('test.q1')::UUID, 'buyer', 1)$q$);

SELECT pg_temp.login('xuong.b@langnghe.test');
INSERT INTO rfq_quotes (rfq_id, unit_price, min_qty, lead_time_days)
VALUES (current_setting('test.rfq')::UUID, 52000, 100, 12);
SELECT set_config('test.q2', (SELECT id::TEXT FROM rfq_quotes
    WHERE rfq_id = current_setting('test.rfq')::UUID
      AND supplier_id = current_setting('test.xb')::UUID), TRUE);
SELECT pg_temp.check('xưởng B không đọc được lịch sử báo giá của xưởng A',
    pg_temp.rev_count(current_setting('test.q1')) = 0
    AND pg_temp.rev_count(current_setting('test.q2')) = 1,
    pg_temp.rev_count(current_setting('test.q1'))::TEXT);
SELECT pg_temp.expect_error('xưởng B trả giá trên báo giá của xưởng A', 'QUOTE_NOT_FOUND',
    $q$SELECT public.counter_quote(current_setting('test.q1')::UUID, 40000)$q$);

SELECT pg_temp.as_anon();
SELECT pg_temp.expect_error('khách chưa đăng nhập gọi counter_quote', 'DENIED',
    $q$SELECT public.counter_quote(current_setting('test.q1')::UUID, 40000)$q$);
SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT pg_temp.expect_error('buyer khác trả giá trên RFQ của buyer A', 'QUOTE_NOT_FOUND',
    $q$SELECT public.counter_quote(current_setting('test.q1')::UUID, 40000)$q$);
SELECT pg_temp.expect_error('buyer khác từ chối báo giá của RFQ không phải của mình', 'QUOTE_NOT_FOUND',
    $q$SELECT public.reject_quote(current_setting('test.q1')::UUID)$q$);

-- ── Buyer trả giá ──────────────────────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('giá 0', 'INVALID_PRICE',
    $q$SELECT public.counter_quote(current_setting('test.q1')::UUID, 0)$q$);
SELECT pg_temp.expect_error('thời gian sản xuất 400 ngày', 'INVALID_LEAD_TIME',
    $q$SELECT public.counter_quote(current_setting('test.q1')::UUID, 45000, 400)$q$);
SELECT public.counter_quote(current_setting('test.q1')::UUID, 45000, 8, '  Lấy 100 cái, giao trong tháng ');
SELECT pg_temp.check('buyer trả giá 45.000 → báo giá "đang thương lượng", giá của xưởng vẫn 48.000, RFQ negotiating',
    (SELECT status = 'counter_offered' AND unit_price = 48000 AND lead_time_days = 10
     FROM rfq_quotes WHERE id = current_setting('test.q1')::UUID)
    AND (SELECT status = 'negotiating' FROM rfq_requests WHERE id = current_setting('test.rfq')::UUID)
    AND pg_temp.rev_count(current_setting('test.q1')) = 3
    AND pg_temp.last_by(current_setting('test.q1')) = 'buyer'
    AND (SELECT note = 'Lấy 100 cái, giao trong tháng' AND lead_time_days = 8 FROM rfq_quote_revisions
         WHERE quote_id = current_setting('test.q1')::UUID AND proposed_by = 'buyer'),
    (SELECT status || ' / ' || unit_price FROM rfq_quotes WHERE id = current_setting('test.q1')::UUID));
SELECT pg_temp.expect_error('buyer trả giá lần nữa khi xưởng chưa trả lời', 'NOT_YOUR_TURN',
    $q$SELECT public.counter_quote(current_setting('test.q1')::UUID, 44000)$q$);

-- ── Xưởng trả lời ──────────────────────────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('xưởng A nhận thông báo buyer đề nghị giá mới',
    (SELECT count(*) = 1 AND bool_and(body LIKE '%45.000đ%') FROM notifications
     WHERE user_id = auth.uid() AND type = 'quote_countered'
       AND payload ->> 'quote_id' = current_setting('test.q1')),
    'thiếu thông báo quote_countered');
SELECT pg_temp.expect_error('đang thương lượng: xưởng sửa thẳng giá trên báo giá', 'FORBIDDEN_QUOTE_CHANGE',
    $q$UPDATE rfq_quotes SET unit_price = 30000 WHERE id = current_setting('test.q1')::UUID$q$);
SELECT pg_temp.expect_error('xưởng dùng hàm từ chối của buyer', 'QUOTE_NOT_FOUND',
    $q$SELECT public.reject_quote(current_setting('test.q1')::UUID)$q$);
SELECT public.counter_quote(current_setting('test.q1')::UUID, 46000);
SELECT pg_temp.check('xưởng trả lời 46.000 → giá trên báo giá thành 46.000, giữ 10 ngày, đúng 1 dòng lịch sử mới',
    (SELECT status = 'counter_offered' AND unit_price = 46000 AND lead_time_days = 10
     FROM rfq_quotes WHERE id = current_setting('test.q1')::UUID)
    AND pg_temp.rev_count(current_setting('test.q1')) = 4
    AND pg_temp.last_by(current_setting('test.q1')) = 'supplier',
    (SELECT unit_price::TEXT FROM rfq_quotes WHERE id = current_setting('test.q1')::UUID)
        || ' / ' || pg_temp.rev_count(current_setting('test.q1')));

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('buyer nhận thông báo xưởng trả lời',
    (SELECT count(*) = 1 FROM notifications
     WHERE user_id = auth.uid() AND type = 'quote_countered'
       AND payload ->> 'quote_id' = current_setting('test.q1')),
    'thiếu thông báo quote_countered');

-- Giới hạn 10 lượt: chèn thêm 6 dòng (kết thúc bằng lượt của xưởng) rồi xoá.
SELECT pg_temp.as_system();
INSERT INTO rfq_quote_revisions (quote_id, proposed_by, unit_price, note)
SELECT current_setting('test.q1')::UUID, CASE WHEN g % 2 = 1 THEN 'buyer' ELSE 'supplier' END, 46000, 'filler-5.7'
FROM generate_series(1, 6) g ORDER BY g;
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('lượt thứ 11', 'COUNTER_LIMIT_REACHED',
    $q$SELECT public.counter_quote(current_setting('test.q1')::UUID, 45500)$q$);
SELECT pg_temp.as_system();
DELETE FROM rfq_quote_revisions WHERE note = 'filler-5.7';

-- ── Buyer từ chối; xưởng báo giá lại; rút khi đang thương lượng ────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT public.reject_quote(current_setting('test.q2')::UUID, 'Giá cao hơn ngân sách');
SELECT pg_temp.check('buyer từ chối báo giá của xưởng B → rejected',
    (SELECT status = 'rejected' FROM rfq_quotes WHERE id = current_setting('test.q2')::UUID),
    (SELECT status::TEXT FROM rfq_quotes WHERE id = current_setting('test.q2')::UUID));
SELECT pg_temp.expect_error('từ chối lại báo giá đã từ chối', 'QUOTE_NOT_NEGOTIABLE',
    $q$SELECT public.reject_quote(current_setting('test.q2')::UUID)$q$);
SELECT pg_temp.expect_error('trả giá trên báo giá đã từ chối', 'QUOTE_NOT_NEGOTIABLE',
    $q$SELECT public.counter_quote(current_setting('test.q2')::UUID, 40000)$q$);

SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.check('xưởng B nhận thông báo bị từ chối kèm lý do',
    (SELECT count(*) = 1 AND bool_and(body LIKE '%Giá cao hơn ngân sách%') FROM notifications
     WHERE user_id = auth.uid() AND type = 'quote_rejected'
       AND payload ->> 'quote_id' = current_setting('test.q2')),
    'thiếu thông báo quote_rejected');
INSERT INTO rfq_quotes (rfq_id, unit_price, min_qty, lead_time_days)
VALUES (current_setting('test.rfq')::UUID, 47000, 100, 12);
SELECT set_config('test.q3', (SELECT id::TEXT FROM rfq_quotes
    WHERE rfq_id = current_setting('test.rfq')::UUID
      AND supplier_id = current_setting('test.xb')::UUID AND status = 'pending'), TRUE);
SELECT pg_temp.check('sau khi bị từ chối, xưởng B gửi được báo giá mới',
    current_setting('test.q3') <> '' AND current_setting('test.q3') <> current_setting('test.q2'),
    'không tạo được báo giá mới');

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT public.counter_quote(current_setting('test.q3')::UUID, 44000);
SELECT pg_temp.login('xuong.b@langnghe.test');
UPDATE rfq_quotes SET status = 'withdrawn' WHERE id = current_setting('test.q3')::UUID;
SELECT pg_temp.check('đang thương lượng: xưởng vẫn rút được báo giá',
    (SELECT status = 'withdrawn' FROM rfq_quotes WHERE id = current_setting('test.q3')::UUID),
    (SELECT status::TEXT FROM rfq_quotes WHERE id = current_setting('test.q3')::UUID));
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('buyer trả giá trên báo giá xưởng đã rút', 'QUOTE_NOT_FOUND',
    $q$SELECT public.counter_quote(current_setting('test.q3')::UUID, 43000)$q$);
SELECT pg_temp.expect_error('buyer từ chối báo giá xưởng đã rút', 'QUOTE_NOT_FOUND',
    $q$SELECT public.reject_quote(current_setting('test.q3')::UUID)$q$);

-- ── Chốt: giá đơn = đề nghị mới nhất của xưởng ─────────────────────────
-- Buyer trả giá 45.500 rồi chốt luôn khi xưởng chưa trả lời: nhận giá 46.000.
SELECT public.counter_quote(current_setting('test.q1')::UUID, 45500);
SELECT public.accept_quote(current_setting('test.q1')::UUID);
SELECT pg_temp.check('chốt báo giá → đơn 100 × 46.000 = 4.600.000 (giá mới nhất của xưởng)',
    (SELECT count(*) = 1 AND bool_and(total = 4600000) FROM orders
     WHERE rfq_quote_id = current_setting('test.q1')::UUID)
    AND (SELECT status = 'accepted' FROM rfq_quotes WHERE id = current_setting('test.q1')::UUID),
    (SELECT COALESCE(max(total)::TEXT, 'không có đơn') FROM orders
     WHERE rfq_quote_id = current_setting('test.q1')::UUID));
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('trả giá sau khi RFQ đã chốt', 'RFQ_ALREADY_SETTLED',
    $q$SELECT public.counter_quote(current_setting('test.q1')::UUID, 47000)$q$);

DO $$ BEGIN RAISE NOTICE '5.7: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '5.7: TẤT CẢ ĐẠT (29 ca)' AS ket_qua;
