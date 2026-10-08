-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 4.8: buyer_dashboard_stats() — số liệu dashboard buyer.
--
-- Trả trong 1 lần gọi (JSONB) cho buyer đang đăng nhập:
--   active_rfq_count     RFQ còn mở (published / quoted / negotiating)
--   quotes_to_review     báo giá đang chờ buyer quyết định trên các RFQ còn mở
--   rfq_with_quotes      số RFQ còn mở đã có ít nhất 1 báo giá đang chờ
--   orders               số đơn theo từng trạng thái
--   unpaid_amount        tổng giá trị các đơn đang chờ thanh toán
--
-- SECURITY INVOKER: RLS sẵn có quyết định buyer thấy gì (báo giá đã rút
-- không hiện với buyer nên tự không được đếm).
--
-- Mã lỗi: NOT_A_BUYER.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'buyer_dashboard_stats') THEN
        RAISE EXCEPTION 'buyer_dashboard_stats() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE FUNCTION public.buyer_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_buyer_id UUID;
    v_orders   JSONB;
    v_unpaid   NUMERIC;
BEGIN
    SELECT id INTO v_buyer_id FROM buyer_profiles WHERE user_id = auth.uid();
    IF v_buyer_id IS NULL THEN
        RAISE EXCEPTION 'NOT_A_BUYER';
    END IF;

    SELECT jsonb_build_object(
               'pending_payment', count(*) FILTER (WHERE status = 'pending_payment'),
               'confirmed',       count(*) FILTER (WHERE status = 'confirmed'),
               'producing',       count(*) FILTER (WHERE status = 'producing'),
               'shipped',         count(*) FILTER (WHERE status = 'shipped'),
               'delivered',       count(*) FILTER (WHERE status = 'delivered'),
               'completed',       count(*) FILTER (WHERE status = 'completed'),
               'cancelled',       count(*) FILTER (WHERE status = 'cancelled')),
           COALESCE(sum(total_amount) FILTER (WHERE status = 'pending_payment'), 0)
    INTO v_orders, v_unpaid
    FROM orders
    WHERE buyer_id = v_buyer_id;

    RETURN jsonb_build_object(
        'active_rfq_count', (SELECT count(*) FROM rfq_requests
                             WHERE buyer_id = v_buyer_id
                               AND status IN ('published', 'quoted', 'negotiating')),
        'quotes_to_review', (SELECT count(*) FROM rfq_quotes q
                             JOIN rfq_requests r ON r.id = q.rfq_id
                             WHERE r.buyer_id = v_buyer_id
                               AND r.status IN ('published', 'quoted', 'negotiating')
                               AND q.status IN ('pending', 'counter_offered')),
        'rfq_with_quotes',  (SELECT count(DISTINCT q.rfq_id) FROM rfq_quotes q
                             JOIN rfq_requests r ON r.id = q.rfq_id
                             WHERE r.buyer_id = v_buyer_id
                               AND r.status IN ('published', 'quoted', 'negotiating')
                               AND q.status IN ('pending', 'counter_offered')),
        'orders',           v_orders,
        'unpaid_amount',    v_unpaid);
END;
$$;

REVOKE ALL ON FUNCTION public.buyer_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buyer_dashboard_stats() TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — buyer_dashboard_stats()';
END $$;

COMMIT;
