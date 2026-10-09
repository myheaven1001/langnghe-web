-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 5.4 + phần database của 5.6: giỏ hàng, đặt hàng thẳng, xưởng
-- nhận / từ chối đơn.
--
-- Quyết định đã chốt (09/10/2026): xưởng xác nhận đơn trước khi buyer chuyển
-- tiền; chỉ trừ kho sản phẩm "hàng có sẵn"; bậc giá tính theo TỔNG số lượng
-- của cả sản phẩm (cộng mọi biến thể trong giỏ); mỗi đơn giao một đợt.
--
--   products.is_ready_stock / stock_qty   Xưởng đánh dấu "hàng có sẵn". Chỉ
--       sản phẩm này bị kiểm tra và trừ kho khi đặt: có biến thể thì trừ
--       product_variants.stock_qty, không có biến thể thì trừ products.stock_qty.
--       save_product() nhận thêm 2 khoá này (web cũ không gửi → giữ nguyên).
--   cart_items          Giỏ hàng của buyer (tối đa 100 dòng). Chỉ chủ giỏ đọc/ghi.
--   cart_set_item(product, variant, quantity, mode)   Thêm ('add') hoặc đặt
--       ('set') số lượng một dòng; số lượng 0 = bỏ dòng. Chỉ nhận sản phẩm
--       đang bán công khai của xưởng khác.
--   checkout_cart(address, note)   Đặt hàng toàn bộ giỏ trong 1 transaction:
--       kiểm tra lại sản phẩm / xưởng / biến thể, TÍNH LẠI GIÁ phía server từ
--       bậc giá + chênh lệch biến thể (giá trình duyệt gửi lên không được
--       dùng), kiểm tra MOQ và tồn kho, trừ kho, TÁCH MỖI XƯỞNG MỘT ĐƠN
--       (source = 'direct', status = 'pending_confirmation'), ghi order_items,
--       chép địa chỉ giao hàng, báo xưởng (order_placed), xoá giỏ.
--   supplier_respond_order(order, accept, reason)   Xưởng nhận đơn
--       (→ pending_payment, báo buyer thanh toán) hoặc từ chối (→ cancelled,
--       bắt buộc lý do, báo buyer order_declined).
--   order_items.stock_deducted + trigger: đơn đặt thẳng bị huỷ (xưởng từ
--       chối hoặc admin huỷ) thì kho đã trừ được cộng lại đúng số đó.
--   order_events thêm loại 'order_accepted'.
--
-- Mã lỗi: NOT_AUTHENTICATED, ACCOUNT_SUSPENDED, NOT_A_BUYER, CART_EMPTY,
--   CART_LIMIT_REACHED, INVALID_QUANTITY, PRODUCT_NOT_AVAILABLE,
--   VARIANT_REQUIRED, VARIANT_NOT_AVAILABLE, BELOW_MIN_ORDER_QTY,
--   PRICE_NOT_AVAILABLE, OUT_OF_STOCK, ADDRESS_REQUIRED, ADDRESS_NOT_FOUND,
--   ORDER_NOT_FOUND, ORDER_NOT_PENDING_CONFIRMATION, REASON_REQUIRED.
--   Lỗi về một sản phẩm cụ thể kèm tên sản phẩm trong DETAIL.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.cart_items') IS NOT NULL THEN
        RAISE EXCEPTION 'cart_items đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF to_regclass('public.order_items') IS NULL THEN
        RAISE EXCEPTION 'Thiếu order_items. Chạy 20261005093300 (5.2) trước.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'order_status' AND e.enumlabel = 'pending_confirmation'
    ) THEN
        RAISE EXCEPTION 'order_status thiếu pending_confirmation. Chạy 20261005093200 (5.1) trước.';
    END IF;
END $$;

