-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 2.1c: dữ liệu cho trang công khai (bước 2).
--
--   product_cards      View thẻ sản phẩm công khai: ảnh chính, giá thấp/cao
--                      nhất, MOQ, danh mục, xưởng (tên, slug, làng nghề, đã
--                      xác minh). Chỉ sản phẩm active của xưởng công khai
--                      (cùng điều kiện 1.6). Có search_vector để lọc tìm kiếm.
--   public_stats()     Số liệu trang chủ: xưởng, sản phẩm, làng nghề, danh
--                      mục, đơn đã hoàn tất.
--   search_suggest()   Gợi ý khi gõ ô tìm kiếm: sản phẩm, danh mục, xưởng.
--   create_rfq()       Thêm p_product_id (mặc định NULL) — RFQ gửi từ trang
--                      sản phẩm gắn với sản phẩm đó. Lời gọi cũ (không có
--                      p_product_id) vẫn chạy như trước.
--
-- View chạy bằng quyền chủ view (security_invoker = false) để khách đọc
-- được mà không cần quyền trên supplier_profiles/verifications — cột và
-- dòng đã lọc trong định nghĩa view.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'products' AND column_name = 'slug') THEN
        RAISE EXCEPTION 'Thiếu products.slug. Chạy 20261005091200 (2.1b) trước.';
    END IF;
    IF to_regclass('public.product_cards') IS NOT NULL THEN
        RAISE EXCEPTION 'product_cards đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

-- ── Thẻ sản phẩm công khai ─────────────────────────────────────────────
CREATE VIEW public.product_cards
WITH (security_invoker = false)
AS
SELECT
    p.id,
    p.slug,
    p.name,
    p.min_order_qty       AS moq,
    p.lead_time_days,
    p.accept_oem,
    p.accept_custom,
    p.is_featured,
    p.created_at,
    c.id                  AS category_id,
    c.slug                AS category_slug,
    c.name                AS category_name,
    sp.id                 AS supplier_id,
    sp.slug               AS supplier_slug,
    sp.shop_name,
    sp.village_origin,
    sp.rating_avg,
    EXISTS (SELECT 1 FROM public.verifications v
            WHERE v.entity_type = 'supplier' AND v.entity_id = sp.id
              AND v.status = 'approved') AS supplier_verified,
    price.min_price,
    price.max_price,
    img.image_url,
    p.search_vector
FROM public.products p
JOIN public.supplier_profiles sp ON sp.id = p.supplier_id
LEFT JOIN public.categories c ON c.id = p.category_id
LEFT JOIN LATERAL (
    SELECT min(t.unit_price) AS min_price, max(t.unit_price) AS max_price
    FROM public.price_tiers t WHERE t.product_id = p.id
) price ON TRUE
LEFT JOIN LATERAL (
    SELECT COALESCE(m.thumbnail_url, m.cdn_url) AS image_url
    FROM public.product_media m
    WHERE m.product_id = p.id AND m.status = 'ready' AND m.media_type = 'image'
    ORDER BY m.is_primary DESC, m.sort_order, m.created_at
    LIMIT 1
) img ON TRUE
WHERE p.status = 'active'
  AND public.supplier_is_public(p.supplier_id);

COMMENT ON VIEW public.product_cards IS
    'Thẻ sản phẩm công khai (2.1c) cho trang chủ, tìm kiếm, danh mục, gian
     hàng. Lọc tìm kiếm: WHERE search_vector @@ search_query(:q).';

REVOKE ALL ON public.product_cards FROM PUBLIC;
GRANT SELECT ON public.product_cards TO anon, authenticated;

-- ── Số liệu trang chủ ──────────────────────────────────────────────────
CREATE FUNCTION public.public_stats()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'suppliers',        (SELECT count(*) FROM public_supplier_profiles),
        'products',         (SELECT count(*) FROM product_cards),
        'villages',         (SELECT count(DISTINCT village_origin) FROM public_supplier_profiles
                             WHERE village_origin IS NOT NULL AND village_origin <> ''),
        'categories',       (SELECT count(*) FROM categories WHERE is_active),
        'completed_orders', (SELECT count(*) FROM orders WHERE status = 'completed')
    );
