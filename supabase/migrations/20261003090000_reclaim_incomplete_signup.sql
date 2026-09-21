-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- reclaim_incomplete_signup(): cho phép đăng ký LẠI bằng email của một lượt
-- đăng ký dở dang.
--
-- Vấn đề: Supabase Auth phải tạo auth.users ngay khi signUp() thì mới gửi
-- được mã xác nhận, nên nếu khách không nhận được mã / bỏ dở bước "Hoàn thiện
-- hồ sơ", email đó vẫn nằm trong hệ thống với public.users.status = 'pending'.
-- Đăng ký lại sẽ bị coi là "email đã có tài khoản" (đã xác nhận OTP) hoặc dính
-- mật khẩu cũ.
--
-- Giải pháp: registerAccount() (src/app/auth/actions.ts) gọi hàm này TRƯỚC
-- signUp(). Nếu email thuộc một tài khoản CHƯA HOÀN TẤT (status 'pending',
-- role buyer/supplier) thì xoá nó (kéo theo profile, cascade) để signUp() tạo
-- lại từ đầu. Tài khoản đã hoàn tất (status 'active'/'suspended'), admin, hoặc
-- tài khoản đã phát sinh dữ liệu (RFQ, đơn... chặn xoá bởi FK) đều KHÔNG bị
-- động tới — hàm trả FALSE và luồng đăng ký báo "email đã có tài khoản".
--
-- Ngoài ra purge_incomplete_signups() dọn định kỳ (pg_cron, mỗi giờ) các tài
-- khoản 'pending' không hoạt động quá 24 giờ, để khách không quay lại đăng ký
-- lại cũng không để rác trong auth.users.
--
-- Ai cũng gọi được reclaim_incomplete_signup() (đăng ký là ẩn danh). Chi phí chấp nhận được: người lạ có
-- thể xoá lượt đăng ký dở dang của một email cụ thể — nhưng không thể chiếm
-- email đó vì vẫn phải nhập mã gửi tới đúng hộp thư.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.users') IS NULL OR to_regclass('public.user_memberships') IS NULL THEN
        RAISE EXCEPTION 'Thiếu public.users/user_memberships. Chạy các migration trước.';
    END IF;
    IF to_regprocedure('public.reclaim_incomplete_signup(text)') IS NOT NULL THEN
        RAISE EXCEPTION 'reclaim_incomplete_signup() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.reclaim_incomplete_signup(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_email IS NULL OR btrim(p_email) = '' THEN
        RETURN FALSE;
    END IF;

    SELECT au.id INTO v_id
    FROM auth.users au
    JOIN public.users u ON u.id = au.id
    WHERE lower(au.email) = lower(btrim(p_email))
      AND u.status = 'pending'
      AND u.role IN ('buyer', 'supplier');

    IF v_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Gói free được gán tự động lúc tạo user (FK không có ON DELETE CASCADE).
    DELETE FROM public.user_memberships WHERE user_id = v_id;
    -- Cascade: public.users → buyer_profiles/supplier_profiles.
    DELETE FROM auth.users WHERE id = v_id;

    RETURN TRUE;
EXCEPTION
    WHEN foreign_key_violation THEN
        -- Tài khoản đã phát sinh dữ liệu (RFQ, quote, ...) → giữ nguyên.
        RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.reclaim_incomplete_signup IS
    'Xoá tài khoản đăng ký dở dang (status pending) của email để đăng ký lại. Gọi từ registerAccount().';

-- Supabase cấp sẵn EXECUTE cho anon/authenticated qua default privileges;
-- ở đây CHỦ Ý cho cả hai (đăng ký là ẩn danh) nhưng bỏ PUBLIC cho rõ ràng.
REVOKE ALL ON FUNCTION public.reclaim_incomplete_signup(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reclaim_incomplete_signup(TEXT) TO anon, authenticated;

-- ============================================================
-- purge_incomplete_signups(): dọn tài khoản 'pending' bỏ dở
-- "Không hoạt động" = lần đăng nhập (xác minh OTP) gần nhất, hoặc lúc tạo nếu
-- chưa từng đăng nhập, cách đây quá p_hours giờ — nên người vừa xác minh OTP
-- lúc gần hết hạn vẫn có đủ thời gian hoàn thiện hồ sơ.
-- Chỉ postgres/pg_cron gọi (không GRANT cho anon/authenticated).
-- ============================================================

CREATE OR REPLACE FUNCTION public.purge_incomplete_signups(p_hours INT DEFAULT 24)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_id      UUID;
    v_deleted INT := 0;
BEGIN
    IF p_hours IS NULL OR p_hours < 1 THEN
        RAISE EXCEPTION 'p_hours phải >= 1';
    END IF;

    FOR v_id IN
        SELECT au.id
        FROM auth.users au
        JOIN public.users u ON u.id = au.id
        WHERE u.status = 'pending'
          AND u.role IN ('buyer', 'supplier')
          AND GREATEST(au.created_at, COALESCE(au.last_sign_in_at, au.created_at))
              < NOW() - make_interval(hours => p_hours)
    LOOP
        BEGIN
            DELETE FROM public.user_memberships WHERE user_id = v_id;
            DELETE FROM auth.users WHERE id = v_id;
            v_deleted := v_deleted + 1;
        EXCEPTION
            WHEN foreign_key_violation THEN
                -- Đã phát sinh dữ liệu → giữ nguyên (subtransaction tự hoàn
                -- tác DELETE user_memberships ở trên), làm tiếp tài khoản khác.
                NULL;
        END;
    END LOOP;

    RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.purge_incomplete_signups IS
    'Xoá tài khoản pending (buyer/supplier) không hoạt động quá p_hours giờ. Chạy hằng giờ bằng pg_cron.';

REVOKE ALL ON FUNCTION public.purge_incomplete_signups(INT) FROM PUBLIC, anon, authenticated;

-- Lên lịch bằng pg_cron nếu dùng được (Supabase hỗ trợ; DB không có
-- pg_cron thì chỉ báo NOTICE — hàm vẫn gọi tay được:
--   SELECT public.purge_incomplete_signups(24);)
DO $$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Không bật được pg_cron (%): bỏ qua lịch tự động', SQLERRM;
    END;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Cùng tên job → thay thế, chạy lại migration không nhân đôi lịch.
        -- Lỗi lên lịch chỉ là cảnh báo: không để nó làm hỏng cả migration.
        BEGIN
            PERFORM cron.schedule(
                'purge-incomplete-signups',
                '15 * * * *',
                'SELECT public.purge_incomplete_signups(24)'
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Không lên lịch được purge-incomplete-signups (%)', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'pg_cron chưa có: bật Database → Extensions → pg_cron rồi chạy lại phần cron.schedule.';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- SELECT cron.unschedule('purge-incomplete-signups');   -- nếu đã lên lịch
-- DROP FUNCTION IF EXISTS public.purge_incomplete_signups(INT);
-- DROP FUNCTION IF EXISTS public.reclaim_incomplete_signup(TEXT);
