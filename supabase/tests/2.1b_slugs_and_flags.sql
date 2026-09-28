-- Test kế hoạch 2.1b: slug sản phẩm/xưởng, is_featured chỉ admin đặt, icon
-- danh mục, is_active biến thể.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "2.1b: TẤT CẢ ĐẠT (10 ca)". Hỏng: "FAIL …".
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

CREATE FUNCTION pg_temp.check(p_label TEXT, p_ok BOOLEAN, p_detail TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'FAIL  % — %', p_label, p_detail;
    END IF;
    RAISE NOTICE 'PASS  %', p_label;
END $$;

-- ── Dữ liệu đang có ────────────────────────────────────────────────────
SELECT pg_temp.check('mọi sản phẩm và xưởng có slug, không trùng',
    (SELECT count(*) = count(DISTINCT slug) AND bool_and(slug IS NOT NULL) FROM products)
    AND (SELECT count(*) = count(DISTINCT slug) AND bool_and(slug IS NOT NULL) FROM supplier_profiles),
    'có slug trống hoặc trùng');

SELECT pg_temp.check('slug sản phẩm cũ đúng dạng tên-bỏ-dấu-8-ký-tự',
    (SELECT slug ~ '^binh-hoa-gom-men-ran-cao-30cm-[0-9a-f]{8}$'
     FROM products WHERE name = 'Bình hoa gốm men rạn cao 30cm'),
    (SELECT slug FROM products WHERE name = 'Bình hoa gốm men rạn cao 30cm'));

SELECT pg_temp.check('10 danh mục có icon',
    (SELECT count(*) FROM categories WHERE icon IS NOT NULL) = 10,
    (SELECT count(*)::TEXT || ' danh mục có icon' FROM categories WHERE icon IS NOT NULL));

-- ── Xưởng A tạo và sửa sản phẩm ────────────────────────────────────────
SELECT pg_temp.login('xuong.a@langnghe.test');
INSERT INTO products (supplier_id, name, status, slug, is_featured)
SELECT id, 'Đĩa đồng Đông Sơn', 'draft', 'slug-tu-dat', TRUE
FROM supplier_profiles WHERE user_id = auth.uid();

SELECT pg_temp.check('sản phẩm mới tự sinh slug (đ → d), bỏ slug người dùng gửi',
    (SELECT slug ~ '^dia-dong-dong-son-[0-9a-f]{8}$' FROM products WHERE name = 'Đĩa đồng Đông Sơn'),
    (SELECT slug FROM products WHERE name = 'Đĩa đồng Đông Sơn'));
SELECT pg_temp.check('xưởng không tự đặt sản phẩm nổi bật khi tạo',
    (SELECT NOT is_featured FROM products WHERE name = 'Đĩa đồng Đông Sơn'), 'is_featured = TRUE');

UPDATE products SET name = 'Đĩa đồng Đông Sơn (mới)', slug = 'doi-slug', is_featured = TRUE
WHERE name = 'Đĩa đồng Đông Sơn';
SELECT pg_temp.check('đổi tên không đổi slug; xưởng không tự đặt slug',
    (SELECT slug ~ '^dia-dong-dong-son-[0-9a-f]{8}$' FROM products WHERE name = 'Đĩa đồng Đông Sơn (mới)'),
    (SELECT slug FROM products WHERE name = 'Đĩa đồng Đông Sơn (mới)'));
SELECT pg_temp.check('xưởng không tự bật nổi bật khi sửa',
    (SELECT NOT is_featured FROM products WHERE name = 'Đĩa đồng Đông Sơn (mới)'), 'is_featured = TRUE');

-- ── Admin bật nổi bật ──────────────────────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
UPDATE products SET is_featured = TRUE WHERE name = 'Bình hoa gốm men rạn cao 30cm';
SELECT pg_temp.check('admin bật được sản phẩm nổi bật',
    (SELECT is_featured FROM products WHERE name = 'Bình hoa gốm men rạn cao 30cm'), 'is_featured = FALSE');

-- ── Biến thể, view công khai ───────────────────────────────────────────
RESET ROLE;
SELECT pg_temp.check('biến thể mặc định đang bán (is_active)',
    (SELECT column_default = 'true' FROM information_schema.columns
     WHERE table_name = 'product_variants' AND column_name = 'is_active'),
    'mặc định không phải true');

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', TRUE);
SET LOCAL ROLE anon;
SELECT pg_temp.check('khách đọc được slug xưởng qua view công khai',
    (SELECT bool_and(slug IS NOT NULL) AND count(*) >= 1 FROM public_supplier_profiles), 'thiếu slug');

DO $$ BEGIN RAISE NOTICE '2.1b: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '2.1b: TẤT CẢ ĐẠT (10 ca)' AS ket_qua;
