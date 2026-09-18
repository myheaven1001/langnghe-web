-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- FIX BẢO MẬT: users_update_own (20260905121000_rls_policies.sql) chỉ giới
-- hạn RFQ ĐÚNG HÀNG được sửa (id = auth.uid() OR is_admin()), KHÔNG giới
-- hạn cột nào — public.users chỉ có 2 cột ngoài id (role, status), nên bất
-- kỳ user đã đăng nhập nào cũng tự gọi được:
--     supabase.from('users').update({ role: 'admin' }).eq('id', myOwnId)
-- và tự phong mình làm admin (toàn quyền /admin: duyệt xác minh, khóa tài
-- khoản người khác...). Tương tự, 1 user bị khóa (status='suspended') có
-- thể tự update({status:'active'}) để tự mở khóa cho mình.
--
-- Không thể sửa bằng GRANT UPDATE (cột) vì admin và user tự sửa mình đều
-- đi qua CÙNG 1 Postgres role (authenticated) — GRANT áp dụng cho cả role,
-- không phân biệt được theo hàng như RLS. Cần logic CÓ ĐIỀU KIỆN (admin
-- thì cho qua, không phải admin thì chỉ cho đúng 1 chuyển đổi hợp lệ) —
-- chỉ trigger BEFORE UPDATE làm được việc này.
--
-- Chuyển đổi tự sửa DUY NHẤT vẫn được phép sau fix này: status
-- 'pending' -> 'active' (completeProfile() trong auth/actions.ts dùng
-- đúng chuyển đổi này để tự kích hoạt tài khoản sau khi hoàn thiện hồ sơ —
-- không đổi gì ở tầng app, flow đó tiếp tục chạy y nguyên). Mọi thay đổi
-- role tự thân, hoặc mọi chuyển đổi status khác (kể cả tự mở khóa
-- suspended), đều bị chặn với exception rõ ràng.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_users_self_update') THEN
        RAISE EXCEPTION 'trg_guard_users_self_update đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_users_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.is_admin() THEN
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

COMMENT ON FUNCTION public.guard_users_self_update IS
    'BEFORE UPDATE trên public.users: admin (is_admin()) đi qua tự do; user
     tự sửa chính mình chỉ được đúng 1 chuyển đổi status pending->active
     (completeProfile() dùng), mọi thay đổi role hoặc chuyển đổi status
     khác của chính mình đều bị chặn. Ngăn leo thang đặc quyền qua
     users_update_own (id = auth.uid() cho phép UPDATE hàng nhưng RLS
     không giới hạn được CỘT).';

CREATE TRIGGER trg_guard_users_self_update
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.guard_users_self_update();

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — chặn tự đổi role/status trái phép trên public.users';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_guard_users_self_update ON public.users;
-- DROP FUNCTION IF EXISTS public.guard_users_self_update();
-- COMMIT;