-- ── Hàng có sẵn ─────────────────────────────────────────────────────────
ALTER TABLE public.products
    ADD COLUMN is_ready_stock BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN stock_qty      INT     NOT NULL DEFAULT 0 CHECK (stock_qty >= 0);

COMMENT ON COLUMN public.products.is_ready_stock IS
    'Hàng có sẵn: đặt qua giỏ hàng thì kiểm tra và trừ kho. FALSE = làm theo đơn, không giới hạn số lượng.';
COMMENT ON COLUMN public.products.stock_qty IS
    'Tồn kho của sản phẩm KHÔNG có biến thể (có biến thể thì dùng product_variants.stock_qty).';

ALTER TABLE public.order_items
    ADD COLUMN stock_deducted BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.order_items.stock_deducted IS
    'Dòng hàng này đã trừ kho lúc đặt → đơn bị huỷ thì cộng lại.';

-- save_product(): thêm is_ready_stock, stock_qty (phần còn lại như 20261005092700).
CREATE OR REPLACE FUNCTION public.save_product(
    p_product_id   UUID,
    p_product      JSONB,
    p_tiers        JSONB DEFAULT '[]',
    p_variants     JSONB DEFAULT '[]',
    p_media_add    JSONB DEFAULT '[]',
    p_media_remove UUID[] DEFAULT '{}',
    p_media_variants JSONB DEFAULT '[]'
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
    -- "màu|kích thước|chất liệu" (chữ thường) → id biến thể, để gắn ảnh với
    -- cả biến thể vừa tạo trong chính lần lưu này (chưa có id ở phía web).
    v_map      JSONB := '{}';
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
            -- Web cũ không gửi 2 khoá này → giữ nguyên giá trị đang có.
            is_ready_stock = COALESCE((p_product->>'is_ready_stock')::BOOLEAN, is_ready_stock),
            stock_qty      = CASE WHEN p_product ? 'stock_qty'
                                  THEN GREATEST(COALESCE((p_product->>'stock_qty')::INT, 0), 0)
                                  ELSE stock_qty END,
            updated_at     = NOW()
        WHERE id = v_id AND supplier_id = v_supplier;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 0 THEN
            -- Không phải hàng của mình, hoặc RLS/1.7 chặn.
            RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
        END IF;
    ELSE
        INSERT INTO products (id, supplier_id, name, category_id, description, accept_oem,
                              accept_custom, min_order_qty, lead_time_days, status,
                              is_ready_stock, stock_qty)
        VALUES (v_id, v_supplier, btrim(p_product->>'name'), (p_product->>'category_id')::UUID,
                NULLIF(btrim(p_product->>'description'), ''),
                COALESCE((p_product->>'accept_oem')::BOOLEAN, FALSE),
                COALESCE((p_product->>'accept_custom')::BOOLEAN, FALSE),
                (p_product->>'min_order_qty')::INT, (p_product->>'lead_time_days')::INT,
                v_status::product_status,
                COALESCE((p_product->>'is_ready_stock')::BOOLEAN, FALSE),
                COALESCE(GREATEST((p_product->>'stock_qty')::INT, 0), 0));
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
        v_map := v_map || jsonb_build_object(
            lower(concat_ws('|', COALESCE(btrim(v_variant->>'color'), ''),
                                 COALESCE(btrim(v_variant->>'size'), ''),
                                 COALESCE(btrim(v_variant->>'material'), ''))),
            v_vid);
    END LOOP;

    UPDATE product_variants SET is_active = FALSE
    WHERE product_id = v_id AND is_active AND NOT (id = ANY (v_keep));

    -- ── Ảnh ─────────────────────────────────────────────────────────────
    DELETE FROM product_media WHERE product_id = v_id AND id = ANY (COALESCE(p_media_remove, '{}'));

    -- variant_key trống / không khớp biến thể nào → ảnh chung của sản phẩm.
    INSERT INTO product_media (product_id, media_type, status, r2_key, cdn_url, thumbnail_url,
                               is_primary, sort_order, variant_id)
    SELECT v_id, 'image', 'ready', m->>'r2_key', m->>'cdn_url', m->>'cdn_url', FALSE,
           COALESCE((m->>'sort_order')::INT, 0),
           (v_map ->> lower(COALESCE(m->>'variant_key', '')))::UUID
    FROM jsonb_array_elements(COALESCE(p_media_add, '[]')) m;

    -- Ảnh đã có: gắn / bỏ gắn biến thể theo p_media_variants [{id, variant_key}].
    UPDATE product_media pm
    SET variant_id = (v_map ->> lower(COALESCE(x->>'variant_key', '')))::UUID
    FROM jsonb_array_elements(COALESCE(p_media_variants, '[]')) x
    WHERE pm.product_id = v_id AND pm.id = (x->>'id')::UUID;

    -- Biến thể bị bỏ khỏi sản phẩm: ảnh của nó thành ảnh chung.
    UPDATE product_media SET variant_id = NULL
    WHERE product_id = v_id AND variant_id IS NOT NULL AND NOT (variant_id = ANY (v_keep));

    -- Đúng 1 ảnh chính: giữ ảnh chính hiện có, không còn thì lấy ảnh đầu.
    IF NOT EXISTS (SELECT 1 FROM product_media WHERE product_id = v_id AND is_primary) THEN
        UPDATE product_media SET is_primary = TRUE
        WHERE id = (SELECT id FROM product_media WHERE product_id = v_id
                    ORDER BY sort_order, created_at LIMIT 1);
    END IF;

    RETURN v_id;
END;
$$;

-- ── Giỏ hàng ────────────────────────────────────────────────────────────
CREATE TABLE public.cart_items (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id   UUID        NOT NULL REFERENCES public.buyer_profiles(id) ON DELETE CASCADE,
    product_id UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID        REFERENCES public.product_variants(id) ON DELETE CASCADE,
    quantity   INT         NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mỗi (sản phẩm, biến thể) một dòng trong giỏ.
CREATE UNIQUE INDEX uq_cart_items_line ON public.cart_items
    (buyer_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID));

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items FORCE ROW LEVEL SECURITY;

CREATE POLICY cart_items_own ON public.cart_items
    FOR ALL USING (
        buyer_id IN (SELECT id FROM public.buyer_profiles WHERE user_id = auth.uid())
    ) WITH CHECK (
        buyer_id IN (SELECT id FROM public.buyer_profiles WHERE user_id = auth.uid())
    );
CREATE POLICY cart_items_active_user_insert ON public.cart_items
    AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_active_user());
