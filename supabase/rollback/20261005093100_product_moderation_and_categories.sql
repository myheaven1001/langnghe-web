-- Quay lui 20261005093100_product_moderation_and_categories.sql (xem README.md).
-- Sản phẩm đang bị khoá được chuyển về 'paused' (mất lý do khoá). Danh mục đã
-- tạo/sửa giữ nguyên. Quay lui web về bản trước 4.11 TRƯỚC khi chạy file này.
BEGIN;

DROP FUNCTION IF EXISTS public.admin_save_category(UUID, TEXT, UUID, TEXT, INT, BOOLEAN);
DROP FUNCTION IF EXISTS public.admin_moderate_product(UUID, TEXT, TEXT);

DROP TRIGGER IF EXISTS trg_guard_blocked_product ON public.products;
DROP FUNCTION IF EXISTS public.guard_blocked_product();

UPDATE public.products SET status = 'paused' WHERE status::TEXT = 'blocked';

ALTER TABLE public.products
    DROP COLUMN IF EXISTS moderation_note,
    DROP COLUMN IF EXISTS moderated_by,
    DROP COLUMN IF EXISTS moderated_at;

-- Bản 20260905121000.
CREATE POLICY categories_modify_admin ON public.categories
    FOR ALL USING (public.is_admin());

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005093100';

COMMIT;
