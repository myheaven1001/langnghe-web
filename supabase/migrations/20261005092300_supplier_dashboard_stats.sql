-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 4.4: supplier_dashboard_stats() — số liệu dashboard nhà bán.
--
-- Trang /supplier/dashboard đang gọi ~12 câu đếm riêng lẻ mỗi lần mở. Hàm
-- này trả tất cả trong 1 lần gọi (JSONB) cho xưởng của người đang đăng nhập:
--   new_rfq_count        RFQ đang mở mà xưởng thấy được và chưa báo giá
--   urgent_rfq_count     … trong đó còn dưới 24 giờ để báo giá
--   orders               số đơn theo từng trạng thái {pending_payment, confirmed,
--                        producing, shipped, delivered, completed, cancelled}
--   revenue_month        tổng giá trị đơn được sàn xác nhận thanh toán trong
--                        tháng này (giờ Việt Nam), không tính đơn đã huỷ
--   targeted_count       số RFQ được mời đích danh
--   quotes_count         số báo giá đã gửi
--   accepted_count       số báo giá được chấp nhận
--
-- SECURITY INVOKER có chủ đích: chạy với quyền người gọi nên RLS sẵn có
-- (rfq_requests_supplier_view…) quyết định xưởng thấy RFQ nào — cùng kết quả
-- với các câu đếm cũ, không phải chép lại điều kiện phân quyền vào đây.
--
-- Mã lỗi: NOT_A_SUPPLIER.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'supplier_dashboard_stats') THEN
        RAISE EXCEPTION 'supplier_dashboard_stats() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE FUNCTION public.supplier_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
    -- Các cột TIMESTAMP (không múi giờ) của orders/rfq_requests ghi theo UTC.
    v_now         TIMESTAMP := NOW() AT TIME ZONE 'UTC';
    v_month_start TIMESTAMP :=
        (date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AT TIME ZONE 'UTC';
    v_new_rfq     INT;
    v_urgent_rfq  INT;
    v_orders      JSONB;
    v_revenue     NUMERIC;
BEGIN
    SELECT id INTO v_supplier_id FROM supplier_profiles WHERE user_id = auth.uid();
    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'NOT_A_SUPPLIER';
    END IF;

    SELECT count(*),
           count(*) FILTER (
               WHERE COALESCE(r.expires_at, r.created_at + r.deadline_days * INTERVAL '1 day')
                     BETWEEN v_now AND v_now + INTERVAL '24 hours')
    INTO v_new_rfq, v_urgent_rfq
    FROM rfq_requests r
    WHERE r.status = 'published'
      AND NOT EXISTS (SELECT 1 FROM rfq_quotes q
                      WHERE q.rfq_id = r.id AND q.supplier_id = v_supplier_id);

    SELECT jsonb_build_object(
               'pending_payment', count(*) FILTER (WHERE status = 'pending_payment'),
               'confirmed',       count(*) FILTER (WHERE status = 'confirmed'),
               'producing',       count(*) FILTER (WHERE status = 'producing'),
               'shipped',         count(*) FILTER (WHERE status = 'shipped'),
               'delivered',       count(*) FILTER (WHERE status = 'delivered'),
               'completed',       count(*) FILTER (WHERE status = 'completed'),
               'cancelled',       count(*) FILTER (WHERE status = 'cancelled')),
           COALESCE(sum(total_amount) FILTER (
               WHERE status NOT IN ('pending_payment', 'cancelled')
                 AND confirmed_at >= v_month_start), 0)
    INTO v_orders, v_revenue
    FROM orders
    WHERE supplier_id = v_supplier_id;

    RETURN jsonb_build_object(
        'new_rfq_count',    v_new_rfq,
        'urgent_rfq_count', v_urgent_rfq,
        'orders',           v_orders,
        'revenue_month',    v_revenue,
        'targeted_count',   (SELECT count(*) FROM rfq_targets WHERE supplier_id = v_supplier_id),
        'quotes_count',     (SELECT count(*) FROM rfq_quotes WHERE supplier_id = v_supplier_id),
        'accepted_count',   (SELECT count(*) FROM rfq_quotes
                             WHERE supplier_id = v_supplier_id AND status = 'accepted'));
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supplier_dashboard_stats() TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — supplier_dashboard_stats()';
END $$;

COMMIT;
