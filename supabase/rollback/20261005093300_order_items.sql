-- Quay lui 20261005093300_order_items.sql (xem README.md).
-- XOÁ bảng order_items và cột orders.source / orders.total. Chỉ chạy được khi
-- CHƯA có đơn đặt thẳng (source = 'direct'): các đơn đó không có báo giá và
-- không biểu diễn được bằng cấu trúc cũ. orders.quantity / unit_price /
-- total_amount vẫn còn nguyên nên đơn từ báo giá không mất gì.
-- Quay lui web về bản trước 5.3 TRƯỚC khi chạy file này.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.orders WHERE source = 'direct') THEN
        RAISE EXCEPTION 'Đã có đơn đặt thẳng (source = direct) — không quay lui được bằng script này.';
    END IF;
END $$;

DROP TRIGGER IF EXISTS trg_create_default_order_item ON public.orders;
DROP FUNCTION IF EXISTS public.create_default_order_item();
DROP TABLE IF EXISTS public.order_items;
DROP FUNCTION IF EXISTS public.sync_order_total();

-- Bản 20261005092200.
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

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_source_quote;
ALTER TABLE public.orders ALTER COLUMN rfq_quote_id SET NOT NULL;
ALTER TABLE public.orders DROP COLUMN IF EXISTS total, DROP COLUMN IF EXISTS source;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005093300';

COMMIT;
