-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- FIX BẢO MẬT (kế hoạch 1.8): giới hạn buyer ghi rfq_requests.
--
-- Lỗ hổng: rfq_requests_buyer_own (20260905121000) là FOR ALL với
-- USING (RFQ của mình OR is_admin()). Buyer có thể:
--   - INSERT thẳng một RFQ, bỏ qua create_rfq() → không trừ hạn mức tháng,
--     không trừ credit. Với rfq_type = 'multi', status = 'published' mọi
--     xưởng cùng ngành hàng đều thấy (rfq_requests_supplier_view) — vượt
--     hạn mức hoàn toàn;
--   - tự đặt status = 'awarded'/'closed'/'quoted' (thống kê rfq_metrics sai,
--     xưởng thấy RFQ "đã chốt" giả);
--   - đổi nội dung (số lượng, ngân sách…) SAU khi xưởng đã báo giá theo nội
--     dung cũ; đổi rfq_type single → multi để lọt vào hộp thư mọi xưởng;
--   - DELETE RFQ (mất lịch sử; lỗi FK nếu đã có báo giá).
--
-- Sau migration, với role `authenticated` không phải admin:
--   INSERT  không được — tạo RFQ qua /rfq/new → Edge Function create-rfq →
--           create_rfq() (SECURITY DEFINER, kiểm tra và trừ hạn mức).
--   DELETE  không được — dùng Huỷ.
--   UPDATE  chỉ 2 việc:
--     - Huỷ: status draft/published/quoted/negotiating → cancelled, không
--       đổi cột nào khác (đúng việc CancelRfqButton làm);
--     - Sửa nội dung (title, requirements, quantity, unit, budget_min,
--       budget_max, deadline_days, category_id, product_id) khi RFQ còn
--       draft/published và CHƯA có báo giá nào.
--     Không bao giờ đổi buyer_id, rfq_type, created_at, expires_at.
-- Không đổi: create_rfq, log_quote_received (→ quoted), accept_quote
-- (→ awarded) là SECURITY DEFINER; admin, service_role, SQL Editor.
--
-- Mã lỗi: FORBIDDEN_RFQ_CHANGE, RFQ_HAS_QUOTES.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_rfq') THEN
        RAISE EXCEPTION 'Không tìm thấy create_rfq(). Chạy 20260918090000 trước — nếu không, buyer sẽ không còn cách nào tạo RFQ.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_rfq_request_write') THEN
        RAISE EXCEPTION 'trg_guard_rfq_request_write đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_rfq_request_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_content_changed BOOLEAN;
BEGIN
    IF current_user <> 'authenticated' OR public.is_admin() THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF TG_OP = 'INSERT' THEN
        RAISE EXCEPTION 'FORBIDDEN_RFQ_CHANGE'
            USING DETAIL = 'Tạo RFQ qua trang Gửi yêu cầu báo giá (create_rfq) để tính hạn mức.';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'FORBIDDEN_RFQ_CHANGE'
            USING DETAIL = 'Không xoá được RFQ; dùng Huỷ yêu cầu.';
    END IF;

    IF NEW.buyer_id   IS DISTINCT FROM OLD.buyer_id
       OR NEW.rfq_type   IS DISTINCT FROM OLD.rfq_type
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
        RAISE EXCEPTION 'FORBIDDEN_RFQ_CHANGE'
            USING DETAIL = 'Không đổi được người gửi, loại RFQ, ngày tạo, hạn RFQ.';
    END IF;

    v_content_changed :=
           NEW.title         IS DISTINCT FROM OLD.title
        OR NEW.requirements  IS DISTINCT FROM OLD.requirements
        OR NEW.quantity      IS DISTINCT FROM OLD.quantity
        OR NEW.unit          IS DISTINCT FROM OLD.unit
        OR NEW.budget_min    IS DISTINCT FROM OLD.budget_min
        OR NEW.budget_max    IS DISTINCT FROM OLD.budget_max
        OR NEW.deadline_days IS DISTINCT FROM OLD.deadline_days
        OR NEW.category_id   IS DISTINCT FROM OLD.category_id
        OR NEW.product_id    IS DISTINCT FROM OLD.product_id;

    -- Huỷ.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status <> 'cancelled'
           OR OLD.status NOT IN ('draft', 'published', 'quoted', 'negotiating')
           OR v_content_changed THEN
            RAISE EXCEPTION 'FORBIDDEN_RFQ_CHANGE'
                USING DETAIL = format('%s → %s: buyer chỉ được huỷ RFQ đang mở (không kèm sửa nội dung).',
                                      OLD.status, NEW.status);
        END IF;
        RETURN NEW;
    END IF;

    -- Sửa nội dung: chỉ khi chưa xưởng nào báo giá theo nội dung cũ.
    -- rfq_quotes đọc qua RLS của buyer (rfq_quotes_buyer_view cho thấy báo
    -- giá của RFQ mình), nên EXISTS thấy đủ.
    IF v_content_changed THEN
        IF OLD.status NOT IN ('draft', 'published')
           OR EXISTS (SELECT 1 FROM rfq_quotes WHERE rfq_id = OLD.id) THEN
            RAISE EXCEPTION 'RFQ_HAS_QUOTES'
                USING DETAIL = 'RFQ đã có báo giá hoặc không còn mở — không sửa nội dung được; huỷ và gửi RFQ mới.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_rfq_request_write IS
    'BEFORE INSERT/UPDATE/DELETE trên rfq_requests (kế hoạch 1.8): buyer không
     INSERT/DELETE (dùng create_rfq / Huỷ), chỉ huỷ RFQ đang mở hoặc sửa nội
     dung khi chưa có báo giá. SECURITY DEFINER/admin/service_role bỏ qua.';

CREATE TRIGGER trg_guard_rfq_request_write
    BEFORE INSERT OR UPDATE OR DELETE ON public.rfq_requests
    FOR EACH ROW EXECUTE FUNCTION public.guard_rfq_request_write();

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — trg_guard_rfq_request_write (buyer chỉ huỷ/sửa RFQ chưa có báo giá)';
END $$;

COMMIT;
