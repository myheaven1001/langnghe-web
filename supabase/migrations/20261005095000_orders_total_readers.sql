-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Chuẩn bị bước 5.10 (bỏ cột cũ của orders): các hàm còn ĐỌC
-- orders.total_amount chuyển sang orders.total.
--
-- total_amount là cột sinh ra từ quantity × unit_price (mô hình 1 dòng hàng
-- cũ); total là tổng thật của order_items (5.2). Hai cột hiện luôn bằng nhau
-- nên đổi không làm thay đổi số liệu nào — chỉ để khi bỏ cột ở 5.10 các hàm
-- này không hỏng. Không đụng phía GHI (accept_quote, checkout_cart,
-- create_default_order_item): sửa cùng lúc bỏ cột ở 5.10.
--
-- Hàm đổi: get_supplier_analytics, admin_confirm_payment, supplier_dashboard_stats, buyer_dashboard_stats, admin_queue_counts.
-- Khoá 'total_amount' trong nhật ký admin_confirm_payment giữ nguyên tên
-- (dữ liệu cũ trong admin_audit_log dùng khoá này).
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.order_items') IS NULL THEN
        RAISE EXCEPTION 'Thiếu order_items. Chạy 20261005093300 (5.2) trước.';
    END IF;
END $$;

-- get_supplier_analytics() — bản 20261002090000, đọc total thay cho total_amount.
CREATE OR REPLACE FUNCTION public.get_supplier_analytics(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid           UUID := auth.uid();
    v_supplier_id   UUID;
    v_days          INT  := CASE WHEN p_days IN (7, 30, 90) THEN p_days ELSE 30 END;
    v_tz            CONSTANT TEXT := 'Asia/Ho_Chi_Minh';
    v_today         DATE := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
    v_from_day      DATE;
    v_prev_from_day DATE;
    v_since         TIMESTAMP;
    v_prev_since    TIMESTAMP;
    v_result        JSONB;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    SELECT id INTO v_supplier_id FROM supplier_profiles WHERE user_id = v_uid;
    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'NOT_A_SUPPLIER';
    END IF;

    v_from_day      := v_today - (v_days - 1);
    v_prev_from_day := v_from_day - v_days;
    v_since         := (v_from_day::timestamp      AT TIME ZONE v_tz) AT TIME ZONE 'UTC';
    v_prev_since    := (v_prev_from_day::timestamp AT TIME ZONE v_tz) AT TIME ZONE 'UTC';

    WITH
    my_products AS (
        SELECT id, name, search_vector
        FROM products
        WHERE supplier_id = v_supplier_id AND status = 'active'
    ),
    -- tsquery tính 1 lần cho mỗi query phân biệt, không phải mỗi dòng log
    qmatch AS (
        SELECT dq.q, mp.id AS product_id
        FROM (SELECT DISTINCT lower(query) AS q
              FROM search_logs
              WHERE created_at >= v_prev_since
                AND user_id IS DISTINCT FROM v_uid) dq
        JOIN my_products mp ON mp.search_vector @@ plainto_tsquery('simple', dq.q)
    ),
    hits AS (   -- 1 dòng cho mỗi (lượt tìm kiếm, sản phẩm khớp)
        SELECT sl.id AS log_id, sl.created_at, qm.q, qm.product_id
        FROM search_logs sl
        JOIN qmatch qm ON qm.q = lower(sl.query)
        WHERE sl.created_at >= v_prev_since
          AND sl.user_id IS DISTINCT FROM v_uid
    ),
    days AS (
        -- ép ::timestamp: generate_series(date, date, interval) mặc định trả timestamptz,
        -- ::date ngược lại sẽ phụ thuộc múi giờ session
        SELECT d::date AS day
        FROM generate_series(v_from_day::timestamp, v_today::timestamp, INTERVAL '1 day') d
    ),
    daily AS (
        SELECT days.day, COUNT(DISTINCT h.log_id) AS n
        FROM days
        LEFT JOIN hits h
               ON h.created_at >= v_since
              AND ((h.created_at AT TIME ZONE 'UTC') AT TIME ZONE v_tz)::date = days.day
        GROUP BY days.day
    ),
    cohort AS (   -- RFQ xưởng được mời trong kỳ hiện tại
        SELECT t.rfq_id
        FROM rfq_targets t
        WHERE t.supplier_id = v_supplier_id AND t.created_at >= v_since
    ),
    cohort_detail AS (
        SELECT
            c.rfq_id,
            EXISTS (SELECT 1 FROM rfq_quotes q
                     WHERE q.rfq_id = c.rfq_id AND q.supplier_id = v_supplier_id) AS quoted,
            EXISTS (SELECT 1 FROM rfq_quotes q
                     WHERE q.rfq_id = c.rfq_id AND q.supplier_id = v_supplier_id
                       AND q.status = 'accepted') AS chosen,
            EXISTS (SELECT 1 FROM orders o JOIN rfq_quotes q ON q.id = o.rfq_quote_id
                     WHERE q.rfq_id = c.rfq_id AND o.supplier_id = v_supplier_id
                       AND o.status <> 'cancelled') AS ordered,
            (SELECT MIN(q.created_at) FROM rfq_quotes q
              WHERE q.rfq_id = c.rfq_id AND q.supplier_id = v_supplier_id)
              - r.created_at AS my_response,
            m.quotes_received, m.time_to_first_quote, m.time_to_award
        FROM cohort c
        JOIN rfq_requests r ON r.id = c.rfq_id
        LEFT JOIN rfq_metrics m ON m.rfq_id = c.rfq_id
    )
    SELECT jsonb_build_object(
        'days', v_days,
        'from', v_from_day,
        'to',   v_today,

        'search_appearances', jsonb_build_object(
            'current',  (SELECT COUNT(DISTINCT log_id) FROM hits WHERE created_at >= v_since),
            'previous', (SELECT COUNT(DISTINCT log_id) FROM hits WHERE created_at <  v_since)
        ),
        'rfq_received', jsonb_build_object(
            'current',  (SELECT COUNT(*) FROM rfq_targets
                          WHERE supplier_id = v_supplier_id AND created_at >= v_since),
            'previous', (SELECT COUNT(*) FROM rfq_targets
                          WHERE supplier_id = v_supplier_id
                            AND created_at >= v_prev_since AND created_at < v_since)
        ),
        'quotes_sent', jsonb_build_object(
            'current',  (SELECT COUNT(*) FROM rfq_quotes
                          WHERE supplier_id = v_supplier_id AND created_at >= v_since),
            'previous', (SELECT COUNT(*) FROM rfq_quotes
                          WHERE supplier_id = v_supplier_id
                            AND created_at >= v_prev_since AND created_at < v_since)
        ),
        'revenue', jsonb_build_object(
            'current',  (SELECT COALESCE(sum(total), 0) FROM orders
                          WHERE supplier_id = v_supplier_id AND status <> 'cancelled'
                            AND created_at >= v_since),
            'previous', (SELECT COALESCE(sum(total), 0) FROM orders
                          WHERE supplier_id = v_supplier_id AND status <> 'cancelled'
                            AND created_at >= v_prev_since AND created_at < v_since)
        ),

        'daily', (SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'count', n) ORDER BY day), '[]'::jsonb)
                  FROM daily),

        'funnel', (SELECT jsonb_build_object(
                       'received', COUNT(*),
                       'quoted',   COUNT(*) FILTER (WHERE quoted),
                       'chosen',   COUNT(*) FILTER (WHERE chosen),
                       'ordered',  COUNT(*) FILTER (WHERE ordered))
                   FROM cohort_detail),

        -- Đọc từ rfq_metrics: bối cảnh cạnh tranh của các RFQ trong nhóm.
        'rfq_market', (SELECT jsonb_build_object(
                           'rfqs',                 COUNT(*),
                           'avg_quotes_received',  ROUND(AVG(quotes_received)::numeric, 1),
                           'avg_first_quote_hours',
                               ROUND((AVG(EXTRACT(EPOCH FROM time_to_first_quote)) / 3600)::numeric, 1),
                           'avg_award_hours',
                               ROUND((AVG(EXTRACT(EPOCH FROM time_to_award)) / 3600)::numeric, 1),
                           'awarded_count',        COUNT(*) FILTER (WHERE time_to_award IS NOT NULL),
                           'my_avg_response_hours',
                               ROUND((AVG(EXTRACT(EPOCH FROM my_response)) / 3600)::numeric, 1))
                       FROM cohort_detail),

        'keywords', (SELECT COALESCE(jsonb_agg(jsonb_build_object('query', q, 'count', n) ORDER BY n DESC, q), '[]'::jsonb)
                     FROM (SELECT q, COUNT(DISTINCT log_id) AS n
                           FROM hits WHERE created_at >= v_since
                           GROUP BY q ORDER BY n DESC, q LIMIT 8) k),

        'top_products', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', n) ORDER BY n DESC, name), '[]'::jsonb)
                         FROM (SELECT mp.id, mp.name, COUNT(DISTINCT h.log_id) AS n
                               FROM hits h JOIN my_products mp ON mp.id = h.product_id
                               WHERE h.created_at >= v_since
                               GROUP BY mp.id, mp.name ORDER BY n DESC, mp.name LIMIT 5) p)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- admin_confirm_payment() — bản 20261005092000, đọc total thay cho total_amount.
