-- Quay lui 20261005092600_supplier_open_rfq_count.sql (xem README.md).
-- Trả supplier_dashboard_stats() về bản 20261005092500 (chỉ đếm RFQ 'published').
BEGIN;

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
    WHERE r.status = 'published'
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

-- Bản 20261004090000.
DROP POLICY rfq_requests_supplier_view ON public.rfq_requests;
CREATE POLICY rfq_requests_supplier_view ON public.rfq_requests
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

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005092600';

COMMIT;