CREATE POLICY cart_items_active_user_update ON public.cart_items
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY cart_items_active_user_delete ON public.cart_items
    AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_active_user());

-- Thêm / đặt số lượng một dòng giỏ. SECURITY INVOKER: RLS của giỏ vẫn áp dụng.
CREATE FUNCTION public.cart_set_item(
    p_product_id UUID,
    p_variant_id UUID,
    p_quantity   INT,
    p_mode       TEXT DEFAULT 'add'
)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_buyer_id UUID;
    v_product  products%ROWTYPE;
    v_line     cart_items%ROWTYPE;
    v_qty      INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;
    SELECT id INTO v_buyer_id FROM buyer_profiles WHERE user_id = auth.uid();
    IF v_buyer_id IS NULL THEN
        RAISE EXCEPTION 'NOT_A_BUYER';
    END IF;
    IF p_quantity IS NULL OR p_quantity < 0 OR p_quantity > 1000000
       OR p_mode IS NULL OR p_mode NOT IN ('add', 'set') OR (p_mode = 'add' AND p_quantity = 0) THEN
        RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;

    SELECT * INTO v_line FROM cart_items
    WHERE buyer_id = v_buyer_id AND product_id = p_product_id
      AND variant_id IS NOT DISTINCT FROM p_variant_id
    FOR UPDATE;

    v_qty := CASE WHEN p_mode = 'add' THEN COALESCE(v_line.quantity, 0) + p_quantity ELSE p_quantity END;
    IF v_qty > 1000000 THEN
        RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;

    -- Bỏ dòng: không cần sản phẩm còn bán (để dọn được hàng đã ngừng bán).
    IF v_qty = 0 THEN
        DELETE FROM cart_items WHERE id = v_line.id;
        RETURN 0;
    END IF;

    SELECT * INTO v_product FROM products WHERE id = p_product_id;
    IF NOT FOUND OR v_product.status <> 'active'
       OR NOT public.supplier_is_public(v_product.supplier_id)
       OR EXISTS (SELECT 1 FROM supplier_profiles
                  WHERE id = v_product.supplier_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE';
    END IF;

    IF p_variant_id IS NULL THEN
        IF EXISTS (SELECT 1 FROM product_variants WHERE product_id = p_product_id AND is_active) THEN
            RAISE EXCEPTION 'VARIANT_REQUIRED';
        END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM product_variants
                      WHERE id = p_variant_id AND product_id = p_product_id AND is_active) THEN
        RAISE EXCEPTION 'VARIANT_NOT_AVAILABLE';
    END IF;

    IF v_line.id IS NOT NULL THEN
        UPDATE cart_items SET quantity = v_qty, updated_at = NOW() WHERE id = v_line.id;
    ELSE
        IF (SELECT count(*) FROM cart_items WHERE buyer_id = v_buyer_id) >= 100 THEN
            RAISE EXCEPTION 'CART_LIMIT_REACHED' USING DETAIL = 'Giỏ hàng tối đa 100 dòng.';
        END IF;
        INSERT INTO cart_items (buyer_id, product_id, variant_id, quantity)
        VALUES (v_buyer_id, p_product_id, p_variant_id, v_qty);
    END IF;
    RETURN v_qty;
