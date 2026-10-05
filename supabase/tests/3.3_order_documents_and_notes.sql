-- Test kế hoạch 3.3: chứng từ đơn hàng (order_documents + bucket
-- order-documents) và ghi chú (add_order_note).
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "3.3: TẤT CẢ ĐẠT (17 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.

BEGIN;

-- Dữ liệu riêng cho test: 1 đơn của buyer A với xưởng A (tạo thẳng bằng
-- quyền SQL Editor), 2 file "đã tải" sẵn trong bucket.
DO $$
DECLARE
    v_buyer UUID;
    v_xa    UUID;
    v_rfq   UUID;
    v_quote UUID;
    v_order UUID;
BEGIN
    SELECT bp.id INTO v_buyer FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    IF v_buyer IS NULL OR v_xa IS NULL THEN
        RAISE EXCEPTION 'Thiếu buyer.a / xuong.a — chạy npm run seed:staging trước.';
    END IF;

    INSERT INTO rfq_requests (buyer_id, title, quantity, unit, rfq_type, status)
    VALUES (v_buyer, 'RFQ test 3.3', 100, 'cái', 'single', 'awarded')
    RETURNING id INTO v_rfq;
    INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);
    INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, min_qty, lead_time_days, status)
    VALUES (v_rfq, v_xa, 50000, 100, 10, 'accepted')
    RETURNING id INTO v_quote;
    INSERT INTO orders (rfq_quote_id, buyer_id, supplier_id, quantity, unit_price)
    VALUES (v_quote, v_buyer, v_xa, 100, 50000)
    RETURNING id INTO v_order;

    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('order-documents', v_order || '/bien-lai.pdf'),
           ('order-documents', v_order || '/van-don.pdf');

    PERFORM set_config('test.order', v_order::TEXT, TRUE);
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

-- ── Buyer A (buyer của đơn) ────────────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.check('order_role: buyer của đơn',
    public.order_role(current_setting('test.order')::UUID) = 'buyer', 'sai vai trò');

INSERT INTO order_documents (order_id, uploaded_by, uploader_role, doc_type, storage_path, file_name)
VALUES (current_setting('test.order')::UUID, auth.uid(), 'admin', 'payment_receipt',
        current_setting('test.order') || '/bien-lai.pdf', 'bien-lai.pdf');
SELECT pg_temp.check('buyer tải biên lai; vai trò tự điền là buyer dù gửi lên "admin"',
    (SELECT uploader_role = 'buyer' AND uploaded_by = auth.uid() FROM order_documents
     WHERE order_id = current_setting('test.order')::UUID AND doc_type = 'payment_receipt'),
    'vai trò/người tải sai');
SELECT pg_temp.check('thêm chứng từ tự ghi event document_added',
    (SELECT count(*) = 1 AND bool_and(metadata ->> 'actor_role' = 'buyer'
                                      AND metadata ->> 'doc_type' = 'payment_receipt')
     FROM order_events
     WHERE order_id = current_setting('test.order')::UUID AND event_type = 'document_added'),
    'không có event');
SELECT pg_temp.expect_error('buyer tải vận đơn (loại của xưởng)', 'FORBIDDEN_DOCUMENT_TYPE',
    $q$INSERT INTO order_documents (order_id, uploaded_by, uploader_role, doc_type, storage_path, file_name)
       VALUES (current_setting('test.order')::UUID, auth.uid(), 'buyer', 'shipping_document',
               current_setting('test.order') || '/van-don.pdf', 'van-don.pdf')$q$);
SELECT pg_temp.expect_error('chứng từ trỏ tới file chưa tải lên', 'INVALID_DOCUMENT',
    $q$INSERT INTO order_documents (order_id, uploaded_by, uploader_role, doc_type, storage_path, file_name)
       VALUES (current_setting('test.order')::UUID, auth.uid(), 'buyer', 'other',
               current_setting('test.order') || '/khong-co.pdf', 'khong-co.pdf')$q$);
SELECT pg_temp.expect_error('chứng từ trỏ tới file ngoài thư mục của đơn', 'INVALID_DOCUMENT',
    $q$INSERT INTO order_documents (order_id, uploaded_by, uploader_role, doc_type, storage_path, file_name)
       VALUES (current_setting('test.order')::UUID, auth.uid(), 'buyer', 'other',
               'khac/bien-lai.pdf', 'bien-lai.pdf')$q$);
DO $$
DECLARE
    v_rows INT;
BEGIN
    DELETE FROM order_documents WHERE order_id = current_setting('test.order')::UUID;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN
        RAISE EXCEPTION 'FAIL  buyer xoá chứng từ — xoá được % dòng', v_rows;
    END IF;
    RAISE NOTICE 'PASS  buyer xoá chứng từ → không xoá được';
