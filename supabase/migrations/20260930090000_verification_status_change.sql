-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Trigger khi verifications.status đổi sang approved/rejected (dùng bởi
-- /admin/verifications — Giai đoạn 6.2): 2 việc admin UPDATE trực tiếp
-- verifications KHÔNG tự làm được:
--
--   1. buyer_profiles.verified_at: stamp khi approved, để badge "✓ Đã xác
--      minh" ở /dashboard (buyer) đọc đúng. supplier_profiles KHÔNG có cột
--      tương đương — /supplier/dashboard đã tự query verifications
--      (status='approved') trực tiếp, nên nhánh supplier không cần stamp
--      gì thêm ở đây.
--   2. Notification 'verification_approved'/'verification_rejected' cho
--      user — 2 loại này đã khai báo sẵn trong enum (20260905120000) và đã
--      có UI hiển thị (NotificationsClient.tsx) nhưng chưa từng được ghi.
--
-- Cùng pattern với trg_log_quote_received (20260924090000): side-effect của
-- một lần UPDATE/INSERT được xử lý ở trigger, không phải app code, để mọi
-- nơi update verifications.status (chỉ có /admin/verifications hiện tại)
-- đều tự động có đủ 2 việc trên.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_verification_status_change') THEN
        RAISE EXCEPTION 'handle_verification_status_change() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_verification_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_title   TEXT;
    v_body    TEXT;
BEGIN
    IF NEW.status = OLD.status OR NEW.status NOT IN ('approved', 'rejected') THEN
        RETURN NEW;
    END IF;

    IF NEW.entity_type = 'buyer' THEN
        SELECT user_id INTO v_user_id FROM buyer_profiles WHERE id = NEW.entity_id;
        IF NEW.status = 'approved' THEN
            UPDATE buyer_profiles SET verified_at = NOW() WHERE id = NEW.entity_id;
        END IF;
    ELSE
        SELECT user_id INTO v_user_id FROM supplier_profiles WHERE id = NEW.entity_id;
    END IF;

    -- Không tìm được profile (dữ liệu hỏng) — bỏ qua notification thay vì
    -- lỗi cả transaction UPDATE verifications của admin.
    IF v_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'approved' THEN
        v_title := 'Hồ sơ đã được xác minh';
        v_body  := 'Chúc mừng! Hồ sơ xác minh của bạn đã được duyệt.';
    ELSE
        v_title := 'Hồ sơ xác minh bị từ chối';
        v_body  := COALESCE(NEW.rejection_reason, 'Hồ sơ của bạn chưa được duyệt. Vui lòng kiểm tra và gửi lại.');
    END IF;

    INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
    VALUES (
        v_user_id,
        CASE WHEN NEW.status = 'approved' THEN 'verification_approved' ELSE 'verification_rejected' END,
        v_title,
        v_body,
        jsonb_build_object('verification_id', NEW.id, 'entity_type', NEW.entity_type),
        'in_app', 'sent', NOW()
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_verification_status_change
    AFTER UPDATE OF status ON verifications
    FOR EACH ROW EXECUTE FUNCTION public.handle_verification_status_change();

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — trg_handle_verification_status_change (buyer_profiles.verified_at + notification khi verifications.status đổi)';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_handle_verification_status_change ON verifications;
-- DROP FUNCTION IF EXISTS public.handle_verification_status_change();
-- COMMIT;
