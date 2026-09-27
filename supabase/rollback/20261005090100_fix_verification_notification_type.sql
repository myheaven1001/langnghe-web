-- Quay lui 20261005090100_fix_verification_notification_type.sql (xem README.md).
-- Đưa handle_verification_status_change() về thân hàm cũ của 20260930090000
-- (bản có lỗi ép kiểu — chỉ dùng khi bản sửa gây sự cố khác).
BEGIN;

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

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005090100';

COMMIT;
