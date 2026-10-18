-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 5.10 (thu gọn): bỏ cột cũ của orders và bảng tin nhắn cũ.
--
--   orders.quantity, orders.unit_price, orders.total_amount   Mô hình "mỗi
--       đơn 1 dòng hàng" từ trước 5.2. Số lượng / giá nằm ở order_items, tổng
--       ở orders.total (trigger sync_order_total). Web đọc total từ 5.3, các
--       hàm số liệu đọc total từ 20261005095000.
--       Phía ghi sửa trong file này:
--         accept_quote()              không ghi 2 cột cũ nữa
--         create_default_order_item() lấy số lượng của RFQ × giá của báo giá
--         checkout_cart()             không ghi / đồng bộ cột cũ nữa
--         guard_order_update()        bỏ kiểm tra 2 cột cũ
--   rfq_messages (+ mark_thread_read, mark_all_messages_read)   Đã chép sang
--       conversation_messages ở 5.9 (cột legacy_id) và chỉ đọc từ đó.
--
-- KIỂM TRA TRƯỚC KHI BỎ (dừng cả migration nếu sai):
--   - mọi đơn có ít nhất 1 dòng hàng;
--   - mọi tin trong rfq_messages đã có bản chép trong conversation_messages.
--
-- KHÔNG QUAY LUI ĐƯỢC DỮ LIỆU: bỏ cột / bảng là mất hẳn. Sao lưu production
-- (npm run backup:prod) ngay trước khi chạy. File rollback dựng lại cột và
-- hàm cũ (giá trị cột suy từ order_items), không dựng lại nội dung rfq_messages.
-- ============================================================

BEGIN;

DO $$
DECLARE
    v_no_items INT;
    v_missing  INT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total_amount') THEN
        RAISE EXCEPTION 'orders.total_amount không còn. Migration này đã chạy rồi.';
    END IF;
    IF to_regclass('public.conversation_messages') IS NULL THEN
        RAISE EXCEPTION 'Thiếu conversation_messages. Chạy 20261005093800 (5.9) trước.';
    END IF;

    SELECT count(*) INTO v_no_items FROM public.orders o
    WHERE NOT EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id = o.id);
    IF v_no_items > 0 THEN
        RAISE EXCEPTION 'Có % đơn chưa có dòng hàng — bỏ cột quantity/unit_price sẽ mất dữ liệu. Dừng.', v_no_items;
    END IF;

    IF to_regclass('public.rfq_messages') IS NOT NULL THEN
        SELECT count(*) INTO v_missing FROM public.rfq_messages m
        WHERE char_length(m.content) > 0
          AND NOT EXISTS (SELECT 1 FROM public.conversation_messages c WHERE c.legacy_id = m.id);
        IF v_missing > 0 THEN
            RAISE EXCEPTION 'Có % tin trong rfq_messages chưa được chép sang conversation_messages. Dừng.', v_missing;
        END IF;
    END IF;
END $$;

-- ── Phía ghi không dùng cột cũ nữa ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_order_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_is_admin    BOOLEAN;
    v_is_buyer    BOOLEAN;
    v_is_supplier BOOLEAN;
    v_allowed     BOOLEAN;