CREATE OR REPLACE FUNCTION public.admin_confirm_payment(
    p_order_id    UUID,
    p_paid_amount NUMERIC,
    p_paid_at     TIMESTAMPTZ DEFAULT NULL,
    p_method      TEXT DEFAULT NULL,
    p_reference   TEXT DEFAULT NULL,
    p_note        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order   orders%ROWTYPE;
    v_paid_at TIMESTAMPTZ := COALESCE(p_paid_at, NOW());
    v_method  TEXT := NULLIF(btrim(COALESCE(p_method, '')), '');
    v_ref     TEXT := NULLIF(btrim(COALESCE(p_reference, '')), '');
    v_note    TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
    PERFORM public.assert_admin();

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF v_order.status <> 'pending_payment' THEN
        RAISE EXCEPTION 'ORDER_NOT_PENDING_PAYMENT'
            USING DETAIL = 'Đơn đang ở trạng thái ' || v_order.status || '.';
    END IF;
    IF p_paid_amount IS NULL OR p_paid_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_PAYMENT' USING DETAIL = 'Số tiền đã nhận phải lớn hơn 0.';
    END IF;
    IF v_paid_at > NOW() + INTERVAL '1 day' OR v_paid_at < v_order.created_at - INTERVAL '1 day' THEN
        RAISE EXCEPTION 'INVALID_PAYMENT'
            USING DETAIL = 'Thời điểm nhận tiền phải sau khi tạo đơn và không ở tương lai.';
    END IF;
    IF p_paid_amount <> v_order.total AND v_note IS NULL THEN
        RAISE EXCEPTION 'PAYMENT_AMOUNT_MISMATCH'
            USING DETAIL = format('Đã nhận %s, tổng đơn %s — cần ghi chú giải thích.',
                                  p_paid_amount, v_order.total);
    END IF;

    -- trg_handle_order_status_change tự ghi confirmed_at + event payment_confirmed.
    UPDATE orders
    SET status               = 'confirmed',
        payment_confirmed_by = auth.uid(),
        paid_amount          = p_paid_amount,
        paid_at              = v_paid_at,
        payment_note         = NULLIF(concat_ws(' · ',
                                   CASE WHEN v_method IS NOT NULL THEN 'Phương thức: ' || v_method END,
                                   CASE WHEN v_ref IS NOT NULL THEN 'Mã GD: ' || v_ref END,
                                   v_note), ''),
        updated_at           = NOW()
    WHERE id = p_order_id;

    PERFORM public.log_admin_action('order.confirm_payment', 'order', p_order_id::TEXT,
        jsonb_build_object('paid_amount', p_paid_amount, 'total_amount', v_order.total,
                           'paid_at', v_paid_at, 'method', v_method, 'reference', v_ref, 'note', v_note));

    RETURN jsonb_build_object('order_id', p_order_id, 'status', 'confirmed',
                              'paid_amount', p_paid_amount, 'paid_at', v_paid_at);
END;
$$;

-- supplier_dashboard_stats() — bản 20261005094800, đọc total thay cho total_amount.
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
           COALESCE(sum(total) FILTER (
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

-- buyer_dashboard_stats() — bản 20261005092800, đọc total thay cho total_amount.
CREATE OR REPLACE FUNCTION public.buyer_dashboard_stats()
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
           COALESCE(sum(total) FILTER (WHERE status = 'pending_payment'), 0)
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

-- admin_queue_counts() — bản 20261005092900, đọc total thay cho total_amount.
CREATE OR REPLACE FUNCTION public.admin_queue_counts()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month_start TIMESTAMP :=
        (date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AT TIME ZONE 'UTC';
BEGIN
    PERFORM public.assert_admin();

    RETURN jsonb_build_object(
        'pending_verifications',
            (SELECT count(*) FROM verifications WHERE status = 'pending'),
        'oldest_verification_days',
            (SELECT COALESCE(floor(extract(epoch FROM (NOW() AT TIME ZONE 'UTC') - min(created_at)) / 86400), 0)::INT
             FROM verifications WHERE status = 'pending'),
        'orders_pending_payment',
            (SELECT count(*) FROM orders WHERE status = 'pending_payment'),
        'orders_with_receipt',
            (SELECT count(*) FROM orders o
             WHERE o.status = 'pending_payment'
               AND EXISTS (SELECT 1 FROM order_documents d
                           WHERE d.order_id = o.id AND d.doc_type = 'payment_receipt')),
        'open_disputes',
            (SELECT count(*) FROM disputes WHERE status <> 'resolved'),
        'suspended_users',
            (SELECT count(*) FROM users WHERE status = 'suspended'),
        'pending_users',
            (SELECT count(*) FROM users WHERE status = 'pending'),
        'buyers',
            (SELECT count(*) FROM users WHERE role IN ('buyer', 'both')),
        'suppliers',
            (SELECT count(*) FROM users WHERE role IN ('supplier', 'both')),
        'new_profiles_month',
            (SELECT count(*) FROM buyer_profiles WHERE created_at >= v_month_start)
            + (SELECT count(*) FROM supplier_profiles WHERE created_at >= v_month_start),
        'paid_amount_month',
            (SELECT COALESCE(sum(COALESCE(paid_amount, total)), 0) FROM orders
             WHERE status NOT IN ('pending_payment', 'cancelled') AND confirmed_at >= v_month_start));
END;
$$;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — 5 hàm đọc orders.total thay cho total_amount';
END $$;

COMMIT;
