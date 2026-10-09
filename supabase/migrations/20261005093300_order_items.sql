-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 5.2 (MỞ RỘNG — chỉ thêm, code cũ vẫn chạy): đơn hàng nhiều dòng.
--
-- Hiện mỗi đơn chỉ có 1 mặt hàng nằm ngay trên dòng orders (quantity,
-- unit_price, total_amount). Giỏ hàng (5.4) cần 1 đơn nhiều mặt hàng.
--
--   order_items        Dòng hàng của đơn: tên sản phẩm / biến thể được CHÉP
--       lại lúc đặt (sửa sản phẩm sau này không đổi đơn), số lượng, đơn giá,
--       thành tiền. Buyer, xưởng của đơn và admin đọc; KHÔNG ai ghi qua API —
--       chỉ hàm tạo đơn (SECURITY DEFINER) ghi.
--   orders.source      'rfq' (đơn từ báo giá) | 'direct' (đơn đặt thẳng).
--   orders.rfq_quote_id cho phép trống, có ràng buộc: đơn 'rfq' phải có báo
--       giá, đơn 'direct' không có.
--   orders.total       Tổng tiền = tổng các dòng hàng, trigger tự tính lại mỗi
--       khi dòng hàng đổi. Người dùng app không sửa thẳng được total / source.
--   Đơn cũ: mỗi đơn được tạo đúng 1 dòng hàng từ quantity × unit_price. Cuối
--       migration có bước ĐỐI CHIẾU: số đơn, số dòng hàng và tổng tiền
--       trước/sau phải khớp tuyệt đối, lệch 1 đồng là huỷ cả migration.
--   Đơn mới từ báo giá: trigger trên orders tự tạo dòng hàng, nên
--       accept_quote() và Edge Function không phải sửa.
--   GIỮ NGUYÊN orders.quantity, unit_price, total_amount — code cũ vẫn đọc
--       được. Bỏ ở 5.10 sau khi mọi nơi đã đọc order_items / total.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.order_items') IS NOT NULL THEN
        RAISE EXCEPTION 'order_items đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'order_role') THEN
        RAISE EXCEPTION 'Thiếu order_role(). Chạy 20261005091900 (3.3) trước.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'guard_order_payment_columns') THEN
        RAISE EXCEPTION 'Thiếu guard_order_payment_columns(). Chạy 20261005092000 (3.6) trước.';
    END IF;
END $$;

-- ── orders: nguồn đơn + tổng tiền mới ──────────────────────────────────
ALTER TABLE public.orders
    ADD COLUMN source TEXT NOT NULL DEFAULT 'rfq' CHECK (source IN ('rfq', 'direct')),
    ADD COLUMN total  DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0);

ALTER TABLE public.orders ALTER COLUMN rfq_quote_id DROP NOT NULL;
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_source_quote CHECK (
    (source = 'rfq' AND rfq_quote_id IS NOT NULL)
    OR (source = 'direct' AND rfq_quote_id IS NULL)
);

COMMENT ON COLUMN public.orders.source IS 'rfq = đơn từ báo giá được chấp nhận; direct = đơn đặt thẳng từ giỏ hàng (5.4).';
COMMENT ON COLUMN public.orders.total  IS 'Tổng tiền = tổng order_items.line_total, trigger tự tính. Thay cho total_amount (bỏ ở 5.10).';

