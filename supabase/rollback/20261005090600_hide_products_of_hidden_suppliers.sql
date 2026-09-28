-- Quay lui 20261005090600_hide_products_of_hidden_suppliers.sql (xem README.md).
-- Đưa 4 quy tắc đọc về đúng bản cũ (20260905121000, 20260923090000) rồi xoá
-- 3 hàm trợ giúp.
BEGIN;

DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products
    FOR SELECT USING (
        status = 'active'
        OR public.is_admin()
        OR EXISTS (
            SELECT 1 FROM supplier_profiles sp
            WHERE sp.id = products.supplier_id
              AND sp.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS price_tiers_select ON public.price_tiers;
CREATE POLICY price_tiers_select ON public.price_tiers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM products p
            WHERE p.id = price_tiers.product_id
              AND (p.status = 'active' OR public.is_admin()
                   OR EXISTS (SELECT 1 FROM supplier_profiles sp
                              WHERE sp.id = p.supplier_id
                                AND sp.user_id = auth.uid()))
        )
    );

DROP POLICY IF EXISTS product_variants_select ON public.product_variants;
CREATE POLICY product_variants_select ON public.product_variants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM products p
            WHERE p.id = product_variants.product_id
              AND (p.status = 'active' OR public.is_admin()
                   OR EXISTS (SELECT 1 FROM supplier_profiles sp
                              WHERE sp.id = p.supplier_id
                                AND sp.user_id = auth.uid()))
        )
    );

DROP POLICY IF EXISTS product_media_select ON public.product_media;
CREATE POLICY product_media_select ON public.product_media
    FOR SELECT USING (
        status = 'ready'
        OR public.is_admin()
        OR EXISTS (
            SELECT 1 FROM products p
            JOIN supplier_profiles sp ON sp.id = p.supplier_id
            WHERE p.id = product_media.product_id
              AND sp.user_id = auth.uid()
        )
    );

DROP FUNCTION IF EXISTS public.is_product_owner(UUID);
DROP FUNCTION IF EXISTS public.product_is_public(UUID);
DROP FUNCTION IF EXISTS public.supplier_is_public(UUID);

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005090600';

COMMIT;
