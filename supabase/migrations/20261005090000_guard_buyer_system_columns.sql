-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- FIX BẢO MẬT (kế hoạch 1.1): chặn buyer tự sửa các cột do HỆ THỐNG ghi
-- trên buyer_profiles: credit_balance, quota_used_this_month,
-- quota_reset_at, trust_score, risk_score, verified_at.
--
-- Lỗ hổng: buyer_profiles_modify_own (20260905121000) là FOR ALL với
-- USING (user_id = auth.uid() OR is_admin()) — cho UPDATE cả hàng, RLS không
-- giới hạn được CỘT. Bất kỳ buyer nào cũng gọi được
--     supabase.from('buyer_profiles').update({ credit_balance: 9999,
--                                               quota_used_this_month: 0,
--                                               verified_at: new Date() }).eq('user_id', myId)
-- để tự cộng credit gửi RFQ, xoá hạn mức tháng và tự gắn nhãn "đã xác minh".
-- Cùng loại lỗi và cùng cách sửa với 20261001090100_guard_supplier_system_columns.sql.
--
-- Ai vẫn được đổi các cột này:
--   - admin đăng nhập (is_admin())
--   - mọi thứ KHÔNG chạy dưới role `authenticated`: hàm SECURITY DEFINER
--     (create_rfq trừ quota/credit, handle_verification_status_change đặt
--     verified_at — current_user = owner), service_role (Edge Function,
--     scripts/seed-staging.mjs), SQL Editor/migration (postgres).
--   - trigger sync_credit_balance (không phải SECURITY DEFINER) chỉ chạy khi
--     INSERT vào rfq_credit_ledger, mà bảng đó chỉ có policy SELECT — mọi
--     INSERT đi qua create_rfq (SECURITY DEFINER), nên cũng không bị chặn.
-- Buyer tự sửa hồ sơ (ProfileForm, completeProfile: company_name, tax_code,
-- city, address) không đụng 6 cột này nên không đổi.
-- INSERT (confirmOtp tạo hồ sơ lần đầu) phải mang đúng giá trị mặc định.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.buyer_profiles') IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy buyer_profiles. Migration Sprint 1 chưa chạy.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'buyer_profiles'
                     AND column_name = 'credit_balance') THEN
        RAISE EXCEPTION 'Thiếu buyer_profiles.credit_balance. Chạy 20260918090000 trước.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_buyer_system_columns') THEN
        RAISE EXCEPTION 'trg_guard_buyer_system_columns đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

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

COMMENT ON FUNCTION public.guard_buyer_system_columns IS
    'BEFORE INSERT/UPDATE trên buyer_profiles: chỉ admin hoặc code chạy ngoài
     role authenticated (SECURITY DEFINER/service_role) được đổi
     credit_balance, quota_used_this_month, quota_reset_at, trust_score,
     risk_score, verified_at. Buyer tự sửa hồ sơ vẫn đổi được mọi cột còn lại.';

CREATE TRIGGER trg_guard_buyer_system_columns
    BEFORE INSERT OR UPDATE ON public.buyer_profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_buyer_system_columns();

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — chặn buyer tự sửa credit, quota, trust/risk score, verified_at';
END $$;

COMMIT;
