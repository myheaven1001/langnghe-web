-- ============================================================
-- SỬA 20260930090300_fix_users_self_escalation.sql: bản đó chặn nhầm cả
-- những lần đổi users.role/status KHÔNG đi qua role `authenticated` (SQL
-- Editor/migration chạy bằng postgres, service_role, hàm SECURITY DEFINER),
-- vì chỉ nhìn is_admin() — dựa vào auth.uid(), mà các ngữ cảnh trên không có
-- auth.uid(). Hậu quả thực tế: không có cách nào cấp admin ĐẦU TIÊN bằng
-- `UPDATE public.users SET role = 'admin' ...` trong SQL Editor (hàng rào tự
-- khóa luôn chủ dự án).
--
-- Cách sửa giống guard_supplier_system_columns() (20261001090100): bỏ
-- SECURITY DEFINER (để current_user phản ánh role của người gọi, không phải
-- owner của hàm) và cho qua mọi thứ KHÔNG chạy dưới role `authenticated`.
-- is_admin() vẫn là SECURITY DEFINER riêng nên gọi từ đây vẫn đúng.
-- Hành vi với user đăng nhập (authenticated) không đổi: admin qua tự do,
-- user thường chỉ được pending->active.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_users_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user <> 'authenticated' OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_CHANGE';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'pending' AND NEW.status = 'active') THEN
        RAISE EXCEPTION 'FORBIDDEN_STATUS_CHANGE';
    END IF;

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — guard_users_self_update() cho qua SQL Editor/service_role/SECURITY DEFINER';
END $$;

COMMIT;

-- ROLLBACK: chạy lại thân hàm của 20260930090300 (SECURITY DEFINER, chỉ is_admin()).