-- ── Dòng hàng ───────────────────────────────────────────────────────────
CREATE TABLE public.order_items (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID          NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    -- Liên kết về sản phẩm/biến thể gốc (đơn RFQ không có); tên và giá bên
    -- dưới là bản chép lúc đặt, không phụ thuộc sản phẩm còn hay mất.
    product_id    UUID          REFERENCES public.products(id) ON DELETE SET NULL,
    variant_id    UUID          REFERENCES public.product_variants(id) ON DELETE SET NULL,
    product_name  TEXT          NOT NULL CHECK (btrim(product_name) <> ''),
    variant_label TEXT,
    unit          TEXT,
    quantity      INT           NOT NULL CHECK (quantity > 0),
    unit_price    DECIMAL(14,2) NOT NULL CHECK (unit_price >= 0),
    line_total    DECIMAL(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    sort_order    INT           NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order   ON public.order_items (order_id, sort_order);
CREATE INDEX idx_order_items_product ON public.order_items (product_id) WHERE product_id IS NOT NULL;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;

CREATE POLICY order_items_select ON public.order_items
    FOR SELECT USING (public.order_role(order_id) IS NOT NULL);
-- Cố ý không có policy INSERT/UPDATE/DELETE: chỉ hàm tạo đơn ghi.

-- Tổng tiền của đơn luôn bằng tổng các dòng hàng.
CREATE FUNCTION public.sync_order_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END;
BEGIN
    UPDATE orders
    SET total = (SELECT COALESCE(sum(line_total), 0) FROM order_items WHERE order_id = v_order_id)
    WHERE id = v_order_id;
    IF TG_OP = 'UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
        UPDATE orders
        SET total = (SELECT COALESCE(sum(line_total), 0) FROM order_items WHERE order_id = OLD.order_id)
        WHERE id = OLD.order_id;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_order_total
    AFTER INSERT OR UPDATE OR DELETE ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION public.sync_order_total();

-- Đơn từ báo giá: tự tạo 1 dòng hàng từ chính đơn (tên lấy từ RFQ). Nhờ vậy
-- accept_quote() giữ nguyên. Đơn 'direct' do checkout_cart() tự ghi dòng hàng.
CREATE FUNCTION public.create_default_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_title TEXT;
    v_unit  TEXT;
BEGIN
    IF NEW.source <> 'rfq' THEN
        RETURN NULL;
    END IF;
    SELECT r.title, r.unit INTO v_title, v_unit
    FROM rfq_quotes q JOIN rfq_requests r ON r.id = q.rfq_id
    WHERE q.id = NEW.rfq_quote_id;

    INSERT INTO order_items (order_id, product_name, unit, quantity, unit_price)
    VALUES (NEW.id, COALESCE(NULLIF(btrim(v_title), ''), 'Đơn hàng'), v_unit, NEW.quantity, NEW.unit_price);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_create_default_order_item
    AFTER INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.create_default_order_item();

REVOKE ALL ON FUNCTION public.sync_order_total() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_default_order_item() FROM PUBLIC, anon, authenticated;

-- Người dùng app (kể cả admin) không sửa thẳng total / source.
CREATE OR REPLACE FUNCTION public.guard_order_payment_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;

    IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
        RAISE EXCEPTION 'FORBIDDEN_ORDER_FIELD_CHANGE'
            USING DETAIL = 'Số tiền/thời điểm đã nhận chỉ ghi qua admin_confirm_payment().';
    END IF;

    IF NEW.total IS DISTINCT FROM OLD.total OR NEW.source IS DISTINCT FROM OLD.source THEN
        RAISE EXCEPTION 'FORBIDDEN_ORDER_FIELD_CHANGE'
            USING DETAIL = 'Tổng tiền và nguồn đơn do hệ thống ghi, không sửa được.';
    END IF;

    IF public.is_admin()
       AND NOT EXISTS (SELECT 1 FROM buyer_profiles
                       WHERE id = OLD.buyer_id AND user_id = auth.uid())
       AND NOT EXISTS (SELECT 1 FROM supplier_profiles
                       WHERE id = OLD.supplier_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'FORBIDDEN_ADMIN_DIRECT_WRITE'
            USING DETAIL = 'Admin sửa đơn qua admin_confirm_payment() / admin_cancel_order().';
    END IF;

    RETURN NEW;
END;
$$;

-- ── Đơn cũ: mỗi đơn 1 dòng hàng ────────────────────────────────────────
INSERT INTO public.order_items (order_id, product_name, unit, quantity, unit_price, created_at)
SELECT o.id, COALESCE(NULLIF(btrim(r.title), ''), 'Đơn hàng'), r.unit, o.quantity, o.unit_price, o.created_at
FROM public.orders o
LEFT JOIN public.rfq_quotes q ON q.id = o.rfq_quote_id
LEFT JOIN public.rfq_requests r ON r.id = q.rfq_id;

-- ── Đối chiếu: lệch là huỷ cả migration ────────────────────────────────
DO $$
DECLARE
    v_orders       BIGINT;
    v_with_items   BIGINT;
    v_items        BIGINT;
    v_sum_old      NUMERIC;
    v_sum_new      NUMERIC;
    v_mismatch     BIGINT;
BEGIN
    SELECT count(*), COALESCE(sum(total_amount), 0), COALESCE(sum(total), 0),
           count(*) FILTER (WHERE total IS DISTINCT FROM total_amount)
    INTO v_orders, v_sum_old, v_sum_new, v_mismatch
    FROM public.orders;
    SELECT count(*), count(DISTINCT order_id) INTO v_items, v_with_items FROM public.order_items;

    IF v_items <> v_orders OR v_with_items <> v_orders OR v_sum_old <> v_sum_new OR v_mismatch <> 0 THEN
        RAISE EXCEPTION 'Đối chiếu order_items KHÔNG khớp: % đơn, % dòng hàng (% đơn có dòng), tổng cũ %, tổng mới %, % đơn lệch.',
            v_orders, v_items, v_with_items, v_sum_old, v_sum_new, v_mismatch;
    END IF;
    RAISE NOTICE 'Đối chiếu khớp: % đơn = % dòng hàng, tổng tiền % (cũ) = % (mới).',
        v_orders, v_items, v_sum_old, v_sum_new;
END $$;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — order_items, orders.source, orders.total';
END $$;

COMMIT;
