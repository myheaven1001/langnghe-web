-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- FIX (kế hoạch 1.6): ẩn sản phẩm của xưởng bị ẩn/khoá.
--
-- Vấn đề:
--   - Xưởng bật "Ẩn gian hàng" (supplier_profiles.is_hidden, cài đặt ở
--     /supplier/settings/shop) hoặc bị admin khoá (users.status =
--     'suspended') nhưng sản phẩm active vẫn hiện với mọi người: quy tắc
--     đọc products/price_tiers/product_variants chỉ xét products.status.
--   - product_media_select cho mọi người xem ảnh status = 'ready' của BẤT
--     KỲ sản phẩm nào — kể cả sản phẩm nháp/tạm dừng chưa công khai.
--
-- Sau migration, người ngoài (anon, buyer, xưởng khác) chỉ thấy sản phẩm,
-- bảng giá, biến thể, ảnh khi: sản phẩm 'active' VÀ xưởng không ẩn VÀ tài
-- khoản xưởng 'active' (ảnh còn cần status = 'ready'). Chủ sản phẩm và
-- admin vẫn thấy tất cả như trước.
--
-- Hàm trợ giúp là SECURITY DEFINER (giống is_admin, supplier_quoted_on_rfq
-- ở 20261004090000) để quy tắc không phải đọc supplier_profiles/users qua
-- RLS của chính các bảng đó — tránh lỗi đệ quy 42P17.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'supplier_profiles'
                     AND column_name = 'is_hidden') THEN
        RAISE EXCEPTION 'Thiếu supplier_profiles.is_hidden. Chạy 20260926090000 trước.';
    END IF;
    IF to_regclass('public.product_variants') IS NULL THEN
        RAISE EXCEPTION 'Thiếu product_variants. Chạy 20260923090000 trước.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'supplier_is_public') THEN
        RAISE EXCEPTION 'supplier_is_public() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

-- ── Hàm trợ giúp ────────────────────────────────────────────────────────

-- Xưởng hiện công khai: không bật ẩn gian hàng và tài khoản đang active.
CREATE FUNCTION public.supplier_is_public(p_supplier_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM supplier_profiles sp
        JOIN users u ON u.id = sp.user_id
        WHERE sp.id = p_supplier_id
          AND NOT sp.is_hidden
          AND u.status = 'active'
    );
$$;

-- Sản phẩm hiện công khai: active và xưởng công khai.
CREATE FUNCTION public.product_is_public(p_product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM products p
        WHERE p.id = p_product_id
          AND p.status = 'active'
          AND public.supplier_is_public(p.supplier_id)
    );
$$;

-- Người đang đăng nhập là xưởng sở hữu sản phẩm.
CREATE FUNCTION public.is_product_owner(p_product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM products p
        JOIN supplier_profiles sp ON sp.id = p.supplier_id
        WHERE p.id = p_product_id
          AND sp.user_id = auth.uid()
    );
$$;

-- ── Quy tắc đọc ─────────────────────────────────────────────────────────

DROP POLICY products_select ON public.products;
CREATE POLICY products_select ON public.products
    FOR SELECT USING (
        (status = 'active' AND public.supplier_is_public(supplier_id))
        OR public.is_admin()
        OR EXISTS (                           -- Xưởng xem cả sản phẩm ẩn/nháp của mình
            SELECT 1 FROM supplier_profiles sp
            WHERE sp.id = products.supplier_id
              AND sp.user_id = auth.uid()
        )
    );

DROP POLICY price_tiers_select ON public.price_tiers;
CREATE POLICY price_tiers_select ON public.price_tiers
    FOR SELECT USING (
        public.product_is_public(product_id)
        OR public.is_admin()
        OR public.is_product_owner(product_id)
    );

DROP POLICY product_variants_select ON public.product_variants;
CREATE POLICY product_variants_select ON public.product_variants
    FOR SELECT USING (
        public.product_is_public(product_id)
        OR public.is_admin()
        OR public.is_product_owner(product_id)
    );

DROP POLICY product_media_select ON public.product_media;
CREATE POLICY product_media_select ON public.product_media
    FOR SELECT USING (
        (status = 'ready' AND public.product_is_public(product_id))
        OR public.is_admin()
        OR public.is_product_owner(product_id)
    );

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — sản phẩm/bảng giá/biến thể/ảnh của xưởng ẩn hoặc bị khoá không còn công khai';
END $$;

COMMIT;
