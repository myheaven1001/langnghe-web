-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- RLS cho membership_plans/membership_features/user_memberships/
-- rfq_quota_configs/rfq_credit_ledger — 5 bảng do
-- 20260918090000_rfq_quota_and_targets.sql tạo nhưng CHƯA bật RLS.
--
-- Đây là lỗ hổng thật: Supabase mặc định GRANT rộng cho role `authenticated`
-- ở tầng schema, RLS là lớp chặn duy nhất. Không có RLS = bất kỳ user đăng
-- nhập nào cũng SELECT/UPDATE/DELETE được thẳng mọi dòng của các bảng này —
-- kể cả tự sửa user_memberships của mình để chuyển sang gói premium, hoặc
-- UPDATE rfq_quota_configs.monthly_quota để tự cấp hạn mức không giới hạn.
-- rfq/new (3.2) và /settings/membership (3.9) là 2 trang đầu tiên thực sự
-- đọc các bảng này nên phải khóa lại trước khi thêm UI, không phải việc
-- ngoài phạm vi 3.9.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rfq_credit_ledger') THEN
        RAISE EXCEPTION 'Không tìm thấy bảng rfq_credit_ledger. Migration 20260918090000 chưa chạy.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'rfq_credit_ledger' AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'rfq_credit_ledger đã bật RLS. Migration này đã chạy rồi.';
    END IF;
END $$;

-- ============================================================
-- membership_plans / membership_features / rfq_quota_configs —
-- catalog gói + cấu hình hạn mức, không chứa dữ liệu riêng user nào.
-- Đọc: public (giống categories). Ghi: chỉ admin.
-- ============================================================

ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_plans FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_plans_select_all ON membership_plans
    FOR SELECT USING (TRUE);

CREATE POLICY membership_plans_modify_admin ON membership_plans
    FOR ALL USING (public.is_admin());

ALTER TABLE membership_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_features FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_features_select_all ON membership_features
    FOR SELECT USING (TRUE);

CREATE POLICY membership_features_modify_admin ON membership_features
    FOR ALL USING (public.is_admin());

ALTER TABLE rfq_quota_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_quota_configs FORCE ROW LEVEL SECURITY;

CREATE POLICY rfq_quota_configs_select_all ON rfq_quota_configs
    FOR SELECT USING (TRUE);

CREATE POLICY rfq_quota_configs_modify_admin ON rfq_quota_configs
    FOR ALL USING (public.is_admin());

-- ============================================================
-- user_memberships — gói của từng user. Chỉ chủ sở hữu + admin đọc được.
-- Không có policy INSERT/UPDATE cho 'authenticated' có chủ đích: dòng free
-- plan mặc định do trigger assign_free_plan_on_register() (SECURITY
-- DEFINER, bypass RLS) tạo; nâng cấp gói thật sự (Giai đoạn 9, sau khi nối
-- cổng thanh toán) sẽ ghi qua webhook/service_role hoặc 1 RPC SECURITY
-- DEFINER khác — không phải việc user tự UPDATE thẳng bảng này.
-- ============================================================

ALTER TABLE user_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY user_memberships_select_own ON user_memberships
    FOR SELECT USING (
        user_id = auth.uid()
        OR public.is_admin()
    );

-- ============================================================
-- rfq_credit_ledger — lịch sử credit của từng buyer. Chỉ chủ sở hữu + admin
-- đọc được. Không có policy INSERT cho 'authenticated' — chỉ ghi qua
-- create_rfq() (SECURITY DEFINER, khi dùng credit) hoặc luồng mua credit
-- thật (Giai đoạn 9).
-- ============================================================

ALTER TABLE rfq_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_credit_ledger FORCE ROW LEVEL SECURITY;

CREATE POLICY rfq_credit_ledger_select_own ON rfq_credit_ledger
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM buyer_profiles bp
            WHERE bp.id = rfq_credit_ledger.buyer_id
              AND bp.user_id = auth.uid()
        )
        OR public.is_admin()
    );

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — RLS cho membership_plans/membership_features/user_memberships/rfq_quota_configs/rfq_credit_ledger';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS rfq_credit_ledger_select_own ON rfq_credit_ledger;
-- ALTER TABLE rfq_credit_ledger NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE rfq_credit_ledger DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS user_memberships_select_own ON user_memberships;
-- ALTER TABLE user_memberships NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE user_memberships DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS rfq_quota_configs_modify_admin ON rfq_quota_configs;
-- DROP POLICY IF EXISTS rfq_quota_configs_select_all ON rfq_quota_configs;
-- ALTER TABLE rfq_quota_configs NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE rfq_quota_configs DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS membership_features_modify_admin ON membership_features;
-- DROP POLICY IF EXISTS membership_features_select_all ON membership_features;
-- ALTER TABLE membership_features NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE membership_features DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS membership_plans_modify_admin ON membership_plans;
-- DROP POLICY IF EXISTS membership_plans_select_all ON membership_plans;
-- ALTER TABLE membership_plans NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE membership_plans DISABLE ROW LEVEL SECURITY;
-- COMMIT;
