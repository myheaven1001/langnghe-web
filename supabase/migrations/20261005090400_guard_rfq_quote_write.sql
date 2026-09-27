-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- FIX BẢO MẬT (kế hoạch 1.5): xưởng không tự đổi trạng thái báo giá;
-- kèm SỬA LỖI: xưởng không gửi được báo giá.
--
-- Lỗ hổng: rfq_quotes_supplier_own (20260905121000) là FOR ALL với
-- USING (báo giá của xưởng mình OR is_admin()) — không giới hạn cột/trạng
-- thái. Xưởng có thể:
--   - tự đặt status = 'accepted' (buyer thấy "đã chấp nhận", thống kê
--     quote_win_rate sai) hoặc tạo báo giá mới ở trạng thái 'accepted';
--   - sửa giá/ghi chú SAU khi buyer đã chấp nhận (đơn hàng giữ giá cũ,
--     nhưng trang RFQ hiện giá mới);
--   - chuyển báo giá sang RFQ khác, hoặc xoá báo giá đã chấp nhận/từ chối;
--   - báo giá vào RFQ đã huỷ/đóng.
--
-- Lỗi: QuoteModal.tsx insert rfq_quotes KHÔNG gửi supplier_id, cột NOT NULL
-- không có mặc định → mọi lần xưởng gửi báo giá đều lỗi 23502 và hiện
-- "Không thể gửi báo giá". Trigger dưới đây tự điền supplier_id theo tài
-- khoản đang đăng nhập (và không cho điền supplier_id của xưởng khác).
--
-- Sau migration, với role `authenticated` không phải admin:
--   INSERT  chỉ xưởng; supplier_id = xưởng của mình (tự điền nếu trống);
--           status = 'pending'; RFQ phải còn mở (published/quoted/negotiating).
--   UPDATE  chỉ khi báo giá còn 'pending'; chỉ sửa unit_price, min_qty,
--           lead_time_days, note, valid_until (không đổi status, rfq_id,
--           supplier_id, created_at).
--   DELETE  chỉ khi báo giá còn 'pending' (rút báo giá).
-- Không đổi: accept_quote() (SECURITY DEFINER) vẫn đặt accepted/rejected;
-- admin, service_role, SQL Editor không bị kiểm tra.
--
-- Mã lỗi: FORBIDDEN_QUOTE_CHANGE, RFQ_NOT_OPEN.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.rfq_quotes') IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy rfq_quotes. Migration Sprint 1 chưa chạy.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_rfq_quote_write') THEN
        RAISE EXCEPTION 'trg_guard_rfq_quote_write đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_rfq_quote_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_supplier   UUID;
    v_rfq_status rfq_status;
BEGIN
    IF current_user <> 'authenticated' OR public.is_admin() THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    SELECT id INTO v_supplier FROM supplier_profiles WHERE user_id = auth.uid();

    IF TG_OP = 'INSERT' THEN
        IF v_supplier IS NULL THEN
            RAISE EXCEPTION 'FORBIDDEN_QUOTE_CHANGE'
                USING DETAIL = 'Chỉ tài khoản xưởng được gửi báo giá.';
        END IF;
        NEW.supplier_id := COALESCE(NEW.supplier_id, v_supplier);
        IF NEW.supplier_id <> v_supplier THEN
            RAISE EXCEPTION 'FORBIDDEN_QUOTE_CHANGE'
                USING DETAIL = 'Không được gửi báo giá dưới tên xưởng khác.';
        END IF;
        IF NEW.status <> 'pending' THEN
            RAISE EXCEPTION 'FORBIDDEN_QUOTE_CHANGE'
                USING DETAIL = format('Báo giá mới phải ở trạng thái pending, không phải %s.', NEW.status);
        END IF;
        SELECT status INTO v_rfq_status FROM rfq_requests WHERE id = NEW.rfq_id;
        IF v_rfq_status IS NULL OR v_rfq_status NOT IN ('published', 'quoted', 'negotiating') THEN
            RAISE EXCEPTION 'RFQ_NOT_OPEN'
                USING DETAIL = format('RFQ đang ở trạng thái %s, không nhận báo giá.', COALESCE(v_rfq_status::TEXT, 'không tồn tại'));
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE / DELETE: chỉ báo giá còn chờ buyer quyết định.
    IF OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'FORBIDDEN_QUOTE_CHANGE'
            USING DETAIL = format('Báo giá đã %s, không sửa/xoá được nữa.', OLD.status);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF NEW.status      IS DISTINCT FROM OLD.status
       OR NEW.rfq_id      IS DISTINCT FROM OLD.rfq_id
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
       OR NEW.created_at  IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'FORBIDDEN_QUOTE_CHANGE'
            USING DETAIL = 'Xưởng chỉ sửa được giá, số lượng tối thiểu, thời gian sản xuất, ghi chú, hạn báo giá.';
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_rfq_quote_write IS
    'BEFORE INSERT/UPDATE/DELETE trên rfq_quotes (kế hoạch 1.5): xưởng chỉ tạo
     báo giá pending cho RFQ còn mở (supplier_id tự điền), chỉ sửa/xoá khi còn
     pending, không đổi trạng thái. accept_quote/admin/service_role bỏ qua.';

CREATE TRIGGER trg_guard_rfq_quote_write
    BEFORE INSERT OR UPDATE OR DELETE ON public.rfq_quotes
    FOR EACH ROW EXECUTE FUNCTION public.guard_rfq_quote_write();

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — trg_guard_rfq_quote_write (báo giá: tự điền supplier_id, khoá trạng thái)';
END $$;

COMMIT;
