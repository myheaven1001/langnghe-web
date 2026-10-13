-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Bước 6 (Vận hành): báo cáo toàn sàn + giám sát RFQ cho admin.
--
--   admin_platform_report(days)   Số liệu N ngày gần nhất (7–365, mặc định
--       30) trong một lần gọi: đơn hàng (số đơn, theo nguồn, hoàn tất, huỷ),
--       tiền sàn đã xác nhận thu, người dùng mới, phễu RFQ (tạo → có báo giá →
--       chốt), tranh chấp / hoàn tiền / đánh giá, chuỗi theo ngày và 5 xưởng
--       có doanh thu cao nhất.
--   admin_rfq_monitor(limit)   RFQ đang mở kèm số xưởng được mời, số báo giá
--       và số giờ đã chờ — để admin thấy yêu cầu nào đang "chết" (mở quá 48
--       giờ mà chưa có báo giá) và chủ động nhắc xưởng.
--   Cả hai chỉ đọc, SECURITY DEFINER + assert_admin().
--
-- Ngày tính theo giờ Việt Nam. Mã lỗi: FORBIDDEN_NOT_ADMIN.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_platform_report') THEN
        RAISE EXCEPTION 'admin_platform_report() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF to_regclass('public.refunds') IS NULL OR to_regclass('public.reviews') IS NULL THEN
        RAISE EXCEPTION 'Thiếu refunds / reviews. Chạy 20261005093700 và 20261005094000 trước.';
    END IF;
END $$;