BEGIN
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;

    v_is_admin := public.is_admin();
    v_is_buyer := EXISTS (SELECT 1 FROM buyer_profiles
                          WHERE id = OLD.buyer_id AND user_id = auth.uid());
    v_is_supplier := EXISTS (SELECT 1 FROM supplier_profiles
                             WHERE id = OLD.supplier_id AND user_id = auth.uid());

    -- ── Cột chỉ admin (hoặc hệ thống) được sửa ─────────────────────────
    IF NOT v_is_admin AND (
           NEW.currency             IS DISTINCT FROM OLD.currency
        OR NEW.buyer_id             IS DISTINCT FROM OLD.buyer_id
        OR NEW.supplier_id          IS DISTINCT FROM OLD.supplier_id
        OR NEW.rfq_quote_id         IS DISTINCT FROM OLD.rfq_quote_id
        OR NEW.payment_confirmed_by IS DISTINCT FROM OLD.payment_confirmed_by
        OR NEW.payment_note         IS DISTINCT FROM OLD.payment_note
        OR NEW.cancel_reason        IS DISTINCT FROM OLD.cancel_reason
        OR NEW.confirmed_at         IS DISTINCT FROM OLD.confirmed_at
        OR NEW.shipped_at           IS DISTINCT FROM OLD.shipped_at
        OR NEW.delivered_at         IS DISTINCT FROM OLD.delivered_at
        OR NEW.completed_at         IS DISTINCT FROM OLD.completed_at
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_ORDER_FIELD_CHANGE'
            USING DETAIL = 'Chỉ admin được sửa bên mua/bán, thông tin thanh toán và mốc thời gian.';
    END IF;

    -- Vận chuyển là việc của xưởng, địa chỉ nhận là việc của buyer.
    IF NOT v_is_admin AND NOT v_is_supplier AND (
           NEW.logistics_provider IS DISTINCT FROM OLD.logistics_provider
        OR NEW.tracking_number    IS DISTINCT FROM OLD.tracking_number
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN_ORDER_FIELD_CHANGE'
            USING DETAIL = 'Chỉ xưởng của đơn được sửa đơn vị vận chuyển/mã vận đơn.';
    END IF;
    IF NOT v_is_admin AND NOT v_is_buyer
       AND NEW.shipping_address IS DISTINCT FROM OLD.shipping_address THEN
        RAISE EXCEPTION 'FORBIDDEN_ORDER_FIELD_CHANGE'
            USING DETAIL = 'Chỉ buyer của đơn được sửa địa chỉ nhận hàng.';
    END IF;

    -- ── Chuyển trạng thái ───────────────────────────────────────────────
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        v_allowed :=
               (v_is_admin    AND OLD.status = 'pending_payment' AND NEW.status = 'confirmed')
            OR (v_is_admin    AND NEW.status = 'cancelled'
                              AND OLD.status NOT IN ('completed', 'cancelled'))
            OR (v_is_supplier AND OLD.status = 'confirmed' AND NEW.status = 'producing')
            OR (v_is_supplier AND OLD.status = 'producing' AND NEW.status = 'shipped')
            OR (v_is_buyer    AND OLD.status = 'shipped'   AND NEW.status = 'delivered')
            OR (v_is_buyer    AND OLD.status = 'delivered' AND NEW.status = 'completed');

        IF NOT v_allowed THEN
            RAISE EXCEPTION 'FORBIDDEN_ORDER_STATUS_CHANGE'
                USING DETAIL = format('%s → %s không được phép với vai trò này.', OLD.status, NEW.status);
        END IF;

        IF NEW.status = 'cancelled' AND COALESCE(btrim(NEW.cancel_reason), '') = '' THEN
            RAISE EXCEPTION 'ORDER_CANCEL_REASON_REQUIRED'
                USING DETAIL = 'Huỷ đơn phải ghi lý do (orders.cancel_reason).';
        END IF;

        IF NEW.status = 'shipped' AND (
               COALESCE(btrim(NEW.logistics_provider), '') = ''
            OR (NEW.logistics_provider <> 'Tự vận chuyển'
                AND COALESCE(btrim(NEW.tracking_number), '') = '')
        ) THEN
            RAISE EXCEPTION 'ORDER_TRACKING_REQUIRED'
                USING DETAIL = 'Giao hàng phải có đơn vị vận chuyển và mã vận đơn (trừ Tự vận chuyển).';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.create_default_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_title TEXT;
    v_unit  TEXT;
    v_qty   INT;
    v_price NUMERIC;
BEGIN
    IF NEW.source <> 'rfq' THEN
        RETURN NULL;
    END IF;
    -- Từ 5.10 số lượng / đơn giá lấy thẳng từ RFQ và báo giá được chốt (giá
    -- trên báo giá luôn là đề nghị mới nhất của xưởng — 5.7).
    SELECT r.title, r.unit, r.quantity, q.unit_price INTO v_title, v_unit, v_qty, v_price
    FROM rfq_quotes q JOIN rfq_requests r ON r.id = q.rfq_id
    WHERE q.id = NEW.rfq_quote_id;

    INSERT INTO order_items (order_id, product_name, unit, quantity, unit_price)
    VALUES (NEW.id, COALESCE(NULLIF(btrim(v_title), ''), 'Đơn hàng'), v_unit, v_qty, v_price);
    RETURN NULL;
END;
$$;


CREATE OR REPLACE FUNCTION public.accept_quote(p_quote_id UUID, p_address_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id         UUID;
    v_quote            rfq_quotes%ROWTYPE;
    v_rfq              rfq_requests%ROWTYPE;
    v_addr             buyer_addresses%ROWTYPE;
    v_order_id         UUID;
    v_supplier_user_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    -- Trước đây chỉ trigger trên orders chặn (1.7); kiểm tra sớm để tài khoản
    -- bị khoá nhận đúng ACCOUNT_SUSPENDED thay vì ADDRESS_REQUIRED.
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;

    SELECT id INTO v_buyer_id FROM buyer_profiles WHERE user_id = auth.uid();
    IF v_buyer_id IS NULL THEN
        RAISE EXCEPTION 'NOT_A_BUYER';
    END IF;

    SELECT * INTO v_quote FROM rfq_quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND';
    END IF;

    -- Khóa dòng RFQ trước khi kiểm tra status (2 lần bấm gần nhau không
    -- cùng thắng — xem 20260919090100).
    SELECT * INTO v_rfq FROM rfq_requests WHERE id = v_quote.rfq_id FOR UPDATE;
    IF NOT FOUND OR v_rfq.buyer_id <> v_buyer_id THEN
        RAISE EXCEPTION 'NOT_YOUR_RFQ';
    END IF;

    IF v_rfq.status IN ('awarded', 'closed', 'expired', 'cancelled') THEN
        RAISE EXCEPTION 'RFQ_ALREADY_SETTLED';
    END IF;

    IF v_quote.status NOT IN ('pending', 'counter_offered') THEN
        RAISE EXCEPTION 'QUOTE_NOT_ACCEPTABLE';
    END IF;

    IF p_address_id IS NOT NULL THEN
        SELECT * INTO v_addr FROM buyer_addresses
        WHERE id = p_address_id AND buyer_id = v_buyer_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'ADDRESS_NOT_FOUND';
        END IF;
    ELSE
        SELECT * INTO v_addr FROM buyer_addresses
        WHERE buyer_id = v_buyer_id AND is_default;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'ADDRESS_REQUIRED';
        END IF;
    END IF;

    UPDATE rfq_quotes
    SET status = 'accepted', updated_at = NOW()
    WHERE id = p_quote_id;

    -- Đóng mọi báo giá đang hoạt động khác của RFQ này.
    UPDATE rfq_quotes
    SET status = 'rejected', updated_at = NOW()
    WHERE rfq_id = v_rfq.id
      AND id <> p_quote_id
      AND status IN ('pending', 'counter_offered');

    UPDATE rfq_requests SET status = 'awarded' WHERE id = v_rfq.id;

    -- Dòng hàng (số lượng của RFQ × giá của báo giá) do trigger
    -- trg_create_default_order_item tạo; total do trigger sync_order_total tính.
    INSERT INTO orders (rfq_quote_id, buyer_id, supplier_id, shipping_address)
    VALUES (
        p_quote_id, v_buyer_id, v_quote.supplier_id,
        btrim(v_addr.recipient_name) || ' — ' || btrim(v_addr.phone) || E'\n'
            || concat_ws(', ', btrim(v_addr.address_line), NULLIF(btrim(v_addr.ward), ''),
                         NULLIF(btrim(v_addr.district), ''), btrim(v_addr.province))
    )
    RETURNING id INTO v_order_id;

    SELECT user_id INTO v_supplier_user_id FROM supplier_profiles WHERE id = v_quote.supplier_id;

    INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
    VALUES (
        v_supplier_user_id, 'quote_accepted',
        'Báo giá của bạn đã được chấp nhận: ' || v_rfq.title,
        'Đơn hàng mới đã được tạo — chuẩn bị sản xuất và liên hệ buyer để thống nhất thanh toán.',
        jsonb_build_object('order_id', v_order_id, 'rfq_id', v_rfq.id),
        'in_app', 'sent', NOW()
    );

    INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
    SELECT sp.user_id, 'quote_rejected',
           'RFQ đã được chốt cho xưởng khác: ' || v_rfq.title,
           'Rất tiếc, buyer đã chọn báo giá khác cho yêu cầu này.',
           jsonb_build_object('rfq_id', v_rfq.id),
           'in_app', 'sent', NOW()
    FROM rfq_quotes q
    JOIN supplier_profiles sp ON sp.id = q.supplier_id
    WHERE q.rfq_id = v_rfq.id AND q.id <> p_quote_id AND q.status = 'rejected';

    RETURN jsonb_build_object('order_id', v_order_id, 'rfq_id', v_rfq.id);
END;
$$;


CREATE OR REPLACE FUNCTION public.checkout_cart(p_address_id UUID DEFAULT NULL, p_note TEXT DEFAULT NULL)
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
            INSERT INTO orders (source, buyer_id, supplier_id, status, shipping_address)
            VALUES ('direct', v_buyer_id, v_line.supplier_id, 'pending_confirmation', v_shipping)
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

    -- Hoàn tất từng đơn: ghi chú của buyer, báo xưởng.
    FOR v_sid, v_order_id IN SELECT key, value::UUID FROM jsonb_each_text(v_orders) LOOP
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


-- ── Bỏ cột cũ ──────────────────────────────────────────────────────────
-- total_amount là cột sinh từ quantity × unit_price nên bỏ trước.
ALTER TABLE public.orders DROP COLUMN total_amount;
ALTER TABLE public.orders DROP COLUMN quantity, DROP COLUMN unit_price;

COMMENT ON COLUMN public.orders.total IS
    'Tổng tiền = tổng order_items.line_total, trigger sync_order_total tự tính (từ 5.10 là nguồn duy nhất).';

-- ── Bỏ bảng tin nhắn cũ ────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication_tables
               WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rfq_messages') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.rfq_messages;
    END IF;
END $$;

DROP FUNCTION IF EXISTS public.mark_thread_read(UUID, UUID);
DROP FUNCTION IF EXISTS public.mark_all_messages_read();
DROP TABLE IF EXISTS public.rfq_messages;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — đã bỏ orders.quantity / unit_price / total_amount và rfq_messages';
END $$;

COMMIT;