END $$;

SELECT public.add_order_note(current_setting('test.order')::UUID, '  Nhờ xưởng giao giờ hành chính  ');
SELECT pg_temp.check('buyer ghi chú → event note có actor_role',
    (SELECT count(*) = 1 AND bool_and(note = 'Nhờ xưởng giao giờ hành chính'
                                      AND metadata ->> 'actor_role' = 'buyer' AND actor_id = auth.uid())
     FROM order_events
     WHERE order_id = current_setting('test.order')::UUID AND event_type = 'note'),
    'ghi chú sai');
SELECT pg_temp.expect_error('ghi chú rỗng', 'INVALID_NOTE',
    $q$SELECT public.add_order_note(current_setting('test.order')::UUID, '   ')$q$);
SELECT pg_temp.expect_error('ghi event thẳng vào order_events', 'DENIED',
    $q$INSERT INTO order_events (order_id, actor_id, event_type, note)
       VALUES (current_setting('test.order')::UUID, auth.uid(), 'payment_confirmed', 'giả')$q$);
INSERT INTO storage.objects (bucket_id, name)
VALUES ('order-documents', current_setting('test.order') || '/them.png');
SELECT pg_temp.check('buyer tải được file vào thư mục của đơn và đọc lại được (quy tắc bucket)',
    (SELECT count(*) = 3 FROM storage.objects
     WHERE bucket_id = 'order-documents' AND name LIKE current_setting('test.order') || '/%'),
    'không tải/đọc được file');

-- ── Xưởng A (xưởng của đơn) ────────────────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
INSERT INTO order_documents (order_id, uploaded_by, uploader_role, doc_type, storage_path, file_name)
VALUES (current_setting('test.order')::UUID, auth.uid(), 'supplier', 'shipping_document',
        current_setting('test.order') || '/van-don.pdf', 'van-don.pdf');
SELECT pg_temp.check('xưởng tải vận đơn và thấy cả biên lai của buyer',
    (SELECT count(*) = 2 FROM order_documents WHERE order_id = current_setting('test.order')::UUID),
    (SELECT count(*)::TEXT FROM order_documents));
SELECT pg_temp.expect_error('xưởng tải "biên lai chuyển khoản" (loại của buyer)', 'FORBIDDEN_DOCUMENT_TYPE',
    $q$INSERT INTO order_documents (order_id, uploaded_by, uploader_role, doc_type, storage_path, file_name)
       VALUES (current_setting('test.order')::UUID, auth.uid(), 'supplier', 'payment_receipt',
               current_setting('test.order') || '/them.png', 'them.png')$q$);

-- ── Xưởng B (không liên quan tới đơn) ──────────────────────────────────
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.check('xưởng khác không thấy chứng từ, event, file của đơn',
    (SELECT count(*) = 0 FROM order_documents WHERE order_id = current_setting('test.order')::UUID)
    AND (SELECT count(*) = 0 FROM order_events WHERE order_id = current_setting('test.order')::UUID)
    AND (SELECT count(*) = 0 FROM storage.objects
         WHERE bucket_id = 'order-documents' AND name LIKE current_setting('test.order') || '/%'),
    'xưởng khác đọc được dữ liệu của đơn');
SELECT pg_temp.expect_error('xưởng khác ghi chú vào đơn', 'ORDER_NOT_FOUND',
    $q$SELECT public.add_order_note(current_setting('test.order')::UUID, 'chen vào')$q$);
SELECT pg_temp.expect_error('xưởng khác tải file vào thư mục của đơn', 'DENIED',
    $q$INSERT INTO storage.objects (bucket_id, name)
       VALUES ('order-documents', current_setting('test.order') || '/la.png')$q$);

-- ── Admin ──────────────────────────────────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
SELECT public.add_order_note(current_setting('test.order')::UUID, 'Sàn đã kiểm tra biên lai');
SELECT pg_temp.check('admin thấy đủ chứng từ, file và ghi chú được với vai trò admin',
    (SELECT count(*) = 2 FROM order_documents WHERE order_id = current_setting('test.order')::UUID)
    AND (SELECT count(*) = 3 FROM storage.objects
         WHERE bucket_id = 'order-documents' AND name LIKE current_setting('test.order') || '/%')
    AND (SELECT count(*) = 1 FROM order_events
         WHERE order_id = current_setting('test.order')::UUID AND event_type = 'note'
           AND metadata ->> 'actor_role' = 'admin'),
    'admin không đọc/ghi được');

DO $$ BEGIN RAISE NOTICE '3.3: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '3.3: TẤT CẢ ĐẠT (17 ca)' AS ket_qua;
