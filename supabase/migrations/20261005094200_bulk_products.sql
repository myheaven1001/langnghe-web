-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Bước 6 (Công cụ nhà bán): nhập nhiều sản phẩm một lần + sửa hàng loạt.
--
--   bulk_save_products(rows)   Xưởng nhập tối đa 200 sản phẩm từ bảng tính.
--       Mỗi dòng: name, category (tên hoặc slug danh mục), description,
--       min_order_qty, lead_time_days, unit_price (giá từ MOQ trở lên),
--       accept_oem, is_ready_stock, stock_qty. Sản phẩm tạo ra luôn ở trạng
--       thái NHÁP (chưa có ảnh) — xưởng thêm ảnh rồi mới bật bán. Dòng lỗi
--       không làm hỏng các dòng khác; hàm trả kết quả từng dòng.
--   bulk_update_products(ids, action, value)   Áp một thay đổi cho tối đa 200
--       sản phẩm của chính xưởng (bỏ qua sản phẩm bị sàn khoá / đã xoá):
--         adjust_price   value = phần trăm (−90 … 500); mọi bậc giá nhân theo
--                        tỷ lệ, làm tròn tới 100đ, tối thiểu 100đ
--         set_lead_time  value = số ngày (1 … 365)
--         set_moq        value = số lượng tối thiểu (≥ 1); bậc giá đầu tiên
--                        không đổi nên chỉ nhận khi vẫn có giá cho MOQ mới
--       Trả số sản phẩm đã đổi.
--   Cả hai là SECURITY INVOKER: quyền do RLS + trigger sẵn có quyết định.
--
-- Mã lỗi: NOT_A_SUPPLIER, ACCOUNT_SUSPENDED, INVALID_INPUT, BULK_LIMIT.
-- Mã lỗi theo dòng (trong kết quả): NAME_REQUIRED, CATEGORY_NOT_FOUND,
--   INVALID_MOQ, INVALID_LEAD_TIME, INVALID_PRICE, INVALID_STOCK, INVALID_NUMBER,
--   DUPLICATE_NAME, ROW_FAILED.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'bulk_save_products') THEN
        RAISE EXCEPTION 'bulk_save_products() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'products'
                     AND column_name = 'is_ready_stock') THEN
        RAISE EXCEPTION 'Thiếu products.is_ready_stock. Chạy 20261005093400 trước.';
    END IF;
END $$;

