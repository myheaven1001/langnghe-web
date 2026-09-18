-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- PRODUCT VARIANTS — port riêng bảng product_variants từ schema_v6_target.sql
-- (KHÔNG có trong schema_v1_mvp.sql / các migration Sprint 1-4 đã port —
-- bảng này chỉ tồn tại ở schema v6, một target xa hơn nhiều so với migration
-- hiện tại). Task 4.3 (/supplier/products/new, .../[id]/edit) cần insert
-- vào bảng này nên port riêng ngay bảng độc lập này (không entangle với
-- phần còn lại của schema v6), cùng cách đã làm với rfq_targets
-- (20260918090000) và order_events (20260920090000).
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
        RAISE EXCEPTION 'Không tìm thấy bảng products. Migration Sprint 1 chưa chạy.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_variants') THEN
        RAISE EXCEPTION 'product_variants đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE TABLE product_variants (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id       UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    color            VARCHAR(100),
    size             VARCHAR(100),
    material         VARCHAR(100),
    stock_qty        INT           NOT NULL DEFAULT 0,
    price_adjustment DECIMAL(14,2) NOT NULL DEFAULT 0,
    sku              VARCHAR(100)  UNIQUE
);

CREATE INDEX idx_variants_product ON product_variants (product_id);

-- RLS — cùng pattern với price_tiers (kế thừa visibility của products,
-- modify chỉ chủ sở hữu).
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants FORCE ROW LEVEL SECURITY;

CREATE POLICY product_variants_select ON product_variants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM products p
            WHERE p.id = product_variants.product_id
              AND (p.status = 'active' OR public.is_admin()
                   OR EXISTS (SELECT 1 FROM supplier_profiles sp
                              WHERE sp.id = p.supplier_id
                                AND sp.user_id = auth.uid()))
        )
    );

CREATE POLICY product_variants_modify_supplier ON product_variants
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM products p
            JOIN supplier_profiles sp ON sp.id = p.supplier_id
            WHERE p.id = product_variants.product_id
              AND sp.user_id = auth.uid()
        )
        OR public.is_admin()
    );

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — product_variants (+ RLS)';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS product_variants CASCADE;
-- COMMIT;
