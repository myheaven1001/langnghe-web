-- Test kế hoạch 4.11: kiểm duyệt sản phẩm (blocked) và quản lý danh mục qua
-- hàm admin_*.
--
-- Chạy trên STAGING sau `npm run seed:staging`. Dán cả file vào SQL Editor
-- rồi Run, hoặc psql -v ON_ERROR_STOP=1 -f.
-- Đạt: kết quả cuối là "4.11: TẤT CẢ ĐẠT (20 ca)". Hỏng: "FAIL …".
-- Cả file ROLLBACK ở cuối: không đổi dữ liệu.
-- Chạy lại thêm 2.2 và 4.5 (save_product cùng đụng bảng products).

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
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', TRUE);
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

-- Sản phẩm đang bán của xưởng A (từ seed) + danh mục gốm.
DO $$
DECLARE
    v_product UUID;
BEGIN
    SELECT p.id INTO v_product
    FROM products p
    JOIN supplier_profiles sp ON sp.id = p.supplier_id
    JOIN auth.users u ON u.id = sp.user_id
    WHERE u.email = 'xuong.a@langnghe.test' AND p.status = 'active'
    ORDER BY p.created_at LIMIT 1;
    IF v_product IS NULL THEN
        RAISE EXCEPTION 'Xưởng A chưa có sản phẩm đang bán — chạy npm run seed:staging trước.';
    END IF;
    DELETE FROM admin_audit_log;
    PERFORM set_config('test.product', v_product::TEXT, TRUE),
            set_config('test.cat', (SELECT id::TEXT FROM categories WHERE slug = 'gom-su'), TRUE);
END $$;

-- ── Người không phải admin ─────────────────────────────────────────────
SELECT pg_temp.login('xuong.b@langnghe.test');
SELECT pg_temp.expect_error('xưởng khác khoá sản phẩm của đối thủ', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_moderate_product(current_setting('test.product')::UUID, 'block', 'x')$q$);
SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.expect_error('xưởng tự đặt sản phẩm của mình thành blocked', 'PRODUCT_BLOCKED',
    $q$UPDATE products SET status = 'blocked' WHERE id = current_setting('test.product')::UUID$q$);
SELECT pg_temp.expect_error('xưởng tạo danh mục', 'FORBIDDEN_NOT_ADMIN',
    $q$SELECT public.admin_save_category(NULL, 'Danh mục lậu')$q$);

-- ── Admin khoá sản phẩm ────────────────────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
SELECT pg_temp.expect_error('khoá không ghi lý do', 'REASON_REQUIRED',
    $q$SELECT public.admin_moderate_product(current_setting('test.product')::UUID, 'block', '  ')$q$);
SELECT pg_temp.expect_error('admin UPDATE thẳng status = blocked', 'PRODUCT_BLOCKED',
    $q$UPDATE products SET status = 'blocked' WHERE id = current_setting('test.product')::UUID$q$);
SELECT public.admin_moderate_product(current_setting('test.product')::UUID, 'block', 'Ảnh lấy từ nguồn khác');
SELECT pg_temp.check('khoá: status blocked, có lý do, người khoá, nhật ký product.block',
    (SELECT status = 'blocked' AND moderation_note = 'Ảnh lấy từ nguồn khác'
            AND moderated_by = auth.uid() AND moderated_at IS NOT NULL
     FROM products WHERE id = current_setting('test.product')::UUID)
    AND (SELECT count(*) = 1 FROM admin_audit_log
         WHERE action = 'product.block' AND entity_id = current_setting('test.product')),
    'khoá sản phẩm sai');

-- ── Sản phẩm bị khoá: khách không thấy, xưởng không sửa được ───────────
SELECT pg_temp.as_anon();
SELECT pg_temp.check('khách không thấy sản phẩm bị khoá',
    (SELECT count(*) = 0 FROM products WHERE id = current_setting('test.product')::UUID)
    AND (SELECT count(*) = 0 FROM product_cards WHERE id = current_setting('test.product')::UUID),
    'khách vẫn thấy sản phẩm');

SELECT pg_temp.login('xuong.a@langnghe.test');
SELECT pg_temp.check('xưởng vẫn thấy sản phẩm của mình kèm lý do khoá',
    (SELECT moderation_note = 'Ảnh lấy từ nguồn khác' FROM products
     WHERE id = current_setting('test.product')::UUID),
    'xưởng không thấy lý do');
SELECT pg_temp.expect_error('xưởng tự bật bán lại sản phẩm bị khoá', 'PRODUCT_BLOCKED',
    $q$UPDATE products SET status = 'active' WHERE id = current_setting('test.product')::UUID$q$);
