-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 4.11 (phần 2/2): kiểm duyệt sản phẩm + quản lý danh mục.
--
--   products.moderation_note / moderated_by / moderated_at
--       Lý do sàn khoá sản phẩm, ai khoá, lúc nào.
--   admin_moderate_product(product, 'block' | 'unblock', note)
--       block:   status → 'blocked', bắt buộc lý do. Sản phẩm biến khỏi mọi
--                trang công khai (các trang đó chỉ hiện status = 'active').
--       unblock: status → 'paused' (xưởng tự bật bán lại), xoá lý do.
--       Ghi nhật ký product.block / product.unblock.
--   Trigger guard_blocked_product: với người dùng app (kể cả admin), sản phẩm
--       đang 'blocked' không sửa / xoá được, không ai tự đặt 'blocked' hay
--       sửa các cột kiểm duyệt → PRODUCT_BLOCKED. save_product() của xưởng
--       UPDATE products trước tiên nên cũng bị chặn ở đây.
--   admin_save_category(id, name, parent, icon, sort_order, is_active)
--       Tạo (id NULL) hoặc sửa danh mục. Cây 2 tầng: cha phải là danh mục
--       gốc; danh mục đang có con không chuyển thành con được. Slug tạo khi
--       thêm mới và giữ nguyên khi đổi tên (link cũ không gãy). Không có xoá:
--       ẩn bằng is_active = false. Ghi nhật ký category.create / .update.
--   Bỏ quy tắc categories_modify_admin: admin không ghi thẳng bảng categories.
--
-- Mã lỗi: FORBIDDEN_NOT_ADMIN, PRODUCT_NOT_FOUND, PRODUCT_BLOCKED,
--   INVALID_INPUT, REASON_REQUIRED, CATEGORY_NOT_FOUND, INVALID_PARENT,
--   CATEGORY_NAME_TAKEN.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'product_status' AND e.enumlabel = 'blocked'
    ) THEN
        RAISE EXCEPTION 'product_status thiếu giá trị blocked. Chạy 20261005093000 trước.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_moderate_product') THEN
        RAISE EXCEPTION 'admin_moderate_product() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'assert_admin') THEN
        RAISE EXCEPTION 'Thiếu assert_admin(). Chạy 20261005092000 (3.6) trước.';
    END IF;
END $$;

-- ── Kiểm duyệt sản phẩm ─────────────────────────────────────────────────
ALTER TABLE public.products
    ADD COLUMN moderation_note TEXT,
    ADD COLUMN moderated_by    UUID REFERENCES public.users(id),
    ADD COLUMN moderated_at    TIMESTAMPTZ;

COMMENT ON COLUMN public.products.moderation_note IS
    'Lý do sàn khoá sản phẩm (status = blocked) — xưởng thấy ở danh sách sản phẩm.';

CREATE FUNCTION public.guard_blocked_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Hàm admin_moderate_product (SECURITY DEFINER), service_role, SQL Editor: bỏ qua.
    IF current_user <> 'authenticated' THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF OLD.status = 'blocked' THEN
        RAISE EXCEPTION 'PRODUCT_BLOCKED'
            USING DETAIL = 'Sản phẩm đang bị sàn khoá, không sửa/xoá được.';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    IF NEW.status = 'blocked'
       OR NEW.moderation_note IS DISTINCT FROM OLD.moderation_note
       OR NEW.moderated_by    IS DISTINCT FROM OLD.moderated_by
       OR NEW.moderated_at    IS DISTINCT FROM OLD.moderated_at THEN
        RAISE EXCEPTION 'PRODUCT_BLOCKED'
            USING DETAIL = 'Khoá/mở khoá sản phẩm chỉ làm qua admin_moderate_product().';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_blocked_product
    BEFORE UPDATE OR DELETE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.guard_blocked_product();

