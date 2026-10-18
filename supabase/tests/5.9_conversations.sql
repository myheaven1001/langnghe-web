-- Test kế hoạch 5.9: conversations / conversation_messages,
-- start_conversation(), send_message(), mark_conversation_read(),
-- list_conversations().
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "5.9: TẤT CẢ ĐẠT (23 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.
-- Hai ca về "chưa có quan hệ" tự bỏ qua (ghi SKIP) nếu buyer.b và xuong.b trên
-- staging đã có RFQ / đơn chung.

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
    -- 'SKIP' trong test.skip: ca phụ thuộc dữ liệu staging, bỏ qua có ghi chú.
    IF p_code LIKE 'SKIP:%' THEN
        RAISE NOTICE 'SKIP  % (%)', p_label, substr(p_code, 6);
        RETURN;
    END IF;
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

-- Dữ liệu riêng cho test:
--   xưởng A công khai, nhận tin trực tiếp; xưởng B công khai, TẮT nhận tin trực tiếp
--   buyer A có 1 RFQ mời xưởng B (→ hai bên có quan hệ)
--   xoá sẵn hội thoại giữa 2 buyer và 2 xưởng test (ROLLBACK ở cuối trả lại)
DO $$
DECLARE
    v_ba  UUID;
    v_bb  UUID;
    v_xa  UUID;
    v_xb  UUID;
    v_rfq UUID;
BEGIN
    SELECT bp.id INTO v_ba FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT bp.id INTO v_bb FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.b@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    SELECT sp.id INTO v_xb FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.b@langnghe.test';
    IF v_ba IS NULL OR v_bb IS NULL OR v_xa IS NULL OR v_xb IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a / buyer.b / xuong.a / xuong.b — chạy npm run seed:staging trước.';
    END IF;

    UPDATE users SET status = 'active'
    WHERE id IN (SELECT user_id FROM supplier_profiles WHERE id IN (v_xa, v_xb))
       OR id IN (SELECT user_id FROM buyer_profiles WHERE id IN (v_ba, v_bb));
    UPDATE supplier_profiles SET is_hidden = FALSE, allow_direct_message = TRUE WHERE id = v_xa;
    UPDATE supplier_profiles SET is_hidden = FALSE, allow_direct_message = FALSE WHERE id = v_xb;
    DELETE FROM conversations WHERE buyer_id IN (v_ba, v_bb) AND supplier_id IN (v_xa, v_xb);

    INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
    VALUES (v_ba, 'RFQ test 5.9', 100, 'cái', 'single', 'published')
    RETURNING id INTO v_rfq;
    INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xb);

    PERFORM set_config('test.ba', v_ba::TEXT, TRUE), set_config('test.bb', v_bb::TEXT, TRUE),
            set_config('test.xa', v_xa::TEXT, TRUE), set_config('test.xb', v_xb::TEXT, TRUE),
            set_config('test.rfq', v_rfq::TEXT, TRUE),
            set_config('test.ba_name', (SELECT company_name FROM buyer_profiles WHERE id = v_ba), TRUE),
            set_config('test.skip',
                CASE WHEN EXISTS (SELECT 1 FROM rfq_quotes q JOIN rfq_requests r ON r.id = q.rfq_id
                                  WHERE q.supplier_id = v_xb AND r.buyer_id = v_bb)
                       OR EXISTS (SELECT 1 FROM rfq_targets t JOIN rfq_requests r ON r.id = t.rfq_id
                                  WHERE t.supplier_id = v_xb AND r.buyer_id = v_bb
                                    AND r.status NOT IN ('draft', 'cancelled'))
                       OR EXISTS (SELECT 1 FROM orders o WHERE o.supplier_id = v_xb AND o.buyer_id = v_bb)
                     THEN 'SKIP:buyer.b và xuong.b đã có quan hệ trên staging' ELSE '' END, TRUE);
END $$;

-- ── Mở hội thoại ───────────────────────────────────────────────────────
SELECT pg_temp.as_anon();
SELECT pg_temp.expect_error('khách chưa đăng nhập mở hội thoại', 'DENIED',
    $q$SELECT public.start_conversation(current_setting('test.xa')::UUID)$q$);

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('không nêu bên kia', 'COUNTERPART_NOT_FOUND',
    $q$SELECT public.start_conversation()$q$);