SELECT pg_temp.expect_error('xưởng sửa sản phẩm bị khoá qua save_product', 'PRODUCT_BLOCKED',
    $q$SELECT public.save_product(current_setting('test.product')::UUID,
          jsonb_build_object('name', 'Đổi tên lách khoá', 'category_id', current_setting('test.cat'),
                             'min_order_qty', 10, 'lead_time_days', 5, 'status', 'active'))$q$);
SELECT pg_temp.expect_error('xưởng xoá sản phẩm bị khoá', 'PRODUCT_BLOCKED',
    $q$DELETE FROM products WHERE id = current_setting('test.product')::UUID$q$);

-- ── Admin mở khoá ──────────────────────────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
SELECT public.admin_moderate_product(current_setting('test.product')::UUID, 'unblock');
SELECT pg_temp.check('mở khoá: về tạm dừng, xoá lý do, nhật ký product.unblock',
    (SELECT status = 'paused' AND moderation_note IS NULL FROM products
     WHERE id = current_setting('test.product')::UUID)
    AND (SELECT count(*) = 1 FROM admin_audit_log
         WHERE action = 'product.unblock' AND entity_id = current_setting('test.product')),
    'mở khoá sai');
SELECT pg_temp.login('xuong.a@langnghe.test');
UPDATE products SET status = 'active' WHERE id = current_setting('test.product')::UUID;
SELECT pg_temp.check('sau khi mở khoá xưởng tự bật bán lại được',
    (SELECT status = 'active' FROM products WHERE id = current_setting('test.product')::UUID),
    'không bật bán lại được');

-- ── Danh mục ───────────────────────────────────────────────────────────
SELECT pg_temp.login('admin@langnghe.test');
SELECT set_config('test.new_cat', public.admin_save_category(NULL, 'Đồ đồng test 4.11', NULL, '🔔', 50)::TEXT, TRUE);
SELECT pg_temp.check('tạo danh mục gốc: có slug không dấu, đang hiện',
    (SELECT slug = 'do-dong-test-4-11' AND is_active AND parent_id IS NULL AND icon = '🔔'
     FROM categories WHERE id = current_setting('test.new_cat')::UUID),
    (SELECT slug FROM categories WHERE id = current_setting('test.new_cat')::UUID));
SELECT set_config('test.child', public.admin_save_category(NULL, 'Lư hương', current_setting('test.new_cat')::UUID)::TEXT, TRUE);
SELECT pg_temp.expect_error('danh mục cháu (cha không phải danh mục gốc)', 'INVALID_PARENT',
    $q$SELECT public.admin_save_category(NULL, 'Lư hương mini', current_setting('test.child')::UUID)$q$);
SELECT pg_temp.expect_error('danh mục đang có con chuyển thành con', 'INVALID_PARENT',
    $q$SELECT public.admin_save_category(current_setting('test.new_cat')::UUID, 'Đồ đồng test 4.11',
                                         current_setting('test.cat')::UUID)$q$);
SELECT pg_temp.expect_error('trùng tên trong cùng danh mục cha', 'CATEGORY_NAME_TAKEN',
    $q$SELECT public.admin_save_category(NULL, 'lư hương', current_setting('test.new_cat')::UUID)$q$);
SELECT public.admin_save_category(current_setting('test.new_cat')::UUID, 'Đồ đồng mỹ nghệ', NULL, '🔔', 50, FALSE);
SELECT pg_temp.check('đổi tên + ẩn: slug giữ nguyên, is_active = false, có 3 dòng nhật ký danh mục',
    (SELECT name = 'Đồ đồng mỹ nghệ' AND slug = 'do-dong-test-4-11' AND NOT is_active
     FROM categories WHERE id = current_setting('test.new_cat')::UUID)
    AND (SELECT count(*) = 3 FROM admin_audit_log WHERE entity_type = 'category'),
    'sửa danh mục sai');
SELECT pg_temp.expect_error('admin INSERT thẳng vào categories', 'DENIED',
    $q$INSERT INTO categories (name, slug) VALUES ('Lậu', 'lau-411')$q$);
DO $$
DECLARE
    v_rows INT;
BEGIN
    DELETE FROM categories WHERE id = current_setting('test.child')::UUID;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN
        RAISE EXCEPTION 'FAIL  admin xoá thẳng danh mục — xoá được % dòng', v_rows;
    END IF;
    RAISE NOTICE 'PASS  admin xoá thẳng danh mục → không xoá được';
END $$;

DO $$ BEGIN RAISE NOTICE '4.11: TẤT CẢ ĐẠT'; END $$;

ROLLBACK;

SELECT '4.11: TẤT CẢ ĐẠT (20 ca)' AS ket_qua;
