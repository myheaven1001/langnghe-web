-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- FIX BẢO MẬT (kế hoạch 1.3): kiểm tra mọi UPDATE trên orders theo vai trò.
--
-- Lỗ hổng: orders_update (20260905121000) cho buyer, supplier của đơn và
-- admin UPDATE cả hàng, không giới hạn cột hay trạng thái. Ví dụ:
--   - supplier tự đặt status = 'confirmed' (giả "admin đã nhận tiền") rồi
--     sản xuất/giao theo đơn chưa thanh toán;
--   - buyer tự sửa unit_price/quantity của đơn đã chốt, hoặc tự đặt
--     'completed' khi chưa nhận hàng;
--   - bất kỳ bên nào sửa payment_confirmed_by/payment_note.
--
-- Sau migration, với role `authenticated` (app):
--   Chuyển trạng thái chỉ theo bảng sau (không có dòng nào khác):
--     admin    pending_payment → confirmed
--     admin    (mọi trạng thái trừ completed/cancelled) → cancelled,
--              bắt buộc cancel_reason
--     supplier confirmed → producing
--     supplier producing → shipped, bắt buộc logistics_provider và
--              tracking_number (trừ 'Tự vận chuyển')
--     buyer    shipped → delivered, delivered → completed
--   Người không phải admin không sửa được: quantity, unit_price, currency,
--   buyer_id, supplier_id, rfq_quote_id, payment_confirmed_by, payment_note,
--   cancel_reason, confirmed_at, shipped_at, delivered_at, completed_at.
--   Buyer không sửa logistics_provider/tracking_number; supplier không sửa
--   shipping_address.
-- Không đổi: hàm SECURITY DEFINER (accept_quote, job tự hoàn tất đơn ở
-- bước 3), service_role, SQL Editor — current_user khác 'authenticated'.
--
-- Thứ tự trigger: Postgres chạy các trigger BEFORE cùng bảng theo tên, nên
-- trg_guard_order_update chạy TRƯỚC trg_handle_order_status_change
-- (20260925090000) — chặn trước khi ghi order_events/stamp thời gian.
--
-- Mã lỗi (lọc log theo FORBIDDEN_ / ORDER_):
--   FORBIDDEN_ORDER_STATUS_CHANGE   chuyển trạng thái không có trong bảng
--   FORBIDDEN_ORDER_FIELD_CHANGE    sửa cột không được phép
--   ORDER_CANCEL_REASON_REQUIRED    huỷ đơn không ghi lý do
--   ORDER_TRACKING_REQUIRED         giao hàng thiếu đơn vị/mã vận đơn
--
-- Migration rủi ro (chạm luồng đơn hàng đang chạy): quay lui bằng
-- supabase/rollback/20261005090300_guard_order_update.sql.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_handle_order_status_change') THEN
        RAISE EXCEPTION 'Không tìm thấy trg_handle_order_status_change. Chạy 20260925090000 trước.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_order_update') THEN
        RAISE EXCEPTION 'trg_guard_order_update đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

-- Mở rộng: cột mới cho phép trống, đơn cũ không bị ảnh hưởng.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
COMMENT ON COLUMN public.orders.cancel_reason IS
    'Lý do huỷ đơn — bắt buộc khi admin chuyển status sang cancelled (guard_order_update).';

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
           NEW.quantity             IS DISTINCT FROM OLD.quantity
        OR NEW.unit_price           IS DISTINCT FROM OLD.unit_price
        OR NEW.currency             IS DISTINCT FROM OLD.currency
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
            USING DETAIL = 'Chỉ admin được sửa giá, số lượng, bên mua/bán, thông tin thanh toán và mốc thời gian.';
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

COMMENT ON FUNCTION public.guard_order_update IS
    'BEFORE UPDATE trên orders (kế hoạch 1.3): bảng chuyển trạng thái theo vai
     trò + cột chỉ admin được sửa. Không áp dụng cho SECURITY DEFINER,
     service_role, SQL Editor (current_user khác authenticated).';

CREATE TRIGGER trg_guard_order_update
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_order_update();

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — trg_guard_order_update (bảng chuyển trạng thái đơn hàng theo vai trò)';
END $$;

COMMIT;
