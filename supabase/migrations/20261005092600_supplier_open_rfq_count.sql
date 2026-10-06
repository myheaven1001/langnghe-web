-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- SỬA LỖI (phát hiện khi test 4.6): "RFQ cần báo giá" chỉ đếm RFQ ở trạng
-- thái 'published'.
--
-- Trigger trg_log_quote_received chuyển RFQ sang 'quoted' ngay khi có báo giá
-- ĐẦU TIÊN của bất kỳ xưởng nào. Vì chỉ đếm 'published' nên:
--   - RFQ gửi nhiều xưởng: một xưởng báo giá xong thì các xưởng còn lại
--     không còn thấy RFQ đó trong "cần báo giá";
--   - xưởng rút báo giá: RFQ không quay lại "cần báo giá".
-- Sửa: RFQ còn mở = published / quoted / negotiating (đúng danh sách trạng
-- thái mà trigger guard_rfq_quote_write cho phép gửi báo giá). Web sửa cùng
-- lúc ở counts.ts, dashboard và hộp RFQ.
-- Cùng lỗi ở quy tắc RLS rfq_requests_supplier_view: RFQ gửi theo ngành hàng
-- (multi) chỉ hiện với xưởng cùng ngành khi còn 'published' → sau báo giá đầu
-- tiên các xưởng khác không còn thấy RFQ. Sửa cùng điều kiện.
-- Phần còn lại của hàm giữ nguyên bản 20261005092500.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'supplier_dashboard_stats') THEN
        RAISE EXCEPTION 'Thiếu supplier_dashboard_stats(). Chạy 20261005092300 trước.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'quote_status' AND e.enumlabel = 'withdrawn'
    ) THEN
        RAISE EXCEPTION 'quote_status thiếu giá trị withdrawn. Chạy 20261005092400 trước.';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.supplier_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
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
    WHERE r.status IN ('published', 'quoted', 'negotiating')
      AND NOT EXISTS (SELECT 1 FROM rfq_quotes q
                      WHERE q.rfq_id = r.id AND q.supplier_id = v_supplier_id
                        AND q.status <> 'withdrawn');

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
        'quotes_count',     (SELECT count(*) FROM rfq_quotes
                             WHERE supplier_id = v_supplier_id AND status <> 'withdrawn'),
        'accepted_count',   (SELECT count(*) FROM rfq_quotes
                             WHERE supplier_id = v_supplier_id AND status = 'accepted'));
END;
$$;

-- ── RLS: RFQ multi theo ngành hàng hiện khi còn mở ─────────────────────
DROP POLICY rfq_requests_supplier_view ON public.rfq_requests;
CREATE POLICY rfq_requests_supplier_view ON public.rfq_requests
    FOR SELECT USING (
        -- Supplier được mời đích danh (rfq_targets) — gồm cả RFQ đơn
        public.supplier_targeted_on_rfq(rfq_requests.id)
        -- Supplier đã báo giá
        OR public.supplier_quoted_on_rfq(rfq_requests.id)
        -- Multi-RFQ theo ngành hàng của mình
        OR (rfq_type = 'multi' AND status IN ('published', 'quoted', 'negotiating') AND EXISTS (
            SELECT 1 FROM supplier_profiles sp
            JOIN products p ON p.supplier_id = sp.id
            WHERE sp.user_id = auth.uid()
              AND p.category_id = rfq_requests.category_id
              AND p.status = 'active'
        ))
    );

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — supplier_dashboard_stats(): RFQ còn mở = published/quoted/negotiating';
END $$;

COMMIT;
