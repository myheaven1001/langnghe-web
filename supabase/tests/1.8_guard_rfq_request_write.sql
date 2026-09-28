-- Test kế hoạch 1.8: buyer không tạo RFQ trực tiếp (vượt hạn mức), không tự
-- đặt trạng thái, không sửa RFQ đã có báo giá; huỷ và create_rfq vẫn chạy.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào Supabase
-- Dashboard → SQL Editor rồi Run, hoặc:
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/1.8_guard_rfq_request_write.sql
-- Đạt: kết quả cuối là "1.8: TẤT CẢ ĐẠT (12 ca)" (psql còn in NOTICE "PASS …").
-- Hỏng: dừng ở ca đầu tiên sai với thông báo "FAIL …".
-- Cả file chạy trong một transaction và ROLLBACK ở cuối: không đổi dữ liệu.

BEGIN;

-- ── Dữ liệu riêng cho test (buyer A) ───────────────────────────────────
--   rfq_a  published, chưa có báo giá
--   rfq_b  published, có 1 báo giá đang chờ của xưởng A
--   rfq_c  awarded
DO $$
DECLARE
    v_buyer    UUID;
    v_buyer_b  UUID;
    v_xa       UUID;
    v_category UUID;
    v_rfq      UUID;
    i          INT;
BEGIN
    SELECT bp.id INTO v_buyer FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.a@langnghe.test';
    SELECT bp.id INTO v_buyer_b FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
    WHERE u.email = 'buyer.b@langnghe.test';
    SELECT sp.id INTO v_xa FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test';
    SELECT id INTO v_category FROM categories WHERE slug = 'gom-su';
    IF v_buyer IS NULL OR v_buyer_b IS NULL OR v_xa IS NULL OR v_category IS NULL THEN
        RAISE EXCEPTION 'Thiếu dữ liệu seed — chạy npm run seed:staging trước.';
    END IF;

    FOR i IN 1..3 LOOP
        INSERT INTO rfq_requests (buyer_id, category_id, title, quantity, unit, rfq_type, status)
        VALUES (v_buyer, v_category, 'RFQ test 1.8 #' || i, 100, 'cái', 'single',
                CASE i WHEN 3 THEN 'awarded' ELSE 'published' END::rfq_status)
        RETURNING id INTO v_rfq;
        INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq, v_xa);
        PERFORM set_config('test.rfq_' || chr(96 + i), v_rfq::TEXT, TRUE);
    END LOOP;
    INSERT INTO rfq_quotes (rfq_id, supplier_id, unit_price, status)
    VALUES (current_setting('test.rfq_b')::UUID, v_xa, 90000, 'pending');

    PERFORM set_config('test.buyer_a', v_buyer::TEXT, TRUE),
            set_config('test.buyer_b', v_buyer_b::TEXT, TRUE),
            set_config('test.xuong_a', v_xa::TEXT, TRUE),
            set_config('test.category', v_category::TEXT, TRUE);
END $$;

-- ── Công cụ ─────────────────────────────────────────────────────────────
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
    RAISE EXCEPTION 'FAIL  % — câu lệnh không bị chặn (cần %)', p_label, p_code;
END $$;

