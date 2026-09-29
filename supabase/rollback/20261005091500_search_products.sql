-- Quay lui 20261005091500_search_products.sql (xem README.md).
-- Xoá 2 hàm tìm kiếm (trang /search mới sẽ lỗi — quay lui code cùng lúc) và
-- đưa log_search() về bản cũ của 20261002090000.
BEGIN;

DROP FUNCTION IF EXISTS public.search_products(TEXT, TEXT, NUMERIC, NUMERIC, INT, BOOLEAN, UUID, TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.search_facets(TEXT, NUMERIC, NUMERIC, INT, BOOLEAN, UUID);

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

    v_tsq := plainto_tsquery('simple', v_query);

    SELECT COUNT(*) INTO v_count
    FROM products p
    WHERE p.status = 'active'
      AND p.search_vector @@ v_tsq;

    INSERT INTO search_logs (user_id, query, result_count, session_id)
    VALUES (auth.uid(), v_query, v_count, left(p_session_id, 100));

    RETURN v_count;
END;
$$;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005091500';

COMMIT;
