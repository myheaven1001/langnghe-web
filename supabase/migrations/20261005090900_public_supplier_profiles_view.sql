-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- FIX BẢO MẬT (kế hoạch 1.4), phần 1/2 — MỞ RỘNG: view hồ sơ xưởng công
-- khai + hàm buyer_related_to_supplier. Chưa đổi quyền đọc bảng gốc; phần
-- 2/2 (20261005091000) thu hẹp SAU KHI app đã chuyển sang view.
--
-- Lỗ hổng: supplier_profiles_select_all (20260905121000) là USING (TRUE) —
-- ai cũng đọc được MỌI cột của MỌI xưởng, kể cả khách chưa đăng nhập:
-- tax_code, risk_score, trust_score, quote_win_rate, user_id, is_hidden,
-- và contact_phone/contact_zalo của xưởng đã chọn ẩn số điện thoại
-- (show_phone_public = FALSE).
--
-- Sau migration:
--   - View public_supplier_profiles: chỉ cột công khai, số điện thoại/Zalo
--     chỉ khi show_phone_public, bỏ xưởng đang ẩn gian hàng hoặc bị khoá.
--     Dùng cho mọi chỗ hiện xưởng với người chưa có quan hệ (chọn xưởng
--     khi gửi RFQ; sau này trang gian hàng, tìm kiếm — bước 2).
--   - Bảng gốc supplier_profiles chỉ đọc được bởi: chính xưởng, admin,
--     buyer đã có đơn hàng / RFQ gửi tới / báo giá từ xưởng đó.
--
-- View chạy bằng quyền chủ view (security_invoker = false, mặc định) để
-- khách đọc được mà không cần quyền trên bảng gốc — cố ý; cột và dòng đã
-- lọc trong định nghĩa view.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'supplier_is_public') THEN
        RAISE EXCEPTION 'Thiếu supplier_is_public(). Chạy 20261005090600 (1.6) trước.';
    END IF;
    IF to_regclass('public.public_supplier_profiles') IS NOT NULL THEN
        RAISE EXCEPTION 'public_supplier_profiles đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

-- ── View công khai ──────────────────────────────────────────────────────
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
    sp.created_at
FROM public.supplier_profiles sp
WHERE public.supplier_is_public(sp.id);

COMMENT ON VIEW public.public_supplier_profiles IS
    'Hồ sơ xưởng công khai (kế hoạch 1.4): không có tax_code, risk_score,
     trust_score, quote_win_rate, user_id, cờ ẩn; điện thoại/Zalo chỉ khi
     show_phone_public; bỏ xưởng ẩn gian hàng hoặc bị khoá.';

REVOKE ALL ON public.public_supplier_profiles FROM PUBLIC;
GRANT SELECT ON public.public_supplier_profiles TO anon, authenticated;

-- ── Buyer có quan hệ với xưởng ─────────────────────────────────────────
CREATE FUNCTION public.buyer_related_to_supplier(p_supplier_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM orders o
        JOIN buyer_profiles bp ON bp.id = o.buyer_id
        WHERE o.supplier_id = p_supplier_id AND bp.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM rfq_targets t
        JOIN rfq_requests r ON r.id = t.rfq_id
        JOIN buyer_profiles bp ON bp.id = r.buyer_id
        WHERE t.supplier_id = p_supplier_id AND bp.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM rfq_quotes q
        JOIN rfq_requests r ON r.id = q.rfq_id
        JOIN buyer_profiles bp ON bp.id = r.buyer_id
        WHERE q.supplier_id = p_supplier_id AND bp.user_id = auth.uid()
    );
$$;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — public_supplier_profiles + buyer_related_to_supplier (chưa thu hẹp bảng gốc)';
END $$;

COMMIT;