CREATE FUNCTION pg_temp.expect_ok(p_label TEXT, p_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_rows INT;
BEGIN
    BEGIN
        EXECUTE p_sql;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'FAIL  % — bị chặn nhầm: %', p_label, SQLERRM;
    END;
    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'FAIL  % — tác động % dòng, cần 1', p_label, v_rows;
    END IF;
    RAISE NOTICE 'PASS  %', p_label;
END $$;

-- ── Buyer A ─────────────────────────────────────────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');

SELECT pg_temp.expect_error('buyer tạo thẳng multi-RFQ, bỏ qua hạn mức', 'FORBIDDEN_RFQ_CHANGE',
    $q$INSERT INTO rfq_requests (buyer_id, category_id, title, quantity, rfq_type, status)
       VALUES (current_setting('test.buyer_a')::UUID, current_setting('test.category')::UUID,
               'RFQ lậu', 1000, 'multi', 'published')$q$);
SELECT pg_temp.expect_error('buyer tự đặt RFQ "đã chốt"', 'FORBIDDEN_RFQ_CHANGE',
    $q$UPDATE rfq_requests SET status = 'awarded' WHERE id = current_setting('test.rfq_a')::UUID$q$);
SELECT pg_temp.expect_error('buyer đổi RFQ đơn thành multi', 'FORBIDDEN_RFQ_CHANGE',
    $q$UPDATE rfq_requests SET rfq_type = 'multi' WHERE id = current_setting('test.rfq_a')::UUID$q$);
SELECT pg_temp.expect_error('buyer chuyển RFQ sang tên buyer khác', 'FORBIDDEN_RFQ_CHANGE',
    $q$UPDATE rfq_requests SET buyer_id = current_setting('test.buyer_b')::UUID
       WHERE id = current_setting('test.rfq_a')::UUID$q$);
SELECT pg_temp.expect_ok('buyer sửa nội dung RFQ chưa có báo giá',
    $q$UPDATE rfq_requests SET title = 'RFQ test 1.8 (sửa)', quantity = 150
       WHERE id = current_setting('test.rfq_a')::UUID$q$);
SELECT pg_temp.expect_error('buyer sửa số lượng RFQ đã có báo giá', 'RFQ_HAS_QUOTES',
    $q$UPDATE rfq_requests SET quantity = 5000 WHERE id = current_setting('test.rfq_b')::UUID$q$);
SELECT pg_temp.expect_error('buyer xoá RFQ', 'FORBIDDEN_RFQ_CHANGE',
    $q$DELETE FROM rfq_requests WHERE id = current_setting('test.rfq_a')::UUID$q$);
SELECT pg_temp.expect_error('buyer huỷ RFQ đã chốt', 'FORBIDDEN_RFQ_CHANGE',
    $q$UPDATE rfq_requests SET status = 'cancelled' WHERE id = current_setting('test.rfq_c')::UUID$q$);
-- Đúng việc nút "Huỷ yêu cầu" (CancelRfqButton) làm.
SELECT pg_temp.expect_ok('buyer huỷ RFQ đang có báo giá (nút hiện có)',
    $q$UPDATE rfq_requests SET status = 'cancelled' WHERE id = current_setting('test.rfq_b')::UUID$q$);

-- ── Xưởng A báo giá → RFQ tự chuyển "đã có báo giá" (trigger SECURITY DEFINER) ──
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_ok('xưởng gửi báo giá cho RFQ đang mở',
    $q$INSERT INTO rfq_quotes (rfq_id, unit_price) VALUES (current_setting('test.rfq_a')::UUID, 88000)$q$);
RESET ROLE;
DO $$
BEGIN
    IF (SELECT status FROM rfq_requests WHERE id = current_setting('test.rfq_a')::UUID) <> 'quoted' THEN
        RAISE EXCEPTION 'FAIL  RFQ không tự chuyển sang quoted sau báo giá đầu tiên';
    END IF;
    RAISE NOTICE 'PASS  RFQ tự chuyển "đã có báo giá"';
END $$;

-- ── Buyer B gửi RFQ qua create_rfq → vẫn chạy ──────────────────────────
SELECT pg_temp.login('buyer.b@langnghe.test');
DO $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := public.create_rfq('RFQ test 1.8 qua create_rfq', 'Mô tả đủ dài cho yêu cầu báo giá test.',
                                  50, 'cái', NULL, NULL, 30, 'single',
                                  current_setting('test.category')::UUID,
                                  ARRAY[current_setting('test.xuong_a')::UUID]);
    IF NOT EXISTS (SELECT 1 FROM rfq_requests WHERE id = (v_result->>'rfq_id')::UUID) THEN
        RAISE EXCEPTION 'FAIL  create_rfq không tạo được RFQ (%)', v_result;
    END IF;
    RAISE NOTICE 'PASS  gửi RFQ qua create_rfq vẫn chạy';
END $$;

DO $$ BEGIN RAISE NOTICE '1.8: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

-- SQL Editor không hiện NOTICE: dòng này chỉ hiện khi mọi ca ở trên đều đạt.
SELECT '1.8: TẤT CẢ ĐẠT (12 ca)' AS ket_qua;
