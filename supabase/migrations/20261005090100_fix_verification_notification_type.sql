-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- SỬA LỖI: admin không duyệt/từ chối được hồ sơ xác minh.
--
-- handle_verification_status_change() (20260930090000) ghi notifications.type
-- bằng CASE ... THEN 'verification_approved' ELSE 'verification_rejected' END.
-- Biểu thức CASE của hai chuỗi có kiểu text, và Postgres không tự đổi text
-- sang enum notification_type khi INSERT:
--     ERROR 42804: column "type" is of type notification_type but expression is of type text
-- Trigger chạy AFTER UPDATE nên lỗi làm hỏng luôn câu UPDATE verifications
-- của admin: trên production chưa hồ sơ nào duyệt/từ chối được.
-- Phát hiện khi chạy supabase/tests/1.1_guard_buyer_system_columns.sql.
--
-- Sửa: ép kiểu (CASE ...)::notification_type. Thân hàm còn lại giữ nguyên.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_verification_status_change') THEN
        RAISE EXCEPTION 'Không tìm thấy handle_verification_status_change(). Chạy 20260930090000 trước.';
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
        (CASE WHEN NEW.status = 'approved' THEN 'verification_approved' ELSE 'verification_rejected' END)::notification_type,
        v_title,
        v_body,
        jsonb_build_object('verification_id', NEW.id, 'entity_type', NEW.entity_type),
        'in_app', 'sent', NOW()
    );

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — handle_verification_status_change ghi notifications.type đúng kiểu enum';
END $$;

COMMIT;
