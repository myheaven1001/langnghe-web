-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- FIX: "infinite recursion detected in policy" trên hầu hết bảng nghiệp vụ.
--
-- Triệu chứng (đã thấy trên DB thật): mọi SELECT của user đăng nhập (và cả
-- anon) trên rfq_requests, rfq_quotes, rfq_targets, orders, buyer_profiles,
-- order_events, disputes, rfq_messages, ... trả HTTP 500 / mã 42P17.
--
-- Nguyên nhân: các policy tra chéo nhau qua subquery, mà subquery trong policy
-- lại bị áp RLS của bảng đích → Postgres phát hiện vòng lặp:
--   buyer_profiles_select  → orders → (orders_buyer_view) → buyer_profiles
--   rfq_requests_supplier_view → rfq_quotes → (rfq_quotes_buyer_view) → rfq_requests
--   rfq_requests_supplier_view → rfq_targets → (rfq_targets_buyer_own) → rfq_requests
--
-- Cách sửa: chuyển các subquery "vòng" sang hàm SECURITY DEFINER (chạy với
-- quyền owner nên không bị RLS của bảng đích) — đúng pattern của is_admin()
-- (20260905120900_rls_helpers.sql). Ý nghĩa quyền KHÔNG đổi, chỉ đổi cách tra:
--   - supplier thấy buyer_profiles của buyer có đơn với mình
--   - supplier thấy RFQ mình được mời / đã báo giá
--   - buyer thấy quote/targets của RFQ mình tạo
-- Các hàm chỉ trả TRUE/FALSE theo auth.uid() nên không lộ dữ liệu.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regprocedure('public.is_rfq_buyer(uuid)') IS NULL THEN
        RAISE EXCEPTION 'Thiếu public.is_rfq_buyer(). Chạy 20261002090000 trước.';
    END IF;
    IF to_regclass('public.rfq_targets') IS NULL THEN
        RAISE EXCEPTION 'Thiếu rfq_targets. Chạy 20260918090000 trước.';
    END IF;
END $$;

-- ── Helper ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.supplier_has_order_with_buyer(p_buyer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.orders o
        JOIN public.supplier_profiles sp ON sp.id = o.supplier_id
        WHERE o.buyer_id = p_buyer_id AND sp.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.supplier_targeted_on_rfq(p_rfq_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.rfq_targets t
        JOIN public.supplier_profiles sp ON sp.id = t.supplier_id
        WHERE t.rfq_id = p_rfq_id AND sp.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.supplier_quoted_on_rfq(p_rfq_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.rfq_quotes rq
        JOIN public.supplier_profiles sp ON sp.id = rq.supplier_id
        WHERE rq.rfq_id = p_rfq_id AND sp.user_id = auth.uid()
    );
$$;

-- Các hàm này được gọi từ policy, mà policy cũng chạy khi anon (chưa đăng nhập)
-- SELECT — thiếu EXECUTE cho anon thì anon nhận lỗi "permission denied for
-- function" thay vì kết quả rỗng. Chúng chỉ trả TRUE/FALSE theo auth.uid(): với
-- anon (auth.uid() NULL) luôn FALSE, nên cấp cho cả anon và authenticated là an toàn.
-- (is_rfq_buyer() ở 20261002090000 đã bị REVOKE anon — cấp lại ở đây.)
REVOKE ALL ON FUNCTION public.supplier_has_order_with_buyer(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supplier_targeted_on_rfq(UUID)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supplier_quoted_on_rfq(UUID)        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_has_order_with_buyer(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_targeted_on_rfq(UUID)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_quoted_on_rfq(UUID)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_rfq_buyer(UUID)                  TO anon, authenticated;

-- ── buyer_profiles ──────────────────────────────────────────
DROP POLICY IF EXISTS buyer_profiles_select ON buyer_profiles;
CREATE POLICY buyer_profiles_select ON buyer_profiles
    FOR SELECT USING (
        user_id = auth.uid()
        OR public.is_admin()
        -- Supplier được xem basic info của buyer khi có giao dịch chung
        OR public.supplier_has_order_with_buyer(buyer_profiles.id)
    );

-- ── rfq_requests ────────────────────────────────────────────
DROP POLICY IF EXISTS rfq_requests_supplier_view ON rfq_requests;
CREATE POLICY rfq_requests_supplier_view ON rfq_requests
    FOR SELECT USING (
        -- Supplier được mời đích danh (rfq_targets) — gồm cả RFQ đơn
        public.supplier_targeted_on_rfq(rfq_requests.id)
        -- Supplier đã báo giá
        OR public.supplier_quoted_on_rfq(rfq_requests.id)
        -- Multi-RFQ theo ngành hàng của mình
        OR (rfq_type = 'multi' AND status = 'published' AND EXISTS (
            SELECT 1 FROM supplier_profiles sp
            JOIN products p ON p.supplier_id = sp.id
            WHERE sp.user_id = auth.uid()
              AND p.category_id = rfq_requests.category_id
              AND p.status = 'active'
        ))
    );

-- ── rfq_quotes ──────────────────────────────────────────────
DROP POLICY IF EXISTS rfq_quotes_buyer_view ON rfq_quotes;
CREATE POLICY rfq_quotes_buyer_view ON rfq_quotes
    FOR SELECT USING (public.is_rfq_buyer(rfq_quotes.rfq_id));

-- ── rfq_targets ─────────────────────────────────────────────
DROP POLICY IF EXISTS rfq_targets_buyer_own ON rfq_targets;
CREATE POLICY rfq_targets_buyer_own ON rfq_targets
    FOR SELECT USING (
        public.is_rfq_buyer(rfq_targets.rfq_id)
        OR public.is_admin()
    );

COMMIT;

-- ============================================================
-- ROLLBACK: khôi phục policy cũ nằm trong 20260905121000 và 20260918090000
-- (bản cũ gây đệ quy — chỉ để tham khảo, không nên quay lại).
-- ============================================================
