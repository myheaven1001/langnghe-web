-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Sửa 2 lỗi tìm thấy khi rà soát bước 5–6.
--
--   1. supplier_dashboard_stats(): từ 5.7 buyer từ chối được một báo giá khi
--      RFQ còn mở và xưởng được báo giá lại, nhưng số "RFQ cần báo giá" vẫn
--      coi RFQ đó là đã báo giá (chỉ bỏ qua báo giá 'withdrawn'). Giờ bỏ qua
--      cả 'rejected' — khớp với index uq_quote_active_per_supplier.
--   2. restore_stock_on_cancel(): đơn hàng có sẵn bị huỷ SAU khi đã gửi hàng
--      (admin hoàn toàn bộ tiền trong tranh chấp) vẫn được cộng lại kho dù
--      hàng đã rời xưởng. Giờ chỉ cộng lại khi đơn huỷ trước lúc gửi hàng.
--
-- Không đổi bảng, không đổi dữ liệu.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'restore_stock_on_cancel') THEN
        RAISE EXCEPTION 'Thiếu restore_stock_on_cancel(). Chạy 20261005093400 trước.';
    END IF;
    IF to_regclass('public.rfq_quote_revisions') IS NULL THEN
        RAISE EXCEPTION 'Thiếu rfq_quote_revisions. Chạy 20261005093600 (5.7) trước.';
    END IF;
END $$;

-- ── 1. RFQ có báo giá bị từ chối lại được tính là "cần báo giá" ────────
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
                        AND q.status NOT IN ('withdrawn', 'rejected'));

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


-- ── 2. Không cộng lại kho khi đơn huỷ sau lúc gửi hàng ─────────────────
CREATE OR REPLACE FUNCTION public.restore_stock_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item RECORD;
BEGIN
    -- Hàng đã rời xưởng (đang giao / đã giao / hoàn tất) thì không tự cộng lại
    -- kho: đơn huỷ lúc này là do tranh chấp, hàng có về hay không xưởng tự chỉnh.
    IF OLD.status IN ('shipped', 'delivered', 'completed') THEN
        RETURN NULL;
    END IF;

    FOR v_item IN
        SELECT id, product_id, variant_id, quantity FROM order_items
        WHERE order_id = NEW.id AND stock_deducted
        ORDER BY product_id, variant_id
        FOR UPDATE
    LOOP
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE product_variants SET stock_qty = stock_qty + v_item.quantity WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE products SET stock_qty = stock_qty + v_item.quantity WHERE id = v_item.product_id;
        END IF;
        UPDATE order_items SET stock_deducted = FALSE WHERE id = v_item.id;
    END LOOP;
    RETURN NULL;
END;
$$;


DO $$
BEGIN
    RAISE NOTICE 'Migration OK — supplier_dashboard_stats() (báo giá bị từ chối), restore_stock_on_cancel() (không hoàn kho sau khi gửi hàng)';
END $$;

COMMIT;
