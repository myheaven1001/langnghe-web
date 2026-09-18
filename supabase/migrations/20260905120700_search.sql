-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration sang Supabase (8/11)
-- FULL TEXT SEARCH — không đổi so với schema_v1_mvp.sql gốc
-- Hiện tại: to_tsvector('simple') — không dấu, không synonym.
--
-- TODO Sprint 3 — Vietnamese Search Layer:
--   1. Bỏ dấu: unaccent extension + custom dictionary
--   2. Synonym: "ao thun" = "áo phông", "gốm" = "gom su"
--   3. Typo tolerance: pg_trgm extension + similarity search
--   4. Nếu cần hơn: migrate sang Meilisearch (tiếng Việt tốt hơn ES)
-- ============================================================

CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_search_vector
    BEFORE INSERT OR UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_product_search_vector();

CREATE INDEX idx_products_search ON products USING GIN (search_vector);