-- "có" / "x" / "1" / "true" / "yes" → TRUE (ô đánh dấu trong bảng tính).
CREATE FUNCTION public.parse_flag(p_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT lower(btrim(COALESCE(p_value, ''))) IN ('1', 'true', 'yes', 'y', 'x', 'có', 'co');
$$;

CREATE FUNCTION public.bulk_save_products(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_supplier UUID;
    v_row      JSONB;
    v_index    INT := 0;
    v_results  JSONB := '[]';
    v_name     TEXT;
    v_cat_text TEXT;
    v_category UUID;
    v_moq      INT;
    v_lead     INT;
    v_price    NUMERIC;
    v_ready    BOOLEAN;
    v_stock    INT;
    v_id       UUID;
    v_error    TEXT;
    v_created  INT := 0;
BEGIN
    SELECT id INTO v_supplier FROM supplier_profiles WHERE user_id = auth.uid();
    IF v_supplier IS NULL THEN
        RAISE EXCEPTION 'NOT_A_SUPPLIER';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT';
    END IF;
    IF jsonb_array_length(p_rows) > 200 THEN
        RAISE EXCEPTION 'BULK_LIMIT' USING DETAIL = 'Mỗi lần nhập tối đa 200 dòng.';
    END IF;

    FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
        v_index := v_index + 1;
        v_error := NULL;
        v_id := NULL;

        -- Mỗi dòng một khối riêng: lỗi (kể cả ép kiểu số) chỉ hỏng dòng đó.
        BEGIN
            v_name := NULLIF(btrim(COALESCE(v_row->>'name', '')), '');
            v_cat_text := lower(btrim(COALESCE(v_row->>'category', '')));
            IF v_name IS NULL OR char_length(v_name) > 200 THEN
                RAISE EXCEPTION 'NAME_REQUIRED';
            END IF;

            SELECT c.id INTO v_category FROM categories c
            WHERE c.is_active AND (c.slug = v_cat_text OR lower(c.name) = v_cat_text)
            ORDER BY (c.slug = v_cat_text) DESC
            LIMIT 1;
            IF v_category IS NULL THEN
                RAISE EXCEPTION 'CATEGORY_NOT_FOUND';
            END IF;

            v_moq := NULLIF(btrim(COALESCE(v_row->>'min_order_qty', '')), '')::INT;
            IF v_moq IS NULL OR v_moq < 1 THEN
                RAISE EXCEPTION 'INVALID_MOQ';
            END IF;
            v_lead := NULLIF(btrim(COALESCE(v_row->>'lead_time_days', '')), '')::INT;
            IF v_lead IS NULL OR v_lead NOT BETWEEN 1 AND 365 THEN
                RAISE EXCEPTION 'INVALID_LEAD_TIME';
            END IF;
            v_price := NULLIF(btrim(COALESCE(v_row->>'unit_price', '')), '')::NUMERIC;
            IF v_price IS NOT NULL AND (v_price <= 0 OR v_price >= 1000000000000) THEN
                RAISE EXCEPTION 'INVALID_PRICE';
            END IF;
            v_ready := public.parse_flag(v_row->>'is_ready_stock');
            v_stock := COALESCE(NULLIF(btrim(COALESCE(v_row->>'stock_qty', '')), '')::INT, 0);
            IF v_stock < 0 THEN
                RAISE EXCEPTION 'INVALID_STOCK';
            END IF;

            IF EXISTS (SELECT 1 FROM products
                       WHERE supplier_id = v_supplier AND status <> 'deleted'
                         AND lower(name) = lower(v_name)) THEN
                RAISE EXCEPTION 'DUPLICATE_NAME';
            END IF;

            INSERT INTO products (supplier_id, name, category_id, description, accept_oem,
                                  accept_custom, min_order_qty, lead_time_days, status,
                                  is_ready_stock, stock_qty)
            VALUES (v_supplier, v_name, v_category,
                    NULLIF(left(btrim(COALESCE(v_row->>'description', '')), 5000), ''),
                    public.parse_flag(v_row->>'accept_oem'), FALSE,
                    v_moq, v_lead, 'draft', v_ready, CASE WHEN v_ready THEN v_stock ELSE 0 END)
            RETURNING id INTO v_id;

            IF v_price IS NOT NULL THEN
                INSERT INTO price_tiers (product_id, min_qty, max_qty, unit_price)
                VALUES (v_id, v_moq, NULL, v_price);
            END IF;
            v_created := v_created + 1;
        EXCEPTION
            WHEN invalid_text_representation OR numeric_value_out_of_range THEN
                v_error := 'INVALID_NUMBER';
            WHEN raise_exception THEN
                v_error := SQLERRM;
            WHEN OTHERS THEN
                v_error := 'ROW_FAILED';
        END;

        v_results := v_results || jsonb_build_object(
            'row', v_index, 'ok', v_error IS NULL, 'id', v_id, 'error', v_error);
    END LOOP;

    RETURN jsonb_build_object('created', v_created, 'failed', v_index - v_created, 'results', v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_save_products(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_save_products(JSONB) TO authenticated;

CREATE FUNCTION public.bulk_update_products(p_ids UUID[], p_action TEXT, p_value NUMERIC)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_supplier UUID;
    v_ids      UUID[];
    v_count    INT := 0;
BEGIN
    SELECT id INTO v_supplier FROM supplier_profiles WHERE user_id = auth.uid();
    IF v_supplier IS NULL THEN
        RAISE EXCEPTION 'NOT_A_SUPPLIER';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;
    IF p_ids IS NULL OR cardinality(p_ids) = 0 OR p_value IS NULL
       OR p_action IS NULL OR p_action NOT IN ('adjust_price', 'set_lead_time', 'set_moq') THEN
        RAISE EXCEPTION 'INVALID_INPUT';
    END IF;
    IF cardinality(p_ids) > 200 THEN
        RAISE EXCEPTION 'BULK_LIMIT' USING DETAIL = 'Mỗi lần sửa tối đa 200 sản phẩm.';
    END IF;

    -- Chỉ sản phẩm của chính xưởng, chưa xoá, không bị sàn khoá.
    SELECT array_agg(id) INTO v_ids FROM products
    WHERE id = ANY (p_ids) AND supplier_id = v_supplier AND status NOT IN ('deleted', 'blocked');
    IF v_ids IS NULL THEN
        RETURN 0;
    END IF;

    IF p_action = 'adjust_price' THEN
        IF p_value < -90 OR p_value > 500 OR p_value = 0 THEN
            RAISE EXCEPTION 'INVALID_INPUT' USING DETAIL = 'Phần trăm từ -90 đến 500, khác 0.';
        END IF;
        UPDATE price_tiers
        SET unit_price = GREATEST(round(unit_price * (1 + p_value / 100.0) / 100) * 100, 100)
        WHERE product_id = ANY (v_ids);
        SELECT count(DISTINCT product_id) INTO v_count FROM price_tiers WHERE product_id = ANY (v_ids);
        UPDATE products SET updated_at = NOW()
        WHERE id = ANY (v_ids) AND EXISTS (SELECT 1 FROM price_tiers t WHERE t.product_id = products.id);
    ELSIF p_action = 'set_lead_time' THEN
        IF p_value <> trunc(p_value) OR p_value NOT BETWEEN 1 AND 365 THEN
            RAISE EXCEPTION 'INVALID_INPUT' USING DETAIL = 'Số ngày từ 1 đến 365.';
        END IF;
        UPDATE products SET lead_time_days = p_value::INT, updated_at = NOW() WHERE id = ANY (v_ids);
        GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSE
        IF p_value <> trunc(p_value) OR p_value < 1 OR p_value > 100000000 THEN
            RAISE EXCEPTION 'INVALID_INPUT' USING DETAIL = 'Số lượng tối thiểu phải từ 1.';
        END IF;
        -- Bỏ qua sản phẩm mà MOQ mới rơi ra ngoài mọi bậc giá (sẽ thành "chưa có giá").
        UPDATE products p SET min_order_qty = p_value::INT, updated_at = NOW()
        WHERE p.id = ANY (v_ids)
          AND (NOT EXISTS (SELECT 1 FROM price_tiers t WHERE t.product_id = p.id)
               OR EXISTS (SELECT 1 FROM price_tiers t
                          WHERE t.product_id = p.id AND t.min_qty <= p_value::INT
                            AND (t.max_qty IS NULL OR t.max_qty >= p_value::INT)));
        GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_products(UUID[], TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_products(UUID[], TEXT, NUMERIC) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — bulk_save_products(), bulk_update_products()';
END $$;

COMMIT;