SELECT pg_temp.expect_error('xưởng không tồn tại', 'COUNTERPART_NOT_FOUND',
    $q$SELECT public.start_conversation(gen_random_uuid())$q$);
SELECT set_config('test.c1', public.start_conversation(current_setting('test.xa')::UUID)::TEXT, TRUE);
SELECT set_config('test.c1_again', public.start_conversation(current_setting('test.xa')::UUID)::TEXT, TRUE);
SELECT pg_temp.check('buyer mở hội thoại với xưởng công khai; mở lại trả đúng hội thoại cũ',
    current_setting('test.c1') <> '' AND current_setting('test.c1') = current_setting('test.c1_again')
    AND (SELECT count(*) = 1 FROM conversations WHERE id = current_setting('test.c1')::UUID),
    'tạo trùng hoặc không đọc được hội thoại của mình');

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng dùng nhánh của buyer (nhắn cho xưởng khác)', 'NOT_A_PARTICIPANT',
    $q$SELECT public.start_conversation(current_setting('test.xb')::UUID)$q$);

SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT pg_temp.expect_error('xưởng tắt nhận tin trực tiếp, buyer chưa có quan hệ',
    COALESCE(NULLIF(current_setting('test.skip'), ''), 'DIRECT_MESSAGE_DISABLED'),
    $q$SELECT public.start_conversation(current_setting('test.xb')::UUID)$q$);
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.expect_error('xưởng nhắn cho buyer chưa có quan hệ',
    COALESCE(NULLIF(current_setting('test.skip'), ''), 'NO_RELATIONSHIP'),
    $q$SELECT public.start_conversation(NULL, current_setting('test.bb')::UUID)$q$);
SELECT set_config('test.c2', public.start_conversation(NULL, current_setting('test.ba')::UUID)::TEXT, TRUE);
SELECT pg_temp.check('xưởng được mời báo giá → mở được hội thoại với buyer đó (dù tắt nhận tin trực tiếp)',
    (SELECT count(*) = 1 FROM conversations WHERE id = current_setting('test.c2')::UUID),
    'không mở được');

-- ── Gửi tin ────────────────────────────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_error('tin trống', 'INVALID_MESSAGE',
    $q$SELECT public.send_message(current_setting('test.c1')::UUID, '  ')$q$);
SELECT pg_temp.expect_error('ngữ cảnh thiếu id', 'INVALID_CONTEXT',
    $q$SELECT public.send_message(current_setting('test.c1')::UUID, 'chào xưởng', 'rfq')$q$);
SELECT pg_temp.expect_error('gắn đơn hàng không thuộc cặp này', 'INVALID_CONTEXT',
    $q$SELECT public.send_message(current_setting('test.c1')::UUID, 'chào xưởng', 'order', gen_random_uuid())$q$);
SELECT pg_temp.expect_error('client tự ghi vào conversation_messages', 'DENIED',
    $q$INSERT INTO conversation_messages (conversation_id, sender_role, body)
       VALUES (current_setting('test.c1')::UUID, 'supplier', 'giả danh xưởng')$q$);
SELECT pg_temp.expect_error('client tự sửa số chưa đọc', 'DENIED',
    $q$UPDATE conversations SET supplier_unread = 0 WHERE id = current_setting('test.c1')::UUID$q$);
SELECT public.send_message(current_setting('test.c1')::UUID, '  Xưởng còn mẫu bát men lam không? ',
                           'rfq', current_setting('test.rfq')::UUID);
SELECT pg_temp.check('buyer gửi tin → lưu tin cuối, xưởng có 1 tin chưa đọc',
    (SELECT last_message_preview = 'Xưởng còn mẫu bát men lam không?' AND last_sender_role = 'buyer'
            AND supplier_unread = 1 AND buyer_unread = 0 AND last_message_at IS NOT NULL
     FROM conversations WHERE id = current_setting('test.c1')::UUID)
    AND (SELECT count(*) = 1 AND bool_and(context_type = 'rfq' AND sender_id = auth.uid())
         FROM conversation_messages WHERE conversation_id = current_setting('test.c1')::UUID),
    'tin hoặc số chưa đọc sai');

SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT pg_temp.expect_error('người ngoài gửi tin vào hội thoại', 'CONVERSATION_NOT_FOUND',
    $q$SELECT public.send_message(current_setting('test.c1')::UUID, 'chen vào')$q$);
SELECT pg_temp.check('người ngoài không đọc được hội thoại và tin',
    (SELECT count(*) = 0 FROM conversations WHERE id = current_setting('test.c1')::UUID)
    AND (SELECT count(*) = 0 FROM conversation_messages
         WHERE conversation_id = current_setting('test.c1')::UUID)
    AND (SELECT count(*) = 0 FROM public.list_conversations() WHERE id = current_setting('test.c1')::UUID),
    'lộ hội thoại');

-- ── Xưởng đọc và trả lời ───────────────────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('xưởng thấy hội thoại kèm tên buyer và 1 tin chưa đọc',
    (SELECT count(*) = 1 AND bool_and(my_role = 'supplier' AND unread = 1
                                      AND counterpart_name = current_setting('test.ba_name')
                                      AND counterpart_id = current_setting('test.ba')::UUID)
     FROM public.list_conversations() WHERE id = current_setting('test.c1')::UUID),
    'danh sách hội thoại của xưởng sai');
SELECT public.mark_conversation_read(current_setting('test.c1')::UUID);
SELECT pg_temp.check('xưởng đánh dấu đã đọc → 0 tin chưa đọc',
    (SELECT supplier_unread = 0 FROM conversations WHERE id = current_setting('test.c1')::UUID),
    'vẫn còn tin chưa đọc');
SELECT public.send_message(current_setting('test.c1')::UUID, 'Còn 200 cái, giao được ngay.');

SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('buyer thấy 2 tin và 1 tin chưa đọc từ xưởng',
    (SELECT count(*) = 2 FROM conversation_messages
     WHERE conversation_id = current_setting('test.c1')::UUID)
    AND (SELECT unread = 1 AND last_sender_role = 'supplier' FROM public.list_conversations()
         WHERE id = current_setting('test.c1')::UUID),
    'phía buyer sai');
SELECT public.mark_conversation_read();
SELECT pg_temp.check('đánh dấu đã đọc tất cả → buyer hết tin chưa đọc, không đụng phía xưởng',
    (SELECT COALESCE(sum(unread), 0) = 0 FROM public.list_conversations())
    AND (SELECT buyer_unread = 0 AND supplier_unread = 0 FROM conversations
         WHERE id = current_setting('test.c1')::UUID),
    'số chưa đọc sai');

-- Giới hạn 30 tin / phút: buyer A đã gửi 1 tin, gửi thêm 29 thì tin thứ 31 bị chặn.
DO $$
BEGIN
    FOR i IN 1..29 LOOP
        PERFORM public.send_message(current_setting('test.c1')::UUID, 'tin ' || i);
    END LOOP;
END $$;
SELECT pg_temp.expect_error('tin thứ 31 trong một phút', 'MESSAGE_RATE_LIMIT',
    $q$SELECT public.send_message(current_setting('test.c1')::UUID, 'tin 31')$q$);

-- ── Admin; đường cũ ────────────────────────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.check('admin đọc được hội thoại',
    (SELECT count(*) = 1 FROM conversations WHERE id = current_setting('test.c1')::UUID),
    'admin không đọc được');
SELECT pg_temp.expect_error('admin gửi tin vào hội thoại của hai bên', 'NOT_A_PARTICIPANT',
    $q$SELECT public.send_message(current_setting('test.c1')::UUID, 'sàn xin chen ngang')$q$);

-- Ca 'ghi vào rfq_messages bị từ chối' bỏ từ 5.10: bảng đã xoá hẳn (xem test 5.10).

DO $$ BEGIN RAISE NOTICE '5.9: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '5.9: TẤT CẢ ĐẠT (23 ca)' AS ket_qua;