$$;

-- ── Gợi ý tìm kiếm ─────────────────────────────────────────────────────
-- kind: 'product' | 'category' | 'supplier'; slug để dựng đường dẫn.
CREATE FUNCTION public.search_suggest(p_q TEXT, p_limit INT DEFAULT 8)
RETURNS TABLE (kind TEXT, label TEXT, slug TEXT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH q AS (
        SELECT public.search_query(p_q) AS tsq,
               '%' || public.vn_unaccent(btrim(p_q)) || '%' AS pattern
    )
    (SELECT 'category', c.name, c.slug
     FROM categories c, q
     WHERE q.tsq IS NOT NULL AND c.is_active AND public.vn_unaccent(c.name) LIKE q.pattern
     ORDER BY c.sort_order
     LIMIT 3)
    UNION ALL
    (SELECT 'supplier', s.shop_name, s.slug
     FROM public_supplier_profiles s, q
     WHERE q.tsq IS NOT NULL
       AND public.vn_unaccent(s.shop_name || ' ' || COALESCE(s.village_origin, '')) LIKE q.pattern
     ORDER BY s.rating_avg DESC NULLS LAST
     LIMIT 3)
    UNION ALL
    (SELECT 'product', pc.name, pc.slug
     FROM product_cards pc, q
     WHERE q.tsq IS NOT NULL AND pc.search_vector @@ q.tsq
     ORDER BY ts_rank(pc.search_vector, q.tsq) DESC, pc.created_at DESC
     LIMIT GREATEST(COALESCE(p_limit, 8), 1));
$$;

-- ── create_rfq thêm p_product_id ───────────────────────────────────────
-- Đổi danh sách tham số phải DROP rồi CREATE (CREATE OR REPLACE sẽ tạo
-- thêm một bản nạp chồng). Cùng transaction nên không có lúc nào thiếu hàm.
DROP FUNCTION public.create_rfq(TEXT, TEXT, INT, TEXT, NUMERIC, NUMERIC, INT, TEXT, UUID, UUID[]);

CREATE FUNCTION public.create_rfq(
    p_title         TEXT,
    p_requirements  TEXT,
    p_quantity      INT,
    p_unit          TEXT,
    p_budget_min    NUMERIC,
    p_budget_max    NUMERIC,
    p_deadline_days INT,
    p_rfq_type      TEXT,
    p_category_id   UUID,
    p_supplier_ids  UUID[],
    p_product_id    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id       UUID;
    v_plan_name      TEXT;
    v_quota          rfq_quota_configs%ROWTYPE;
    v_credit_balance INT;
    v_rfq_id         UUID;
    v_used_credit    BOOLEAN := FALSE;
    v_supplier_id    UUID;
    v_supplier_count INT;
    v_product_supplier UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    SELECT id INTO v_buyer_id FROM buyer_profiles WHERE user_id = auth.uid();
    IF v_buyer_id IS NULL THEN
        RAISE EXCEPTION 'NOT_A_BUYER';
    END IF;

    IF p_rfq_type NOT IN ('single', 'multi') THEN
        RAISE EXCEPTION 'INVALID_RFQ_TYPE';
    END IF;

    IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT';
    END IF;
    IF p_quantity IS NULL OR p_quantity < 1 THEN
        RAISE EXCEPTION 'INVALID_INPUT';
    END IF;

    v_supplier_count := COALESCE(array_length(p_supplier_ids, 1), 0);
    IF v_supplier_count < 1 THEN
        RAISE EXCEPTION 'NO_SUPPLIER_SELECTED';
    END IF;
    IF p_rfq_type = 'single' AND v_supplier_count > 1 THEN
        RAISE EXCEPTION 'SINGLE_RFQ_ONE_SUPPLIER_ONLY';
    END IF;

    -- 2.1c: RFQ gửi từ trang sản phẩm — sản phẩm phải đang công khai và
    -- xưởng của nó nằm trong danh sách nhận RFQ.
    IF p_product_id IS NOT NULL THEN
        IF NOT public.product_is_public(p_product_id) THEN
            RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE';
        END IF;
        SELECT supplier_id INTO v_product_supplier FROM products WHERE id = p_product_id;
        IF NOT (v_product_supplier = ANY (p_supplier_ids)) THEN
            RAISE EXCEPTION 'PRODUCT_SUPPLIER_MISMATCH';
        END IF;
    END IF;

    -- Lazy reset quota nếu đã sang kỳ hạn mức mới
    UPDATE buyer_profiles
    SET quota_used_this_month = 0,
        quota_reset_at = DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
    WHERE id = v_buyer_id
      AND quota_reset_at IS NOT NULL
      AND quota_reset_at <= NOW();

    SELECT mp.name INTO v_plan_name
    FROM user_memberships um
    JOIN membership_plans mp ON mp.id = um.plan_id
    WHERE um.user_id = auth.uid() AND um.is_active = TRUE
    ORDER BY um.started_at DESC
    LIMIT 1;

    IF v_plan_name IS NULL THEN
        v_plan_name := 'free';
    END IF;

    SELECT * INTO v_quota FROM rfq_quota_configs WHERE plan_name = v_plan_name;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'QUOTA_CONFIG_MISSING';
    END IF;

    IF p_rfq_type = 'multi' AND NOT v_quota.multi_rfq_allowed THEN
        RAISE EXCEPTION 'MULTI_RFQ_NOT_ALLOWED';
    END IF;
    IF v_supplier_count > v_quota.max_suppliers_per_rfq THEN
        RAISE EXCEPTION 'TOO_MANY_SUPPLIERS';
    END IF;

    -- Atomic quota consume. monthly_quota IS NULL = gói unlimited, bỏ qua
    -- toàn bộ khối check quota/credit bên dưới.
    IF v_quota.monthly_quota IS NOT NULL THEN
        UPDATE buyer_profiles
        SET quota_used_this_month = quota_used_this_month + 1
        WHERE id = v_buyer_id
          AND quota_used_this_month < v_quota.monthly_quota;

        IF NOT FOUND THEN
            SELECT credit_balance INTO v_credit_balance
            FROM buyer_profiles WHERE id = v_buyer_id FOR UPDATE;

            IF v_credit_balance IS NULL OR v_credit_balance < 1 THEN
                RAISE EXCEPTION 'QUOTA_EXCEEDED_NO_CREDIT';
            END IF;
            v_used_credit := TRUE;
        END IF;
    END IF;

    INSERT INTO rfq_requests (
        buyer_id, category_id, product_id, title, requirements, quantity, unit,
        budget_min, budget_max, deadline_days, rfq_type, status
    ) VALUES (
        v_buyer_id, p_category_id, p_product_id, trim(p_title), p_requirements, p_quantity, p_unit,
        p_budget_min, p_budget_max, p_deadline_days, p_rfq_type::rfq_type, 'published'
    ) RETURNING id INTO v_rfq_id;

    IF v_used_credit THEN
        INSERT INTO rfq_credit_ledger (buyer_id, change_amount, balance_after, reason, rfq_id)
        VALUES (v_buyer_id, -1, v_credit_balance - 1, 'consume', v_rfq_id);
    END IF;

    FOREACH v_supplier_id IN ARRAY p_supplier_ids LOOP
        INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq_id, v_supplier_id);

        INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
        SELECT sp.user_id, 'rfq_received', 'Yêu cầu báo giá mới: ' || trim(p_title),
               'Số lượng ' || p_quantity || ' ' || COALESCE(p_unit, ''),
               jsonb_build_object('rfq_id', v_rfq_id),
               'in_app', 'sent', NOW()
        FROM supplier_profiles sp
        WHERE sp.id = v_supplier_id;
    END LOOP;

    RETURN jsonb_build_object('rfq_id', v_rfq_id, 'used_credit', v_used_credit);
END;
$$;

REVOKE ALL ON FUNCTION public.create_rfq(TEXT, TEXT, INT, TEXT, NUMERIC, NUMERIC, INT, TEXT, UUID, UUID[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_rfq(TEXT, TEXT, INT, TEXT, NUMERIC, NUMERIC, INT, TEXT, UUID, UUID[], UUID) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — product_cards, public_stats(), search_suggest(), create_rfq(p_product_id)';
END $$;

COMMIT;