END;
$$;

-- ── order_events: thêm 'order_accepted'; ghi chú tạo đơn theo nguồn ─────
ALTER TABLE public.order_events DROP CONSTRAINT order_events_event_type_check;
ALTER TABLE public.order_events ADD CONSTRAINT order_events_event_type_check
    CHECK (event_type IN (
        'order_created', 'order_accepted', 'payment_confirmed', 'producing_started',
        'shipped', 'delivered', 'dispute_opened', 'dispute_resolved',
        'completed', 'cancelled', 'note', 'document_added'
    ));

CREATE OR REPLACE FUNCTION public.log_order_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO order_events (order_id, actor_id, event_type, note)
    VALUES (NEW.id, auth.uid(), 'order_created',
            CASE WHEN NEW.source = 'direct'
                 THEN 'Buyer đặt hàng từ giỏ hàng — chờ xưởng xác nhận.'
                 ELSE 'Đơn hàng được tạo từ báo giá đã chấp nhận.' END);
    RETURN NEW;
END;
$$;

-- ── Đặt hàng ────────────────────────────────────────────────────────────
CREATE FUNCTION public.checkout_cart(p_address_id UUID DEFAULT NULL, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id  UUID;
    v_addr      buyer_addresses%ROWTYPE;
    v_shipping  TEXT;
    v_note      TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
    v_line      RECORD;
    v_qty_total INT;
    v_tier      NUMERIC;
    v_price     NUMERIC;
    v_stock     INT;
    v_order_id  UUID;
    v_orders    JSONB := '{}';   -- supplier_id → order_id
    v_sort      JSONB := '{}';   -- order_id → số dòng đã ghi
    v_n         INT;
    v_total     NUMERIC;
    v_supplier_user UUID;
    v_sid       TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;
    SELECT id INTO v_buyer_id FROM buyer_profiles WHERE user_id = auth.uid();
    IF v_buyer_id IS NULL THEN
        RAISE EXCEPTION 'NOT_A_BUYER';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cart_items WHERE buyer_id = v_buyer_id) THEN
        RAISE EXCEPTION 'CART_EMPTY';
    END IF;

    IF p_address_id IS NOT NULL THEN
        SELECT * INTO v_addr FROM buyer_addresses WHERE id = p_address_id AND buyer_id = v_buyer_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'ADDRESS_NOT_FOUND';
        END IF;
    ELSE
        SELECT * INTO v_addr FROM buyer_addresses WHERE buyer_id = v_buyer_id AND is_default;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'ADDRESS_REQUIRED';
        END IF;
    END IF;
    v_shipping := btrim(v_addr.recipient_name) || ' — ' || btrim(v_addr.phone) || E'\n'
        || concat_ws(', ', btrim(v_addr.address_line), NULLIF(btrim(v_addr.ward), ''),
                     NULLIF(btrim(v_addr.district), ''), btrim(v_addr.province));

    -- Khoá giỏ + sản phẩm + biến thể theo thứ tự cố định (tránh deadlock khi 2
    -- buyer đặt cùng lúc) rồi xử lý từng dòng.
    FOR v_line IN
        SELECT c.id AS cart_id, c.quantity, c.variant_id,
               p.id AS product_id, p.name, p.status, p.supplier_id, p.min_order_qty,
               p.is_ready_stock, p.stock_qty AS product_stock,
               v.id AS v_id, v.is_active AS v_active, v.stock_qty AS variant_stock,
               v.price_adjustment, v.color, v.size, v.material
        FROM cart_items c
        JOIN products p ON p.id = c.product_id
        LEFT JOIN product_variants v ON v.id = c.variant_id
        WHERE c.buyer_id = v_buyer_id
        ORDER BY p.supplier_id, p.id, c.variant_id NULLS FIRST
        FOR UPDATE OF c, p
    LOOP
        IF v_line.status <> 'active' OR NOT public.supplier_is_public(v_line.supplier_id)
           OR EXISTS (SELECT 1 FROM supplier_profiles
                      WHERE id = v_line.supplier_id AND user_id = auth.uid()) THEN
            RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE' USING DETAIL = v_line.name;
        END IF;
        IF v_line.variant_id IS NULL THEN
            IF EXISTS (SELECT 1 FROM product_variants
                       WHERE product_id = v_line.product_id AND is_active) THEN
                RAISE EXCEPTION 'VARIANT_REQUIRED' USING DETAIL = v_line.name;
            END IF;
        ELSIF v_line.v_id IS NULL OR NOT v_line.v_active THEN
            RAISE EXCEPTION 'VARIANT_NOT_AVAILABLE' USING DETAIL = v_line.name;
        END IF;

        -- Bậc giá theo TỔNG số lượng của sản phẩm trong giỏ (mọi biến thể).
        SELECT sum(quantity) INTO v_qty_total FROM cart_items
        WHERE buyer_id = v_buyer_id AND product_id = v_line.product_id;
        IF v_qty_total < v_line.min_order_qty THEN
            RAISE EXCEPTION 'BELOW_MIN_ORDER_QTY'
                USING DETAIL = format('%s (tối thiểu %s)', v_line.name, v_line.min_order_qty);
        END IF;
        SELECT t.unit_price INTO v_tier FROM price_tiers t
        WHERE t.product_id = v_line.product_id AND t.min_qty <= v_qty_total
          AND (t.max_qty IS NULL OR t.max_qty >= v_qty_total)
        ORDER BY t.min_qty DESC LIMIT 1;
        IF v_tier IS NULL THEN
            RAISE EXCEPTION 'PRICE_NOT_AVAILABLE' USING DETAIL = v_line.name;
        END IF;
        v_price := v_tier + COALESCE(v_line.price_adjustment, 0);
        IF v_price < 0 THEN
            RAISE EXCEPTION 'PRICE_NOT_AVAILABLE' USING DETAIL = v_line.name;
        END IF;

        -- Tồn kho: chỉ hàng có sẵn.
        IF v_line.is_ready_stock THEN
            IF v_line.variant_id IS NOT NULL THEN
                SELECT stock_qty INTO v_stock FROM product_variants WHERE id = v_line.variant_id FOR UPDATE;
            ELSE
                v_stock := v_line.product_stock;
            END IF;
            IF v_stock < v_line.quantity THEN
                RAISE EXCEPTION 'OUT_OF_STOCK'
                    USING DETAIL = format('%s (còn %s)', v_line.name, v_stock);
            END IF;
            IF v_line.variant_id IS NOT NULL THEN
                UPDATE product_variants SET stock_qty = stock_qty - v_line.quantity WHERE id = v_line.variant_id;
            ELSE
                UPDATE products SET stock_qty = stock_qty - v_line.quantity WHERE id = v_line.product_id;
            END IF;
        END IF;

        -- Mỗi xưởng một đơn.
        v_sid := v_line.supplier_id::TEXT;
        IF v_orders ? v_sid THEN
            v_order_id := (v_orders ->> v_sid)::UUID;
        ELSE
            -- quantity = 1, unit_price = 0 lúc tạo; cột cũ được đặt lại ở cuối
            -- để total_amount (cũ) = total (mới) cho tới khi bỏ cột cũ ở 5.10.
            INSERT INTO orders (source, buyer_id, supplier_id, quantity, unit_price, status, shipping_address)
            VALUES ('direct', v_buyer_id, v_line.supplier_id, 1, 0, 'pending_confirmation', v_shipping)
            RETURNING id INTO v_order_id;
            v_orders := v_orders || jsonb_build_object(v_sid, v_order_id);
        END IF;

        v_n := COALESCE((v_sort ->> v_order_id::TEXT)::INT, 0);
        INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_label,
                                 unit, quantity, unit_price, sort_order, stock_deducted)
        VALUES (v_order_id, v_line.product_id, v_line.variant_id, v_line.name,
                NULLIF(concat_ws(' · ', NULLIF(btrim(v_line.color), ''), NULLIF(btrim(v_line.size), ''),
                                 NULLIF(btrim(v_line.material), '')), ''),
                'cái', v_line.quantity, v_price, v_n, v_line.is_ready_stock);
        v_sort := v_sort || jsonb_build_object(v_order_id::TEXT, v_n + 1);
    END LOOP;

    -- Hoàn tất từng đơn: đồng bộ cột cũ, ghi chú của buyer, báo xưởng.
    FOR v_sid, v_order_id IN SELECT key, value::UUID FROM jsonb_each_text(v_orders) LOOP
        SELECT total INTO v_total FROM orders WHERE id = v_order_id;
        UPDATE orders SET unit_price = v_total WHERE id = v_order_id;

        IF v_note IS NOT NULL THEN
            INSERT INTO order_events (order_id, actor_id, event_type, note, metadata)
            VALUES (v_order_id, auth.uid(), 'note', v_note, jsonb_build_object('actor_role', 'buyer'));
        END IF;

        SELECT user_id INTO v_supplier_user FROM supplier_profiles WHERE id = v_sid::UUID;
        INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
        VALUES (v_supplier_user, 'order_placed',
                'Đơn đặt hàng mới #' || UPPER(LEFT(v_order_id::TEXT, 8)),
                'Buyer vừa đặt hàng trực tiếp. Vui lòng nhận hoặc từ chối đơn.',
                jsonb_build_object('order_id', v_order_id), 'in_app', 'sent', NOW());
    END LOOP;

    DELETE FROM cart_items WHERE buyer_id = v_buyer_id;

    RETURN jsonb_build_object(
        'order_ids', (SELECT COALESCE(jsonb_agg(value), '[]') FROM jsonb_each_text(v_orders)));
