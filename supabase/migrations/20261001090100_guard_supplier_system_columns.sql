-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- FIX BẢO MẬT: chặn supplier tự sửa các cột do HỆ THỐNG tính trên
-- supplier_profiles: trust_score, risk_score, membership_tier, và 3 cột mới
-- response_rate / quote_win_rate / on_time_rate (20261001090000).
--
-- Lỗ hổng: supplier_profiles_modify_own (20260905121000) là FOR ALL với
-- USING (user_id = auth.uid() OR is_admin()) — cho UPDATE cả hàng, RLS không
-- giới hạn được CỘT. Bất kỳ supplier nào cũng gọi được
--     supabase.from('supplier_profiles').update({ trust_score: 100, risk_score: 0,
--                                                  membership_tier: 'premium' }).eq('id', myId)
-- để tự nâng điểm uy tín và tự "lên gói premium" trên trang public (trust_score
-- hiển thị ở shop page, dùng để xếp hạng/chọn xưởng khi gửi RFQ).
-- Cùng loại lỗi với 20260930090300_fix_users_self_escalation.sql, cùng cách
-- sửa (trigger BEFORE — GRANT theo cột không phân biệt được admin/chủ hàng
-- vì cả hai cùng role `authenticated`).
--
-- Ai được đổi các cột này:
--   - admin đăng nhập (is_admin())
--   - mọi thứ KHÔNG chạy dưới role `authenticated`: hàm SECURITY DEFINER
--     (current_user = owner, ví dụ trigger chấm điểm tự động sau này),
--     service_role (Edge Function/webhook), SQL Editor/migration (postgres).
--     Dùng current_user thay vì auth.uid() IS NULL vì hàm SECURITY DEFINER gọi
--     từ request của user vẫn thấy auth.uid() = user đó, sẽ bị chặn nhầm.
-- Supplier tự sửa hồ sơ (shop_name, village_origin... — WorkshopForm,
-- ShopSettingsForm, VisibilityToggles) không đụng 6 cột này nên không đổi.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.supplier_profiles') IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy supplier_profiles. Migration Sprint 1 chưa chạy.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'supplier_profiles'
                     AND column_name = 'response_rate') THEN
        RAISE EXCEPTION 'Thiếu supplier_profiles.response_rate. Chạy 20261001090000 trước.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_supplier_system_columns') THEN
        RAISE EXCEPTION 'trg_guard_supplier_system_columns đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

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

COMMENT ON FUNCTION public.guard_supplier_system_columns IS
    'BEFORE INSERT/UPDATE trên supplier_profiles: chỉ admin hoặc code chạy
     ngoài role authenticated (SECURITY DEFINER/service_role) được đổi
     trust_score, risk_score, membership_tier, response_rate, quote_win_rate,
     on_time_rate. Supplier tự sửa hồ sơ vẫn đổi được mọi cột còn lại.';

CREATE TRIGGER trg_guard_supplier_system_columns
    BEFORE INSERT OR UPDATE ON public.supplier_profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_system_columns();

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — chặn supplier tự sửa trust/risk score, membership_tier, metrics';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_guard_supplier_system_columns ON public.supplier_profiles;
-- DROP FUNCTION IF EXISTS public.guard_supplier_system_columns();
-- COMMIT;