CREATE FUNCTION public.admin_moderate_product(p_product_id UUID, p_action TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_product products%ROWTYPE;
    v_note    TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
    PERFORM public.assert_admin();

    IF p_action IS NULL OR p_action NOT IN ('block', 'unblock') THEN
        RAISE EXCEPTION 'INVALID_INPUT';
    END IF;

    SELECT * INTO v_product FROM products WHERE id = p_product_id FOR UPDATE;
    IF NOT FOUND OR v_product.status = 'deleted' THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
    END IF;

    IF p_action = 'block' THEN
        IF v_product.status = 'blocked' THEN
            RAISE EXCEPTION 'INVALID_INPUT' USING DETAIL = 'Sản phẩm đã bị khoá rồi.';
        END IF;
        IF v_note IS NULL THEN
            RAISE EXCEPTION 'REASON_REQUIRED' USING DETAIL = 'Khoá sản phẩm phải ghi lý do.';
        END IF;
        UPDATE products
        SET status = 'blocked', moderation_note = v_note, moderated_by = auth.uid(),
            moderated_at = NOW(), updated_at = NOW()
        WHERE id = p_product_id;
        PERFORM public.log_admin_action('product.block', 'product', p_product_id::TEXT,
            jsonb_build_object('name', v_product.name, 'supplier_id', v_product.supplier_id,
                               'old_status', v_product.status, 'reason', v_note));
        RETURN jsonb_build_object('product_id', p_product_id, 'status', 'blocked');
    END IF;

    IF v_product.status <> 'blocked' THEN
        RAISE EXCEPTION 'INVALID_INPUT' USING DETAIL = 'Sản phẩm không ở trạng thái bị khoá.';
    END IF;
    -- Mở khoá về "tạm dừng": xưởng xem lại rồi tự bật bán.
    UPDATE products
    SET status = 'paused', moderation_note = NULL, moderated_by = auth.uid(),
        moderated_at = NOW(), updated_at = NOW()
    WHERE id = p_product_id;
    PERFORM public.log_admin_action('product.unblock', 'product', p_product_id::TEXT,
        jsonb_build_object('name', v_product.name, 'supplier_id', v_product.supplier_id,
                           'old_reason', v_product.moderation_note, 'note', v_note));
    RETURN jsonb_build_object('product_id', p_product_id, 'status', 'paused');
END;
$$;

-- ── Danh mục ngành hàng ────────────────────────────────────────────────
CREATE FUNCTION public.admin_save_category(
    p_id         UUID,
    p_name       TEXT,
    p_parent_id  UUID DEFAULT NULL,
    p_icon       TEXT DEFAULT NULL,
    p_sort_order INT DEFAULT 0,
    p_is_active  BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_name TEXT := btrim(COALESCE(p_name, ''));
    v_icon TEXT := NULLIF(btrim(COALESCE(p_icon, '')), '');
    v_old  categories%ROWTYPE;
    v_id   UUID := COALESCE(p_id, gen_random_uuid());
    v_slug TEXT;
BEGIN
    PERFORM public.assert_admin();

    IF char_length(v_name) NOT BETWEEN 2 AND 100 OR char_length(COALESCE(v_icon, '')) > 8 THEN
        RAISE EXCEPTION 'INVALID_INPUT' USING DETAIL = 'Tên danh mục dài 2–100 ký tự.';
    END IF;

    IF p_id IS NOT NULL THEN
        SELECT * INTO v_old FROM categories WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'CATEGORY_NOT_FOUND';
        END IF;
    END IF;

    -- Cây 2 tầng.
    IF p_parent_id IS NOT NULL THEN
        IF p_parent_id = v_id
           OR NOT EXISTS (SELECT 1 FROM categories WHERE id = p_parent_id AND parent_id IS NULL)
           OR EXISTS (SELECT 1 FROM categories WHERE parent_id = v_id) THEN
            RAISE EXCEPTION 'INVALID_PARENT'
                USING DETAIL = 'Danh mục cha phải là danh mục gốc; danh mục đang có con không làm con được.';
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM categories
               WHERE id <> v_id AND lower(name) = lower(v_name)
                 AND parent_id IS NOT DISTINCT FROM p_parent_id) THEN
        RAISE EXCEPTION 'CATEGORY_NAME_TAKEN';
    END IF;

    IF p_id IS NULL THEN
        v_slug := NULLIF(left(btrim(regexp_replace(public.vn_unaccent(v_name), '[^a-z0-9]+', '-', 'g'), '-'), 80), '');
        IF v_slug IS NULL OR EXISTS (SELECT 1 FROM categories WHERE slug = v_slug) THEN
            v_slug := public.make_slug(v_name, v_id);
        END IF;
        INSERT INTO categories (id, parent_id, name, slug, sort_order, icon, is_active)
        VALUES (v_id, p_parent_id, v_name, v_slug, COALESCE(p_sort_order, 0), v_icon,
                COALESCE(p_is_active, TRUE));
        PERFORM public.log_admin_action('category.create', 'category', v_id::TEXT,
            jsonb_build_object('name', v_name, 'parent_id', p_parent_id, 'slug', v_slug));
    ELSE
        UPDATE categories
        SET name = v_name, parent_id = p_parent_id, icon = v_icon,
            sort_order = COALESCE(p_sort_order, sort_order),
            is_active = COALESCE(p_is_active, is_active)
        WHERE id = v_id;
        PERFORM public.log_admin_action('category.update', 'category', v_id::TEXT,
            jsonb_build_object('old_name', v_old.name, 'name', v_name,
                               'old_active', v_old.is_active, 'is_active', COALESCE(p_is_active, v_old.is_active),
                               'old_parent_id', v_old.parent_id, 'parent_id', p_parent_id));
    END IF;

    RETURN v_id;
END;
$$;

-- Admin không ghi thẳng bảng categories (và không xoá): chỉ qua hàm trên.
DROP POLICY categories_modify_admin ON public.categories;

REVOKE ALL ON FUNCTION public.admin_moderate_product(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_save_category(UUID, TEXT, UUID, TEXT, INT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_product(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_category(UUID, TEXT, UUID, TEXT, INT, BOOLEAN) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — admin_moderate_product(), guard_blocked_product, admin_save_category()';
END $$;

COMMIT;