END;
$$;

-- ── Xưởng nhận / từ chối đơn đặt thẳng ─────────────────────────────────
CREATE FUNCTION public.supplier_respond_order(p_order_id UUID, p_accept BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order      orders%ROWTYPE;
    v_reason     TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
    v_buyer_user UUID;
    v_label      TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;

    SELECT o.* INTO v_order FROM orders o
    JOIN supplier_profiles sp ON sp.id = o.supplier_id
    WHERE o.id = p_order_id AND sp.user_id = auth.uid()
    FOR UPDATE OF o;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF v_order.status <> 'pending_confirmation' THEN
        RAISE EXCEPTION 'ORDER_NOT_PENDING_CONFIRMATION';
    END IF;
    IF p_accept IS NULL OR (NOT p_accept AND v_reason IS NULL) THEN
        RAISE EXCEPTION 'REASON_REQUIRED' USING DETAIL = 'Từ chối đơn phải ghi lý do.';
    END IF;

    SELECT user_id INTO v_buyer_user FROM buyer_profiles WHERE id = v_order.buyer_id;
    v_label := '#' || UPPER(LEFT(p_order_id::TEXT, 8));

    IF p_accept THEN
        UPDATE orders SET status = 'pending_payment', updated_at = NOW() WHERE id = p_order_id;
        INSERT INTO order_events (order_id, actor_id, event_type, metadata)
        VALUES (p_order_id, auth.uid(), 'order_accepted', jsonb_build_object('actor_role', 'supplier'));
        INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
        VALUES (v_buyer_user, 'order_placed', 'Xưởng đã nhận đơn ' || v_label,
                'Vui lòng chuyển khoản theo hướng dẫn ở trang đơn hàng để xưởng bắt đầu sản xuất.',
                jsonb_build_object('order_id', p_order_id), 'in_app', 'sent', NOW());
        RETURN jsonb_build_object('order_id', p_order_id, 'status', 'pending_payment');
    END IF;

    -- trg_handle_order_status_change ghi event 'cancelled';
    -- trg_restore_stock_on_cancel cộng lại kho đã trừ.
    UPDATE orders SET status = 'cancelled', cancel_reason = v_reason, updated_at = NOW()
    WHERE id = p_order_id;
    INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
    VALUES (v_buyer_user, 'order_declined', 'Xưởng từ chối đơn ' || v_label,
            'Lý do: ' || v_reason, jsonb_build_object('order_id', p_order_id), 'in_app', 'sent', NOW());
    RETURN jsonb_build_object('order_id', p_order_id, 'status', 'cancelled');
END;
$$;

-- Đơn bị huỷ (xưởng từ chối, admin huỷ): cộng lại kho đã trừ lúc đặt.
CREATE FUNCTION public.restore_stock_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item RECORD;
BEGIN
    FOR v_item IN
        SELECT id, product_id, variant_id, quantity FROM order_items
        WHERE order_id = NEW.id AND stock_deducted
        ORDER BY product_id, variant_id
        FOR UPDATE
    LOOP
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE product_variants SET stock_qty = stock_qty + v_item.quantity WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE products SET stock_qty = stock_qty + v_item.quantity WHERE id = v_item.product_id;
        END IF;
        UPDATE order_items SET stock_deducted = FALSE WHERE id = v_item.id;
    END LOOP;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_restore_stock_on_cancel
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW
    WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
    EXECUTE FUNCTION public.restore_stock_on_cancel();

REVOKE ALL ON FUNCTION public.restore_stock_on_cancel() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cart_set_item(UUID, UUID, INT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.checkout_cart(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supplier_respond_order(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cart_set_item(UUID, UUID, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_cart(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_respond_order(UUID, BOOLEAN, TEXT) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — cart_items, cart_set_item(), checkout_cart(), supplier_respond_order(), hàng có sẵn';
END $$;

COMMIT;
