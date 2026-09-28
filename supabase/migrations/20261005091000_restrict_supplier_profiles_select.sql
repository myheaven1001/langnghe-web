-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- FIX BẢO MẬT (kế hoạch 1.4), phần 2/2 — THU HẸP: bảng gốc
-- supplier_profiles chỉ đọc bởi chính xưởng, admin, buyer có quan hệ
-- (đơn hàng / RFQ gửi tới / báo giá — buyer_related_to_supplier).
-- Mọi chỗ hiện xưởng với người chưa có quan hệ dùng public_supplier_profiles
-- (20261005090900). Chỉ chạy SAU KHI app dùng view đã lên production.
-- Xem lỗ hổng ở đầu 20261005090900_public_supplier_profiles_view.sql.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.public_supplier_profiles') IS NULL
       OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'buyer_related_to_supplier') THEN
        RAISE EXCEPTION 'Chạy 20261005090900_public_supplier_profiles_view.sql trước.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'supplier_profiles'
                   AND policyname = 'supplier_profiles_select_all') THEN
        RAISE EXCEPTION 'Không còn supplier_profiles_select_all. Migration này đã chạy rồi?';
    END IF;
END $$;

-- ── Thu hẹp quyền đọc bảng gốc ─────────────────────────────────────────
DROP POLICY supplier_profiles_select_all ON public.supplier_profiles;
CREATE POLICY supplier_profiles_select ON public.supplier_profiles
    FOR SELECT USING (
        user_id = auth.uid()
        OR public.is_admin()
        OR public.buyer_related_to_supplier(id)
    );

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — public_supplier_profiles + supplier_profiles chỉ đọc bởi chủ, admin, buyer có quan hệ';
END $$;

COMMIT;
