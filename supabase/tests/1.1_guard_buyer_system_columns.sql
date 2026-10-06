-- Test kế hoạch 1.1: buyer không tự sửa được cột hệ thống của buyer_profiles.
--
-- Chạy trên STAGING sau `npm run seed:staging` (cần tài khoản buyer.a,
-- buyer.b, xuong.a, admin @langnghe.test). Dán cả file vào Supabase
-- Dashboard → SQL Editor rồi Run, hoặc:
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/1.1_guard_buyer_system_columns.sql
-- Đạt: kết quả cuối là "1.1: TẤT CẢ ĐẠT (11 ca)" (psql còn in NOTICE "PASS …" từng ca).
-- Hỏng: dừng ở ca đầu tiên sai với thông báo "FAIL …".
-- Cả file chạy trong một transaction và ROLLBACK ở cuối: không đổi dữ liệu.

BEGIN;

-- ID dùng trong test, tra trước khi giả lập đăng nhập (role authenticated
-- không đọc được auth.users). Đọc lại bằng current_setting('test.…').
SELECT set_config('test.buyer_b_profile',
                  (SELECT bp.id FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
                   WHERE u.email = 'buyer.b@langnghe.test')::TEXT, TRUE),
       set_config('test.xuong_a_supplier',
                  (SELECT sp.id FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
                   WHERE u.email = 'xuong.a@langnghe.test')::TEXT, TRUE);

-- Giả lập đăng nhập: auth.uid() đọc `sub` trong request.jwt.claims.
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

