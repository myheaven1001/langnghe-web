-- Test kế hoạch 1.6: sản phẩm của xưởng bị ẩn/khoá không hiện với người ngoài;
-- ảnh của sản phẩm nháp không công khai.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào Supabase
-- Dashboard → SQL Editor rồi Run, hoặc:
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/1.6_hide_products_of_hidden_suppliers.sql
-- Đạt: kết quả cuối là "1.6: TẤT CẢ ĐẠT (11 ca)" (psql còn in NOTICE "PASS …").
-- Hỏng: dừng ở ca đầu tiên sai với thông báo "FAIL …".
-- Cả file chạy trong một transaction và ROLLBACK ở cuối: không đổi dữ liệu.
--
-- Mỗi ca so "số dòng thấy được" dạng sảnphẩm/bậcgiá/biếnthể/ảnh.

BEGIN;

-- ── Dữ liệu riêng cho test: 2 sản phẩm của xưởng B ─────────────────────
--   sp_active  active, 2 bậc giá, 1 biến thể, 1 ảnh ready
--   sp_draft   draft, 1 ảnh ready
DO $$
DECLARE
    v_xb      UUID;
    v_xb_user UUID;
    v_active  UUID;
    v_draft   UUID;
BEGIN
    SELECT sp.id, sp.user_id INTO v_xb, v_xb_user
    FROM supplier_profiles sp JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.b@langnghe.test';
    IF v_xb IS NULL THEN
        RAISE EXCEPTION 'Thiếu xuong.b — chạy npm run seed:staging trước.';
    END IF;

    INSERT INTO products (supplier_id, name, status) VALUES (v_xb, 'SP test 1.6', 'active')
    RETURNING id INTO v_active;
    INSERT INTO price_tiers (product_id, min_qty, max_qty, unit_price) VALUES
        (v_active, 10, 99, 50000), (v_active, 100, NULL, 45000);
    INSERT INTO product_variants (product_id, color) VALUES (v_active, 'Nâu');
    INSERT INTO product_media (product_id, status, r2_key) VALUES (v_active, 'ready', 'test/1.6-active.jpg');

    INSERT INTO products (supplier_id, name, status) VALUES (v_xb, 'SP nháp test 1.6', 'draft')
    RETURNING id INTO v_draft;
    INSERT INTO product_media (product_id, status, r2_key) VALUES (v_draft, 'ready', 'test/1.6-draft.jpg');

    PERFORM set_config('test.sp_active', v_active::TEXT, TRUE),
            set_config('test.sp_draft', v_draft::TEXT, TRUE),
            set_config('test.xb', v_xb::TEXT, TRUE),
            set_config('test.xb_user', v_xb_user::TEXT, TRUE);
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

-- Khách chưa đăng nhập (trang công khai dùng anon key).
CREATE FUNCTION pg_temp.as_anon() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', TRUE);
    SET LOCAL ROLE anon;
END $$;

-- Số dòng người đang giả lập thấy được của một sản phẩm.
CREATE FUNCTION pg_temp.visible(p_product UUID) RETURNS TEXT LANGUAGE sql AS $$
    SELECT (SELECT count(*) FROM products WHERE id = p_product) || '/' ||
           (SELECT count(*) FROM price_tiers WHERE product_id = p_product) || '/' ||
           (SELECT count(*) FROM product_variants WHERE product_id = p_product) || '/' ||
           (SELECT count(*) FROM product_media WHERE product_id = p_product);
$$;

CREATE FUNCTION pg_temp.expect_visible(p_label TEXT, p_setting TEXT, p_expected TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_got TEXT := pg_temp.visible(current_setting(p_setting)::UUID);
BEGIN
    IF v_got <> p_expected THEN
        RAISE EXCEPTION 'FAIL  % — thấy % (sản phẩm/bậc giá/biến thể/ảnh), cần %', p_label, v_got, p_expected;
    END IF;
    RAISE NOTICE 'PASS  % (%)', p_label, v_got;
END $$;

-- ── Xưởng B công khai ──────────────────────────────────────────────────
SELECT pg_temp.as_anon();
SELECT pg_temp.expect_visible('khách thấy sản phẩm của xưởng đang mở', 'test.sp_active', '1/2/1/1');

-- ── Xưởng B bật "Ẩn gian hàng" ─────────────────────────────────────────
RESET ROLE;
UPDATE supplier_profiles SET is_hidden = TRUE WHERE id = current_setting('test.xb')::UUID;

SELECT pg_temp.as_anon();
SELECT pg_temp.expect_visible('khách không thấy gì của xưởng đã ẩn', 'test.sp_active', '0/0/0/0');
SELECT pg_temp.login('buyer.a@langnghe.test');
SELECT pg_temp.expect_visible('buyer không thấy gì của xưởng đã ẩn', 'test.sp_active', '0/0/0/0');
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_visible('xưởng khác không thấy gì của xưởng đã ẩn', 'test.sp_active', '0/0/0/0');
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.expect_visible('xưởng B vẫn thấy hàng của mình khi ẩn', 'test.sp_active', '1/2/1/1');
SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.expect_visible('admin vẫn thấy hàng của xưởng đã ẩn', 'test.sp_active', '1/2/1/1');

-- ── Xưởng B bị khoá tài khoản (bỏ ẩn) ──────────────────────────────────
RESET ROLE;
UPDATE supplier_profiles SET is_hidden = FALSE WHERE id = current_setting('test.xb')::UUID;
UPDATE users SET status = 'suspended' WHERE id = current_setting('test.xb_user')::UUID;

SELECT pg_temp.as_anon();
SELECT pg_temp.expect_visible('khách không thấy gì của xưởng bị khoá', 'test.sp_active', '0/0/0/0');

RESET ROLE;
UPDATE users SET status = 'active' WHERE id = current_setting('test.xb_user')::UUID;
SELECT pg_temp.as_anon();
SELECT pg_temp.expect_visible('mở khoá → khách thấy lại', 'test.sp_active', '1/2/1/1');

-- ── Sản phẩm nháp ──────────────────────────────────────────────────────
SELECT pg_temp.expect_visible('khách không thấy ảnh của sản phẩm nháp', 'test.sp_draft', '0/0/0/0');
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.expect_visible('xưởng B thấy sản phẩm nháp và ảnh của mình', 'test.sp_draft', '1/0/0/1');

-- ── Xưởng A không bị ảnh hưởng ─────────────────────────────────────────
SELECT pg_temp.as_anon();
DO $$
DECLARE
    v_n INT;
BEGIN
    SELECT count(*) INTO v_n
    FROM products p JOIN price_tiers t ON t.product_id = p.id
    WHERE p.name = 'Bình hoa gốm men rạn cao 30cm';
    IF v_n <> 3 THEN
        RAISE EXCEPTION 'FAIL  khách thấy % bậc giá của sản phẩm xưởng A, cần 3', v_n;
    END IF;
    RAISE NOTICE 'PASS  sản phẩm xưởng A vẫn hiện đủ với khách';
END $$;

DO $$ BEGIN RAISE NOTICE '1.6: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

-- SQL Editor không hiện NOTICE: dòng này chỉ hiện khi mọi ca ở trên đều đạt.
SELECT '1.6: TẤT CẢ ĐẠT (11 ca)' AS ket_qua;
