-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 2.5: tìm kiếm/lọc sản phẩm thật (/search, dùng lại ở 2.6 cho
-- /categories/[slug] và /shops/[id]).
--
--   search_products(...)  Lọc product_cards (chỉ sản phẩm công khai — 1.6)
--       theo từ khoá không dấu (search_query, 2.1a), danh mục (slug), khoảng
--       giá (theo giá thấp nhất), MOQ tối đa, chỉ xưởng đã xác minh, một
--       xưởng; sắp xếp relevance | newest | price_asc | price_desc; phân
--       trang. Mỗi dòng kèm total_count (tổng số kết quả, trước phân trang).
--   search_facets(...)    Số kết quả theo danh mục với cùng bộ lọc (trừ
--       danh mục) — hiện "Gốm sứ (12)" trong bộ lọc.
--   log_search()          Đếm result_count bằng search_query() trên
--       product_cards: trước đây dùng plainto_tsquery CÓ dấu trên products
--       (kể cả sản phẩm của xưởng ẩn) — sai từ khi chỉ mục bỏ dấu (2.1a).
--
-- search_products/search_facets là SECURITY INVOKER trên view công khai —
-- không mở thêm quyền đọc nào.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.product_cards') IS NULL
       OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_query') THEN
        RAISE EXCEPTION 'Thiếu product_cards hoặc search_query(). Chạy 2.1a–2.1c trước.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_products') THEN
        RAISE EXCEPTION 'search_products() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE FUNCTION public.search_products(
    p_q             TEXT    DEFAULT NULL,
    p_category_slug TEXT    DEFAULT NULL,
    p_min_price     NUMERIC DEFAULT NULL,
    p_max_price     NUMERIC DEFAULT NULL,
    p_max_moq       INT     DEFAULT NULL,
    p_verified_only BOOLEAN DEFAULT FALSE,
    p_supplier_id   UUID    DEFAULT NULL,
    p_sort          TEXT    DEFAULT 'relevance',
    p_limit         INT     DEFAULT 24,
    p_offset        INT     DEFAULT 0
)
RETURNS TABLE (
    id                UUID,
    slug              TEXT,
    name              TEXT,
    image_url         TEXT,
    min_price         NUMERIC,
    moq               INT,
    shop_name         TEXT,
    village_origin    TEXT,
    supplier_verified BOOLEAN,
    accept_oem        BOOLEAN,
    category_id       UUID,
    total_count       BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH q AS (SELECT public.search_query(p_q) AS tsq)
    SELECT pc.id, pc.slug::TEXT, pc.name::TEXT, pc.image_url::TEXT, pc.min_price::NUMERIC, pc.moq,
           pc.shop_name::TEXT, pc.village_origin::TEXT, pc.supplier_verified, pc.accept_oem, pc.category_id,
           count(*) OVER () AS total_count
    FROM product_cards pc, q
    WHERE (q.tsq IS NULL OR pc.search_vector @@ q.tsq)
      AND (p_category_slug IS NULL OR pc.category_slug = p_category_slug)
      AND (p_min_price IS NULL OR pc.min_price >= p_min_price)
      AND (p_max_price IS NULL OR pc.min_price <= p_max_price)
      AND (p_max_moq IS NULL OR pc.moq <= p_max_moq)
      AND (NOT COALESCE(p_verified_only, FALSE) OR pc.supplier_verified)
      AND (p_supplier_id IS NULL OR pc.supplier_id = p_supplier_id)
    ORDER BY
        CASE WHEN p_sort = 'price_asc'  THEN pc.min_price END ASC NULLS LAST,
        CASE WHEN p_sort = 'price_desc' THEN pc.min_price END DESC NULLS LAST,
        CASE WHEN p_sort = 'relevance' AND q.tsq IS NOT NULL
             THEN ts_rank(pc.search_vector, q.tsq) END DESC NULLS LAST,
        pc.is_featured DESC,
        pc.created_at DESC,
        pc.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE FUNCTION public.search_facets(
    p_q             TEXT    DEFAULT NULL,
    p_min_price     NUMERIC DEFAULT NULL,
    p_max_price     NUMERIC DEFAULT NULL,
    p_max_moq       INT     DEFAULT NULL,
    p_verified_only BOOLEAN DEFAULT FALSE,
    p_supplier_id   UUID    DEFAULT NULL
)
RETURNS TABLE (category_slug TEXT, category_name TEXT, icon TEXT, product_count BIGINT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH q AS (SELECT public.search_query(p_q) AS tsq)
    SELECT pc.category_slug::TEXT, pc.category_name::TEXT, c.icon::TEXT, count(*)
    FROM product_cards pc
    JOIN categories c ON c.id = pc.category_id, q
    WHERE (q.tsq IS NULL OR pc.search_vector @@ q.tsq)
      AND (p_min_price IS NULL OR pc.min_price >= p_min_price)
      AND (p_max_price IS NULL OR pc.min_price <= p_max_price)
      AND (p_max_moq IS NULL OR pc.moq <= p_max_moq)
      AND (NOT COALESCE(p_verified_only, FALSE) OR pc.supplier_verified)
      AND (p_supplier_id IS NULL OR pc.supplier_id = p_supplier_id)
    GROUP BY pc.category_slug, pc.category_name, c.icon, c.sort_order
    ORDER BY c.sort_order;
$$;

GRANT EXECUTE ON FUNCTION public.search_products(TEXT, TEXT, NUMERIC, NUMERIC, INT, BOOLEAN, UUID, TEXT, INT, INT)
    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_facets(TEXT, NUMERIC, NUMERIC, INT, BOOLEAN, UUID)
    TO anon, authenticated;

-- ── log_search: đếm bằng tìm kiếm không dấu, chỉ sản phẩm công khai ─────
CREATE OR REPLACE FUNCTION public.log_search(p_query TEXT, p_session_id TEXT DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_query TEXT := left(btrim(regexp_replace(COALESCE(p_query, ''), '\s+', ' ', 'g')), 200);
    v_tsq   tsquery;
    v_count INT;
BEGIN
    IF v_query = '' THEN
        RETURN NULL;
    END IF;

    v_tsq := public.search_query(v_query);

    SELECT COUNT(*) INTO v_count
    FROM product_cards pc
    WHERE v_tsq IS NULL OR pc.search_vector @@ v_tsq;

    INSERT INTO search_logs (user_id, query, result_count, session_id)
    VALUES (auth.uid(), v_query, v_count, left(p_session_id, 100));

    RETURN v_count;
END;
$$;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — search_products(), search_facets(), log_search() đếm không dấu';
END $$;

COMMIT;