-- Chạy một câu lệnh, bắt buộc phải bị chặn bằng FORBIDDEN_SYSTEM_COLUMN_CHANGE.
CREATE FUNCTION pg_temp.expect_forbidden(p_label TEXT, p_sql TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM = 'FORBIDDEN_SYSTEM_COLUMN_CHANGE' THEN
            RAISE NOTICE 'PASS  %', p_label;
            RETURN;
        END IF;
        RAISE;
    END;
    RAISE EXCEPTION 'FAIL  % — câu lệnh không bị chặn', p_label;
END $$;

-- ── Buyer A tự sửa từng cột hệ thống → bị chặn ─────────────────────────
SELECT pg_temp.login('buyer.a@langnghe.test');

SELECT pg_temp.expect_forbidden('buyer sửa credit_balance',
    $q$UPDATE buyer_profiles SET credit_balance = credit_balance + 100 WHERE user_id = auth.uid()$q$);
SELECT pg_temp.expect_forbidden('buyer sửa quota_used_this_month',
    $q$UPDATE buyer_profiles SET quota_used_this_month = quota_used_this_month + 1 WHERE user_id = auth.uid()$q$);
SELECT pg_temp.expect_forbidden('buyer sửa quota_reset_at',
    $q$UPDATE buyer_profiles SET quota_reset_at = '2000-01-01' WHERE user_id = auth.uid()$q$);
SELECT pg_temp.expect_forbidden('buyer sửa trust_score',
    $q$UPDATE buyer_profiles SET trust_score = CASE WHEN trust_score = 100 THEN 99 ELSE trust_score + 1 END WHERE user_id = auth.uid()$q$);
SELECT pg_temp.expect_forbidden('buyer sửa risk_score',
    $q$UPDATE buyer_profiles SET risk_score = CASE WHEN risk_score = 0 THEN 1 ELSE risk_score - 1 END WHERE user_id = auth.uid()$q$);
SELECT pg_temp.expect_forbidden('buyer sửa verified_at',
    $q$UPDATE buyer_profiles SET verified_at = '2000-01-01' WHERE user_id = auth.uid()$q$);

-- ── Buyer A sửa hồ sơ bình thường → vẫn được (như ProfileForm) ──────────
DO $$
DECLARE
    v_rows INT;
BEGIN
    UPDATE buyer_profiles
    SET company_name = company_name || ' (sửa)', city = 'Đà Nẵng', address = 'test', tax_code = '0100000009'
    WHERE user_id = auth.uid();
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'FAIL  buyer sửa hồ sơ — cập nhật % dòng, cần 1', v_rows;
    END IF;
    RAISE NOTICE 'PASS  buyer vẫn sửa được tên công ty, thành phố, địa chỉ, MST';
END $$;

-- ── Buyer tạo hồ sơ mới với credit tự đặt → bị chặn ────────────────────
-- (buyer B đã có hồ sơ; trigger BEFORE INSERT chạy trước ràng buộc unique.)
SELECT pg_temp.login('buyer.b@langnghe.test');
SELECT pg_temp.expect_forbidden('buyer tạo hồ sơ với credit_balance = 999',
    $q$INSERT INTO buyer_profiles (user_id, company_name, credit_balance) VALUES (auth.uid(), 'x', 999)$q$);

-- ── Gửi RFQ qua create_rfq (SECURITY DEFINER) → vẫn trừ quota ──────────
DO $$
DECLARE
    v_before   INT;
    v_after    INT;
    v_supplier UUID := current_setting('test.xuong_a_supplier')::UUID;
BEGIN
    SELECT quota_used_this_month INTO v_before FROM buyer_profiles WHERE user_id = auth.uid();

    PERFORM public.create_rfq('RFQ test 1.1', NULL, 10, 'cái', NULL, NULL, NULL,
                              'single', NULL, ARRAY[v_supplier]);

    SELECT quota_used_this_month INTO v_after FROM buyer_profiles WHERE user_id = auth.uid();
    IF v_after <> v_before + 1 THEN
        RAISE EXCEPTION 'FAIL  create_rfq — quota % → %, cần tăng 1', v_before, v_after;
    END IF;
    RAISE NOTICE 'PASS  gửi RFQ vẫn trừ quota (% → %)', v_before, v_after;
END $$;

-- ── Admin duyệt xác minh → verified_at vẫn được đặt ────────────────────
RESET ROLE;
INSERT INTO verifications (entity_type, entity_id, status, attempt_number)
SELECT 'buyer', bp.id, 'pending',
       COALESCE((SELECT MAX(attempt_number) FROM verifications v
                 WHERE v.entity_type = 'buyer' AND v.entity_id = bp.id), 0) + 1
FROM buyer_profiles bp JOIN auth.users u ON u.id = bp.user_id
WHERE u.email = 'buyer.b@langnghe.test';

SELECT pg_temp.login('admin@langnghe.test');
DO $$
DECLARE
    v_verified TIMESTAMP;
BEGIN
    -- Từ 20261005092200 admin duyệt qua hàm (không UPDATE thẳng verifications).
    PERFORM public.admin_review_verification(v.id, TRUE)
    FROM verifications v
    WHERE v.entity_type = 'buyer' AND v.status = 'pending'
      AND v.entity_id = current_setting('test.buyer_b_profile')::UUID;

    SELECT verified_at INTO v_verified
    FROM buyer_profiles WHERE id = current_setting('test.buyer_b_profile')::UUID;
    IF v_verified IS NULL THEN
        RAISE EXCEPTION 'FAIL  admin duyệt xác minh — verified_at vẫn trống';
    END IF;
    RAISE NOTICE 'PASS  admin duyệt xác minh vẫn đặt verified_at';
END $$;

-- ── Admin sửa trực tiếp cột hệ thống → được ────────────────────────────
DO $$
BEGIN
    UPDATE buyer_profiles SET trust_score = 90
    WHERE id = current_setting('test.buyer_b_profile')::UUID;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL  admin sửa trust_score — không cập nhật được dòng nào';
    END IF;
    RAISE NOTICE 'PASS  admin vẫn sửa được trust_score';
END $$;

DO $$ BEGIN RAISE NOTICE '1.1: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

-- SQL Editor không hiện NOTICE: dòng này chỉ hiện khi mọi ca ở trên đều đạt.
SELECT '1.1: TẤT CẢ ĐẠT (11 ca)' AS ket_qua;
