-- Quay lui 20261005091600_public_supplier_verified.sql (xem README.md).
-- Bỏ cột verified khỏi view (phải DROP rồi tạo lại — không bỏ cột bằng
-- CREATE OR REPLACE được). Trang gian hàng đọc cột này sẽ lỗi — quay lui code
-- cùng lúc.
BEGIN;

DROP VIEW public.public_supplier_profiles;
CREATE VIEW public.public_supplier_profiles
WITH (security_invoker = false)
AS
SELECT
    sp.id,
    sp.shop_name,
    sp.village_origin,
    sp.craft_category,
    sp.founding_year,
    sp.monthly_capacity,
    sp.membership_tier,
    sp.rating_avg,
    sp.total_orders,
    sp.response_rate,
    sp.on_time_rate,
    sp.logo_url,
    sp.banner_url,
    CASE WHEN sp.show_phone_public THEN sp.contact_phone END AS contact_phone,
    CASE WHEN sp.show_phone_public THEN sp.contact_zalo  END AS contact_zalo,
    sp.working_hours,
    sp.website_url,
    sp.allow_direct_message,
    sp.preferred_carriers,
    sp.default_processing_days,
    sp.created_at,
    sp.slug
FROM public.supplier_profiles sp
WHERE public.supplier_is_public(sp.id);
REVOKE ALL ON public.public_supplier_profiles FROM PUBLIC;
GRANT SELECT ON public.public_supplier_profiles TO anon, authenticated;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005091600';

COMMIT;
