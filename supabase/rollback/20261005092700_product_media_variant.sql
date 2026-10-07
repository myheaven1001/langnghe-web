-- Quay lui 20261005092700_product_media_variant.sql (xem README.md).
-- Mất thông tin "ảnh thuộc biến thể nào" (ảnh vẫn còn, thành ảnh chung).
-- Quay lui web về bản trước TRƯỚC khi chạy file này.
BEGIN;

DROP FUNCTION IF EXISTS public.save_product(UUID, JSONB, JSONB, JSONB, JSONB, UUID[], JSONB);

-- Bản 20261005091400.
CREATE FUNCTION public.save_product(
    p_product_id   UUID,
    p_product      JSONB,
    p_tiers        JSONB DEFAULT '[]',
    p_variants     JSONB DEFAULT '[]',
    p_media_add    JSONB DEFAULT '[]',
    p_media_remove UUID[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_supplier UUID;
    v_id       UUID := COALESCE(p_product_id, gen_random_uuid());
    v_status   TEXT := COALESCE(p_product->>'status', 'draft');
    v_rows     INT;
    v_variant  JSONB;
    v_vid      UUID;
    v_keep     UUID[] := '{}';
    v_sku      TEXT;
BEGIN
    SELECT id INTO v_supplier FROM supplier_profiles WHERE user_id = auth.uid();
    IF v_supplier IS NULL THEN
        RAISE EXCEPTION 'NOT_A_SUPPLIER';
    END IF;

    IF COALESCE(btrim(p_product->>'name'), '') = ''
       OR v_status NOT IN ('draft', 'active', 'paused')
       OR COALESCE((p_product->>'min_order_qty')::INT, 0) < 1 THEN
        RAISE EXCEPTION 'INVALID_INPUT';
    END IF;

    -- ── Sản phẩm ────────────────────────────────────────────────────────
    IF EXISTS (SELECT 1 FROM products WHERE id = v_id) THEN
        UPDATE products SET
            name           = btrim(p_product->>'name'),
            category_id    = (p_product->>'category_id')::UUID,
            description    = NULLIF(btrim(p_product->>'description'), ''),
            accept_oem     = COALESCE((p_product->>'accept_oem')::BOOLEAN, FALSE),
            accept_custom  = COALESCE((p_product->>'accept_custom')::BOOLEAN, FALSE),
            min_order_qty  = (p_product->>'min_order_qty')::INT,
            lead_time_days = (p_product->>'lead_time_days')::INT,
            status         = v_status::product_status,
            updated_at     = NOW()
        WHERE id = v_id AND supplier_id = v_supplier;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 0 THEN
            -- Không phải hàng của mình, hoặc RLS/1.7 chặn.
            RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
        END IF;
    ELSE
        INSERT INTO products (id, supplier_id, name, category_id, description, accept_oem,
                              accept_custom, min_order_qty, lead_time_days, status)
        VALUES (v_id, v_supplier, btrim(p_product->>'name'), (p_product->>'category_id')::UUID,
                NULLIF(btrim(p_product->>'description'), ''),
                COALESCE((p_product->>'accept_oem')::BOOLEAN, FALSE),
                COALESCE((p_product->>'accept_custom')::BOOLEAN, FALSE),
                (p_product->>'min_order_qty')::INT, (p_product->>'lead_time_days')::INT,
                v_status::product_status);
    END IF;

    -- ── Bậc giá: thay toàn bộ ──────────────────────────────────────────
    DELETE FROM price_tiers WHERE product_id = v_id;
    BEGIN
        INSERT INTO price_tiers (product_id, min_qty, max_qty, unit_price)
        SELECT v_id, (t->>'min_qty')::INT, NULLIF(t->>'max_qty', '')::INT, (t->>'unit_price')::NUMERIC
        FROM jsonb_array_elements(COALESCE(p_tiers, '[]')) t;
    EXCEPTION
        WHEN exclusion_violation OR check_violation THEN
            RAISE EXCEPTION 'PRICE_TIERS_OVERLAP';
    END;

    -- ── Biến thể: sửa tại chỗ, bật lại theo SKU, thêm mới, tắt phần bỏ ──
    FOR v_variant IN SELECT * FROM jsonb_array_elements(COALESCE(p_variants, '[]')) LOOP
        v_sku := NULLIF(btrim(v_variant->>'sku'), '');
        v_vid := NULLIF(v_variant->>'id', '')::UUID;
        IF v_vid IS NULL AND v_sku IS NOT NULL THEN
            SELECT id INTO v_vid FROM product_variants WHERE product_id = v_id AND sku = v_sku;
        END IF;

        BEGIN
            IF v_vid IS NOT NULL THEN
                UPDATE product_variants SET
                    color            = NULLIF(btrim(v_variant->>'color'), ''),
                    size             = NULLIF(btrim(v_variant->>'size'), ''),
                    material         = NULLIF(btrim(v_variant->>'material'), ''),
                    stock_qty        = COALESCE((v_variant->>'stock_qty')::INT, 0),
                    price_adjustment = COALESCE((v_variant->>'price_adjustment')::NUMERIC, 0),
                    sku              = v_sku,
                    is_active        = TRUE
                WHERE id = v_vid AND product_id = v_id;
                GET DIAGNOSTICS v_rows = ROW_COUNT;
                IF v_rows = 0 THEN
                    RAISE EXCEPTION 'INVALID_INPUT' USING DETAIL = 'Biến thể không thuộc sản phẩm này.';
                END IF;
            ELSE
                INSERT INTO product_variants (product_id, color, size, material, stock_qty,
                                              price_adjustment, sku)
                VALUES (v_id, NULLIF(btrim(v_variant->>'color'), ''), NULLIF(btrim(v_variant->>'size'), ''),
                        NULLIF(btrim(v_variant->>'material'), ''),
                        COALESCE((v_variant->>'stock_qty')::INT, 0),
                        COALESCE((v_variant->>'price_adjustment')::NUMERIC, 0), v_sku)
                RETURNING id INTO v_vid;
            END IF;
        EXCEPTION
            WHEN unique_violation THEN
                RAISE EXCEPTION 'SKU_TAKEN' USING DETAIL = v_sku;
        END;
        v_keep := v_keep || v_vid;
    END LOOP;

    UPDATE product_variants SET is_active = FALSE
    WHERE product_id = v_id AND is_active AND NOT (id = ANY (v_keep));

    -- ── Ảnh ─────────────────────────────────────────────────────────────
    DELETE FROM product_media WHERE product_id = v_id AND id = ANY (COALESCE(p_media_remove, '{}'));

    INSERT INTO product_media (product_id, media_type, status, r2_key, cdn_url, thumbnail_url,
                               is_primary, sort_order)
    SELECT v_id, 'image', 'ready', m->>'r2_key', m->>'cdn_url', m->>'cdn_url', FALSE,
           COALESCE((m->>'sort_order')::INT, 0)
    FROM jsonb_array_elements(COALESCE(p_media_add, '[]')) m;

    -- Đúng 1 ảnh chính: giữ ảnh chính hiện có, không còn thì lấy ảnh đầu.
    IF NOT EXISTS (SELECT 1 FROM product_media WHERE product_id = v_id AND is_primary) THEN
        UPDATE product_media SET is_primary = TRUE
        WHERE id = (SELECT id FROM product_media WHERE product_id = v_id
                    ORDER BY sort_order, created_at LIMIT 1);
    END IF;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_product(UUID, JSONB, JSONB, JSONB, JSONB, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_product(UUID, JSONB, JSONB, JSONB, JSONB, UUID[]) TO authenticated;

DROP INDEX IF EXISTS public.idx_product_media_variant;
ALTER TABLE public.product_media DROP COLUMN IF EXISTS variant_id;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005092700';

COMMIT;
