-- Quay lui 20261005092900_admin_queue_and_user_tools.sql (xem README.md).
-- Mất cột supplier_profiles.verified_at (tính lại được từ verifications).
-- Quay lui web về bản trước 4.10 TRƯỚC khi chạy file này.
BEGIN;

DROP FUNCTION IF EXISTS public.admin_grant_credit(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS public.admin_adjust_score(TEXT, UUID, INT, INT, TEXT);
DROP FUNCTION IF EXISTS public.admin_queue_counts();

-- Bản 20261005090000.
CREATE OR REPLACE FUNCTION public.guard_buyer_system_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user <> 'authenticated' OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.credit_balance          IS DISTINCT FROM 0
           OR NEW.quota_used_this_month IS DISTINCT FROM 0
           OR NEW.quota_reset_at        IS NOT NULL
           OR NEW.trust_score           IS DISTINCT FROM 70
           OR NEW.risk_score            IS DISTINCT FROM 30
           OR NEW.verified_at           IS NOT NULL THEN
            RAISE EXCEPTION 'FORBIDDEN_SYSTEM_COLUMN_CHANGE';
        END IF;
    ELSE
        IF NEW.credit_balance          IS DISTINCT FROM OLD.credit_balance
           OR NEW.quota_used_this_month IS DISTINCT FROM OLD.quota_used_this_month
           OR NEW.quota_reset_at        IS DISTINCT FROM OLD.quota_reset_at
           OR NEW.trust_score           IS DISTINCT FROM OLD.trust_score
           OR NEW.risk_score            IS DISTINCT FROM OLD.risk_score
           OR NEW.verified_at           IS DISTINCT FROM OLD.verified_at THEN
            RAISE EXCEPTION 'FORBIDDEN_SYSTEM_COLUMN_CHANGE';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Bản 20261001090100.
CREATE OR REPLACE FUNCTION public.guard_supplier_system_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user <> 'authenticated' OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Hàng mới tự tạo (completeProfile) phải mang đúng giá trị mặc định.
        IF NEW.trust_score      IS DISTINCT FROM 70
           OR NEW.risk_score    IS DISTINCT FROM 30
           OR NEW.membership_tier IS DISTINCT FROM 'free'
           OR NEW.response_rate  IS NOT NULL
           OR NEW.quote_win_rate IS NOT NULL
           OR NEW.on_time_rate   IS NOT NULL THEN
            RAISE EXCEPTION 'FORBIDDEN_SYSTEM_COLUMN_CHANGE';
        END IF;
    ELSE
        IF NEW.trust_score      IS DISTINCT FROM OLD.trust_score
           OR NEW.risk_score    IS DISTINCT FROM OLD.risk_score
           OR NEW.membership_tier IS DISTINCT FROM OLD.membership_tier
           OR NEW.response_rate  IS DISTINCT FROM OLD.response_rate
           OR NEW.quote_win_rate IS DISTINCT FROM OLD.quote_win_rate
           OR NEW.on_time_rate   IS DISTINCT FROM OLD.on_time_rate THEN
            RAISE EXCEPTION 'FORBIDDEN_SYSTEM_COLUMN_CHANGE';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Bản 20261005090100.
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

ALTER TABLE public.supplier_profiles DROP COLUMN IF EXISTS verified_at;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005092900';

COMMIT;
