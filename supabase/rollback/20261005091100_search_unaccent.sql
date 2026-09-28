-- Quay lui 20261005091100_search_unaccent.sql (xem README.md).
-- Đưa update_product_search_vector() về bản cũ (tên + mô tả, có dấu), gỡ
-- trigger tính lại, hàm mới, rồi tính lại chỉ mục. Giữ extension unaccent.
BEGIN;

DROP TRIGGER IF EXISTS trg_refresh_product_search_on_supplier ON public.supplier_profiles;
DROP TRIGGER IF EXISTS trg_refresh_product_search_on_category ON public.categories;
DROP FUNCTION IF EXISTS public.refresh_product_search_on_supplier();
DROP FUNCTION IF EXISTS public.refresh_product_search_on_category();
DROP FUNCTION IF EXISTS public.search_query(TEXT);

CREATE OR REPLACE FUNCTION public.update_product_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.vn_unaccent(TEXT);

UPDATE public.products SET search_vector = NULL;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005091100';

COMMIT;
