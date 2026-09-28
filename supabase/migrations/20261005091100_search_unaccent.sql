-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 2.1a: tìm kiếm tiếng Việt không dấu.
--
-- Trước: products.search_vector (20260905120700) chỉ gồm tên + mô tả, CÓ
-- dấu → gõ "gom su" không ra "gốm sứ"; tìm theo tên xưởng, làng nghề,
-- danh mục không ra gì.
--
-- Sau:
--   - vn_unaccent(text): bỏ dấu + chữ thường (đ → d), IMMUTABLE để dùng
--     được ở cả lúc ghi chỉ mục lẫn lúc tìm.
--   - search_vector = tên sản phẩm (A) + tên danh mục (B) + tên xưởng,
--     làng nghề (C) + mô tả (D), tất cả đã bỏ dấu.
--   - Xưởng đổi shop_name/village_origin hoặc danh mục đổi tên → chỉ mục
--     của sản phẩm liên quan tự tính lại.
--   - search_query(text): chuỗi người dùng gõ → tsquery không dấu, từ cuối
--     khớp tiền tố ("gom s" ra "gốm sứ") — dùng ở trang /search (2.5).
--   - Tính lại chỉ mục cho toàn bộ sản phẩm đang có.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'vn_unaccent') THEN
        RAISE EXCEPTION 'vn_unaccent() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- unaccent(regdictionary, text) với từ điển ghi rõ không phụ thuộc
-- search_path → an toàn để khai báo IMMUTABLE.
CREATE FUNCTION public.vn_unaccent(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT lower(extensions.unaccent('extensions.unaccent'::regdictionary, COALESCE(p_text, '')));
$$;

-- ── Chỉ mục của một sản phẩm ───────────────────────────────────────────
-- SECURITY DEFINER: đọc tên xưởng/danh mục không phụ thuộc RLS của người
-- đang lưu sản phẩm.
CREATE OR REPLACE FUNCTION public.update_product_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_category TEXT;
    v_shop     TEXT;
    v_village  TEXT;
BEGIN
    SELECT name INTO v_category FROM categories WHERE id = NEW.category_id;
    SELECT shop_name, village_origin INTO v_shop, v_village
    FROM supplier_profiles WHERE id = NEW.supplier_id;

    NEW.search_vector :=
        setweight(to_tsvector('simple', public.vn_unaccent(NEW.name)), 'A') ||
        setweight(to_tsvector('simple', public.vn_unaccent(v_category)), 'B') ||
        setweight(to_tsvector('simple', public.vn_unaccent(v_shop || ' ' || COALESCE(v_village, ''))), 'C') ||
        setweight(to_tsvector('simple', public.vn_unaccent(NEW.description)), 'D');
    RETURN NEW;
END;
$$;
-- Trigger trg_product_search_vector (BEFORE INSERT OR UPDATE ON products)
-- đã có từ 20260905120700 và dùng lại hàm trên.

-- ── Tính lại khi tên xưởng / danh mục đổi ──────────────────────────────
-- Đặt search_vector = NULL để trigger BEFORE UPDATE trên products tính lại.
CREATE FUNCTION public.refresh_product_search_on_supplier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE products SET search_vector = NULL WHERE supplier_id = NEW.id;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_refresh_product_search_on_supplier
    AFTER UPDATE OF shop_name, village_origin ON public.supplier_profiles
    FOR EACH ROW
    WHEN (NEW.shop_name IS DISTINCT FROM OLD.shop_name
          OR NEW.village_origin IS DISTINCT FROM OLD.village_origin)
    EXECUTE FUNCTION public.refresh_product_search_on_supplier();

CREATE FUNCTION public.refresh_product_search_on_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE products SET search_vector = NULL WHERE category_id = NEW.id;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_refresh_product_search_on_category
    AFTER UPDATE OF name ON public.categories
    FOR EACH ROW
    WHEN (NEW.name IS DISTINCT FROM OLD.name)
    EXECUTE FUNCTION public.refresh_product_search_on_category();

-- ── Truy vấn từ ô tìm kiếm ─────────────────────────────────────────────
-- "gốm sứ bát" → 'gom' & 'su' & 'bat':* . Chỉ giữ chữ và số; chuỗi rỗng →
-- NULL (người gọi tự bỏ điều kiện tìm).
CREATE FUNCTION public.search_query(p_text TEXT)
RETURNS tsquery
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
    WITH words AS (
        SELECT t.w, t.n, count(*) OVER () AS total
        FROM regexp_split_to_table(
                 btrim(regexp_replace(public.vn_unaccent(p_text), '[^a-z0-9]+', ' ', 'g')),
                 ' ') WITH ORDINALITY AS t(w, n)
        WHERE t.w <> ''
    )
    SELECT CASE WHEN count(*) = 0 THEN NULL
                ELSE to_tsquery('simple', string_agg(
                         CASE WHEN n = total THEN w || ':*' ELSE w END, ' & ' ORDER BY n))
           END
    FROM words;
$$;

COMMENT ON FUNCTION public.search_query IS
    'Chuỗi tìm kiếm → tsquery không dấu (từ cuối khớp tiền tố). Dùng:
     WHERE search_vector @@ search_query(:q). NULL khi chuỗi rỗng.';

-- ── Tính lại chỉ mục cho sản phẩm đang có ──────────────────────────────
UPDATE public.products SET search_vector = NULL;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — tìm kiếm không dấu (vn_unaccent, search_query), đã tính lại % sản phẩm',
        (SELECT count(*) FROM public.products);
END $$;

COMMIT;
