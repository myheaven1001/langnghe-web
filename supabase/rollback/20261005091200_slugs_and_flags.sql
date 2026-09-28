-- Quay lui 20261005091200_slugs_and_flags.sql (xem README.md).
-- Xoá cột mới (mất slug, cờ nổi bật, icon đã đặt) — chỉ dùng khi chưa có
-- code nào đọc các cột này.
BEGIN;

DROP TRIGGER IF EXISTS trg_product_system_fields ON public.products;
DROP TRIGGER IF EXISTS trg_supplier_slug ON public.supplier_profiles;
DROP FUNCTION IF EXISTS public.set_product_system_fields();
DROP FUNCTION IF EXISTS public.set_supplier_slug();

-- View 1.4 không có cột slug: tạo lại trước khi xoá cột.
DROP VIEW IF EXISTS public.public_supplier_profiles;
CREATE VIEW public.public_supplier_profiles
WITH (security_invoker = false)
AS
SELECT sp.id, sp.shop_name, sp.village_origin, sp.craft_category, sp.founding_year,
       sp.monthly_capacity, sp.membership_tier, sp.rating_avg, sp.total_orders,
       sp.response_rate, sp.on_time_rate, sp.logo_url, sp.banner_url,
       CASE WHEN sp.show_phone_public THEN sp.contact_phone END AS contact_phone,
       CASE WHEN sp.show_phone_public THEN sp.contact_zalo  END AS contact_zalo,
       sp.working_hours, sp.website_url, sp.allow_direct_message,
       sp.preferred_carriers, sp.default_processing_days, sp.created_at
FROM public.supplier_profiles sp
WHERE public.supplier_is_public(sp.id);
REVOKE ALL ON public.public_supplier_profiles FROM PUBLIC;
GRANT SELECT ON public.public_supplier_profiles TO anon, authenticated;

ALTER TABLE public.products          DROP COLUMN IF EXISTS slug;
ALTER TABLE public.products          DROP COLUMN IF EXISTS is_featured;
ALTER TABLE public.supplier_profiles DROP COLUMN IF EXISTS slug;
ALTER TABLE public.product_variants  DROP COLUMN IF EXISTS is_active;
ALTER TABLE public.categories        DROP COLUMN IF EXISTS icon;
ALTER TABLE public.categories        DROP COLUMN IF EXISTS is_active;
DROP FUNCTION IF EXISTS public.make_slug(TEXT, UUID);

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005091200';

COMMIT;