CREATE FUNCTION public.admin_platform_report(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days   INT := LEAST(GREATEST(COALESCE(p_days, 30), 7), 365);
    v_today  DATE := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
    v_from_d DATE := v_today - (v_days - 1);
    -- Mốc đầu kỳ ở 2 dạng: TIMESTAMP "UTC không múi giờ" (orders, rfq…) và TIMESTAMPTZ.
    v_from_tz TIMESTAMPTZ := v_from_d::TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh';
    v_from    TIMESTAMP := v_from_tz AT TIME ZONE 'UTC';
BEGIN
    PERFORM public.assert_admin();

    RETURN jsonb_build_object(
        'days', v_days,
        'from', v_from_d,
        'to', v_today,
        'orders', (
            SELECT jsonb_build_object(
                'created',   count(*),
                'from_rfq',  count(*) FILTER (WHERE source = 'rfq'),
                'direct',    count(*) FILTER (WHERE source = 'direct'),
                'completed', count(*) FILTER (WHERE status = 'completed'),
                'cancelled', count(*) FILTER (WHERE status = 'cancelled'),
                'value',     COALESCE(sum(total) FILTER (WHERE status <> 'cancelled'), 0))
            FROM orders WHERE created_at >= v_from),
        'paid', (
            SELECT jsonb_build_object(
                'orders', count(*),
                'amount', COALESCE(sum(COALESCE(paid_amount, total)), 0))
            FROM orders
            WHERE confirmed_at >= v_from AND status NOT IN ('pending_confirmation', 'pending_payment', 'cancelled')),
        'users', jsonb_build_object(
            'new_buyers',    (SELECT count(*) FROM buyer_profiles WHERE created_at >= v_from),
            'new_suppliers', (SELECT count(*) FROM supplier_profiles WHERE created_at >= v_from),
            'selling_suppliers', (SELECT count(DISTINCT supplier_id) FROM products WHERE status = 'active'),
            'active_products',   (SELECT count(*) FROM products WHERE status = 'active')),
        'rfq', (
            SELECT jsonb_build_object(
                'created',     count(*),
                'with_quotes', count(*) FILTER (WHERE q.quotes > 0),
                'awarded',     count(*) FILTER (WHERE r.status IN ('awarded', 'closed')),
                'expired',     count(*) FILTER (WHERE r.status = 'expired'),
                'cancelled',   count(*) FILTER (WHERE r.status = 'cancelled'),
                'avg_quotes',  COALESCE(round(avg(q.quotes) FILTER (WHERE q.quotes > 0), 1), 0),
                'median_hours_to_first_quote',
                    round((percentile_cont(0.5) WITHIN GROUP (
                        ORDER BY extract(epoch FROM q.first_quote_at - r.created_at) / 3600.0)
                        FILTER (WHERE q.first_quote_at IS NOT NULL))::NUMERIC, 1))
            FROM rfq_requests r
            LEFT JOIN LATERAL (
                SELECT count(*) AS quotes, min(created_at) AS first_quote_at
                FROM rfq_quotes WHERE rfq_id = r.id
            ) q ON TRUE
            WHERE r.created_at >= v_from AND r.status <> 'draft'),
        'trust', jsonb_build_object(
            'disputes_opened', (SELECT count(*) FROM disputes WHERE created_at >= v_from),
            'refund_amount',   (SELECT COALESCE(sum(amount), 0) FROM refunds WHERE created_at >= v_from_tz),
            'reviews',         (SELECT count(*) FROM reviews WHERE created_at >= v_from_tz),
            'avg_rating',      (SELECT COALESCE(round(avg(rating)::NUMERIC, 2), 0) FROM reviews
                                WHERE created_at >= v_from_tz AND hidden_at IS NULL),
            'reports_open',    (SELECT count(*) FROM content_reports WHERE status = 'open')),
        'daily', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'date', d.day::DATE, 'orders', COALESCE(o.orders, 0), 'paid', COALESCE(p.paid, 0))
                       ORDER BY d.day), '[]')
            FROM generate_series(v_from_d, v_today, INTERVAL '1 day') AS d(day)
            LEFT JOIN (
                SELECT ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE AS day,
                       count(*) AS orders
                FROM orders WHERE created_at >= v_from GROUP BY 1
            ) o ON o.day = d.day::DATE
            LEFT JOIN (
                SELECT ((confirmed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE AS day,
                       sum(COALESCE(paid_amount, total)) AS paid
                FROM orders
                WHERE confirmed_at >= v_from
                  AND status NOT IN ('pending_confirmation', 'pending_payment', 'cancelled')
                GROUP BY 1
            ) p ON p.day = d.day::DATE),
        'top_suppliers', (
            SELECT COALESCE(jsonb_agg(t ORDER BY (t ->> 'amount')::NUMERIC DESC), '[]')
            FROM (
                SELECT jsonb_build_object('id', sp.id, 'name', sp.shop_name,
                                          'orders', count(*),
                                          'amount', sum(COALESCE(o.paid_amount, o.total))) AS t
                FROM orders o JOIN supplier_profiles sp ON sp.id = o.supplier_id
                WHERE o.confirmed_at >= v_from
                  AND o.status NOT IN ('pending_confirmation', 'pending_payment', 'cancelled')
                GROUP BY sp.id, sp.shop_name
                ORDER BY sum(COALESCE(o.paid_amount, o.total)) DESC
                LIMIT 5
            ) s));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_platform_report(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_report(INT) TO authenticated;

CREATE FUNCTION public.admin_rfq_monitor(p_limit INT DEFAULT 100)
RETURNS TABLE (
    id            UUID,
    title         TEXT,
    buyer_name    TEXT,
    status        TEXT,
    rfq_type      TEXT,
    created_at    TIMESTAMPTZ,
    deadline_at   TIMESTAMPTZ,
    targets       INT,
    quotes        INT,
    hours_open    INT,
    stale         BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.assert_admin();

    RETURN QUERY
    SELECT r.id, r.title::TEXT, bp.company_name::TEXT, r.status::TEXT, r.rfq_type::TEXT,
           r.created_at AT TIME ZONE 'UTC',
           COALESCE(r.expires_at, r.created_at + r.deadline_days * INTERVAL '1 day') AT TIME ZONE 'UTC',
           (SELECT count(*)::INT FROM rfq_targets t WHERE t.rfq_id = r.id),
           q.quotes,
           floor(extract(epoch FROM (NOW() AT TIME ZONE 'UTC') - r.created_at) / 3600)::INT,
           (q.quotes = 0 AND r.created_at < (NOW() AT TIME ZONE 'UTC') - INTERVAL '48 hours')
    FROM rfq_requests r
    JOIN buyer_profiles bp ON bp.id = r.buyer_id
    CROSS JOIN LATERAL (
        SELECT count(*)::INT AS quotes FROM rfq_quotes x
        WHERE x.rfq_id = r.id AND x.status <> 'withdrawn'
    ) q
    WHERE r.status IN ('published', 'quoted', 'negotiating')
    ORDER BY (q.quotes = 0) DESC, r.created_at
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 300);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rfq_monitor(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rfq_monitor(INT) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — admin_platform_report(), admin_rfq_monitor()';
END $$;

COMMIT;
