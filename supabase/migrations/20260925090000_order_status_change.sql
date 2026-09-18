-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Trigger khi orders.status đổi (dùng bởi /supplier/orders — 4.5, và mọi
-- luồng đổi status khác sau này: buyer xác nhận nhận hàng, admin xác nhận
-- thanh toán Giai đoạn 6...): tự ghi order_events tương ứng + tự stamp cột
-- timestamp phù hợp (confirmed_at/shipped_at/delivered_at/completed_at),
-- thay vì để từng nơi gọi orders.update() phải tự nhớ làm cả 2 việc.
--
-- Bổ sung cho trg_log_order_created (20260920090000, chỉ bắt INSERT) —
-- trigger đó không bắt được UPDATE status, nên các bước sau khi tạo đơn
-- (xác nhận thanh toán, bắt đầu sản xuất, giao hàng...) trước giờ không
-- ghi gì vào order_events cả.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_order_status_change') THEN
        RAISE EXCEPTION 'handle_order_status_change() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event_type VARCHAR(50);
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    CASE NEW.status
        WHEN 'confirmed' THEN
            NEW.confirmed_at := COALESCE(NEW.confirmed_at, NOW());
            v_event_type := 'payment_confirmed';
        WHEN 'producing' THEN
            v_event_type := 'producing_started';
        WHEN 'shipped' THEN
            NEW.shipped_at := COALESCE(NEW.shipped_at, NOW());
            v_event_type := 'shipped';
        WHEN 'delivered' THEN
            NEW.delivered_at := COALESCE(NEW.delivered_at, NOW());
            v_event_type := 'delivered';
        WHEN 'completed' THEN
            NEW.completed_at := COALESCE(NEW.completed_at, NOW());
            v_event_type := 'completed';
        WHEN 'cancelled' THEN
            v_event_type := 'cancelled';
        ELSE
            v_event_type := NULL;
    END CASE;

    IF v_event_type IS NOT NULL THEN
        INSERT INTO order_events (order_id, actor_id, event_type)
        VALUES (NEW.id, auth.uid(), v_event_type);
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_order_status_change
    BEFORE UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_order_status_change();

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — trg_handle_order_status_change (order_events + timestamp tự động khi orders.status đổi)';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_handle_order_status_change ON orders;
-- DROP FUNCTION IF EXISTS public.handle_order_status_change();
-- COMMIT;
