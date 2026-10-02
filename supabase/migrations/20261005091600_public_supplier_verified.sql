-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 2.6: public_supplier_profiles thêm cột verified.
--
-- Trang gian hàng cần huy hiệu "đã xác minh" cho mọi xưởng, kể cả xưởng
-- chưa có sản phẩm (product_cards.supplier_verified chỉ có khi có sản
-- phẩm). Khách không đọc được bảng verifications, nên cờ này tính trong
-- view công khai. Chỉ thêm cột vào cuối view — code đang dùng view không đổi.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'public_supplier_profiles' AND column_name = 'slug') THEN
        RAISE EXCEPTION 'Thiếu public_supplier_profiles.slug. Chạy 20261005091200 (2.1b) trước.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'public_supplier_profiles' AND column_name = 'verified') THEN
        RAISE EXCEPTION 'public_supplier_profiles.verified đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE OR REPLACE VIEW public.public_supplier_profiles
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
    sp.slug,
    EXISTS (SELECT 1 FROM public.verifications v
            WHERE v.entity_type = 'supplier' AND v.entity_id = sp.id
              AND v.status = 'approved') AS verified
FROM public.supplier_profiles sp
WHERE public.supplier_is_public(sp.id);

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — public_supplier_profiles.verified';
END $$;

COMMIT;
