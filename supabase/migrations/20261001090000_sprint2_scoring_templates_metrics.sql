-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Phần CÒN LẠI của migration_sprint2.sql (Giai đoạn 7).
--
-- Sprint 2 gốc đã được port THEO TỪNG PHẦN, đúng lúc tính năng cần tới:
--   20260918090000_rfq_quota_and_targets.sql  membership_plans, membership_features,
--                                             user_memberships, rfq_quota_configs,
--                                             rfq_credit_ledger, credit_reason
--   20260922090000_membership_credit_rls.sql  RLS cho 5 bảng trên
--   20260927090000_rfq_messages.sql           rfq_messages
-- File này port nốt 3 phần chưa có:
--   score_event_type + score_logs   (BƯỚC 1 + 5 của file gốc)
--   notification_templates          (BƯỚC 7)
--   supplier_profiles.response_rate / quote_win_rate / on_time_rate (BƯỚC 8)
--
-- KHÁC file gốc:
--   1. Guard đầu file. Gốc: "rfq_quotes phải có, membership_plans phải CHƯA có".
--      Vế thứ hai giờ luôn sai (membership_plans đã có từ 20260918) nên
--      copy nguyên sẽ báo lỗi ngay. Guard mới kiểm tra: Sprint 1 đã chạy,
--      Sprint 2 phần lõi (20260918) đã chạy, và phần MỚI của file này
--      chưa chạy — cả ba đều đúng với DB hiện tại.
--   2. Bỏ `SET ROLE langnghe_migrate` / ALTER TYPE order_status ADD VALUE
--      'disputed'. Supabase migration chạy bằng role postgres, không có
--      langnghe_migrate. 'disputed' cố ý KHÔNG thêm: 20260930090200_disputes.sql
--      đã quyết định giữ order_status 7 giá trị (escrow/release tự động cần
--      giấy phép trung gian thanh toán — xem ROADMAP 9.3), disputes hiện chỉ
--      là bảng ghi nhận, không đổi trạng thái đơn.
--   3. RLS bật NGAY khi tạo bảng (bài học từ 20260922090000: bảng tạo không
--      RLS thì mọi user đăng nhập đọc/ghi được qua REST API).
-- ============================================================

BEGIN;

DO $$
BEGIN
    -- Sprint 1
    IF to_regclass('public.rfq_quotes') IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy bảng rfq_quotes. Migration Sprint 1 chưa chạy.';
    END IF;
    IF to_regclass('public.supplier_profiles') IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy bảng supplier_profiles. Migration Sprint 1 chưa chạy.';
    END IF;
    IF to_regprocedure('public.is_admin()') IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy public.is_admin(). 20260905120900_rls_helpers.sql chưa chạy.';
    END IF;

    -- Sprint 2 phần lõi (đảo ngược so với file gốc: giờ phải CÓ, không phải CHƯA có)
    IF to_regclass('public.membership_plans') IS NULL
       OR to_regclass('public.rfq_credit_ledger') IS NULL THEN
        RAISE EXCEPTION 'Chưa có membership_plans/rfq_credit_ledger. Chạy 20260918090000 trước.';
    END IF;

    -- Phần của riêng file này chưa được chạy
    IF to_regclass('public.score_logs') IS NOT NULL
       OR to_regclass('public.notification_templates') IS NOT NULL
       OR EXISTS (SELECT 1 FROM pg_type WHERE typname = 'score_event_type') THEN
        RAISE EXCEPTION 'score_logs/notification_templates/score_event_type đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

-- ============================================================
-- BƯỚC 1 · ENUM
-- ============================================================

CREATE TYPE score_event_type AS ENUM (
    'order_completed', 'rfq_ignored', 'quote_abandoned',
    'reported', 'dispute_lost', 'dispute_won',
    'verified', 'long_tenure', 'fast_response', 'review_received'
);

-- ============================================================
-- BƯỚC 2 · SCORE LOGS
-- Lịch sử thay đổi trust/risk score. Chỉ admin đọc: risk_score là chỉ số nội
-- bộ (giống cột risk_score chỉ hiện ở /admin/users), không để user tự xem lý
-- do bị trừ điểm rủi ro. Không có policy INSERT — chỉ ghi qua trigger/RPC
-- SECURITY DEFINER hoặc service_role khi tới tính năng chấm điểm tự động.
-- ============================================================

CREATE TABLE score_logs (
    id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID             NOT NULL REFERENCES users(id),
    user_role    VARCHAR(20)      NOT NULL CHECK (user_role IN ('buyer','supplier','admin','system')),
    score_type   VARCHAR(20)      NOT NULL CHECK (score_type IN ('trust', 'risk')),
    event_type   score_event_type NOT NULL,
    event_score  INT              NOT NULL,
    score_before INT              NOT NULL,
    score_after  INT              NOT NULL,
    reason       TEXT,
    ref_id       UUID,
    created_at   TIMESTAMP        NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_score_logs_user ON score_logs (user_id, created_at DESC);
CREATE INDEX idx_score_logs_type ON score_logs (score_type, event_type);

ALTER TABLE score_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY score_logs_select_admin ON score_logs
    FOR SELECT USING (public.is_admin());

-- ============================================================
-- BƯỚC 3 · NOTIFICATION TEMPLATES
-- Chưa có code nào đọc bảng này: trigger/RPC hiện tại (create_rfq,
-- accept_quote, order_status_change...) vẫn hardcode title/body. Bảng + seed
-- để sẵn cho tới khi email thật (Giai đoạn 8) cần render từ template.
-- Nội bộ → chỉ admin đọc/ghi; service_role (Edge Function gửi email) bypass RLS.
-- ============================================================

CREATE TABLE notification_templates (
    id                UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_type notification_type    NOT NULL,
    channel           notification_channel NOT NULL,
    subject_template  VARCHAR(500),
    body_template     TEXT                 NOT NULL,
    variables         JSONB,
    is_active         BOOLEAN              NOT NULL DEFAULT TRUE,
    updated_at        TIMESTAMP            NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_template UNIQUE (notification_type, channel)
);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_templates_admin_all ON notification_templates
    FOR ALL USING (public.is_admin());

INSERT INTO notification_templates (notification_type, channel, subject_template, body_template, variables) VALUES
    ('rfq_received',      'in_app', NULL,
     'Bạn có yêu cầu báo giá mới từ {{buyer_name}} cho sản phẩm "{{product_name}}"',
     '{"buyer_name": "string", "product_name": "string", "rfq_id": "uuid"}'),

    ('rfq_received',      'email',  'Yêu cầu báo giá mới — {{product_name}}',
     'Xin chào {{supplier_name}},\n\n{{buyer_name}} vừa gửi yêu cầu báo giá cho "{{product_name}}", số lượng {{quantity}} {{unit}}.\n\nVui lòng phản hồi trong vòng 48 giờ để duy trì điểm phản hồi của bạn.\n\nXem chi tiết: {{rfq_url}}',
     '{"supplier_name":"string","buyer_name":"string","product_name":"string","quantity":"int","unit":"string","rfq_url":"string"}'),

    ('quote_accepted',    'in_app', NULL,
     '{{buyer_name}} đã chấp nhận báo giá của bạn! Đơn hàng #{{order_id}} đã được tạo.',
     '{"buyer_name":"string","order_id":"string"}'),

    ('order_confirmed',   'in_app', NULL,
     'Đơn hàng #{{order_id}} đã được xác nhận thanh toán. Bắt đầu sản xuất!',
     '{"order_id":"string","total_amount":"number"}'),

    ('order_confirmed',   'email', 'Xác nhận đơn hàng #{{order_id}}',
     'Đơn hàng #{{order_id}} - {{total_amount}}đ đã được xác nhận.\nVui lòng bắt đầu sản xuất và cập nhật tiến độ trên sàn.\n\nXem đơn hàng: {{order_url}}',
     '{"order_id":"string","total_amount":"number","order_url":"string"}'),

    ('order_shipped',     'in_app', NULL,
     'Đơn hàng #{{order_id}} đã được giao cho {{logistics_provider}}. Mã vận đơn: {{tracking_number}}',
     '{"order_id":"string","logistics_provider":"string","tracking_number":"string"}'),

    ('order_delivered',   'in_app', NULL,
     'Đơn hàng #{{order_id}} đã được giao thành công! Vui lòng xác nhận và đánh giá.',
     '{"order_id":"string"}'),

    ('verification_approved', 'email', 'Tài khoản của bạn đã được xác minh ✓',
     'Xin chào {{user_name}},\n\nTài khoản của bạn đã được xác minh thành công. Bạn có thể sử dụng đầy đủ tính năng của sàn.\n\nChúc bạn kinh doanh thuận lợi!',
     '{"user_name":"string"}'),

    ('account_suspended', 'email', '[Quan trọng] Tài khoản bị tạm khóa',
     'Xin chào {{user_name}},\n\nTài khoản của bạn đã bị tạm khóa do {{reason}}.\n\nVui lòng liên hệ hỗ trợ để được giải quyết: support@langnghe.vn',
     '{"user_name":"string","reason":"string"}');

-- ============================================================
-- BƯỚC 4 · supplier_profiles thêm metrics
-- Các cột này do hệ thống tính, không phải supplier tự khai — chống tự sửa
-- qua REST nằm ở 20261001090100_guard_supplier_system_columns.sql.
-- ============================================================

ALTER TABLE supplier_profiles
    ADD COLUMN response_rate  DECIMAL(5,2),
    ADD COLUMN quote_win_rate DECIMAL(5,2),
    ADD COLUMN on_time_rate   DECIMAL(5,2);

COMMENT ON COLUMN supplier_profiles.response_rate  IS '% RFQ phản hồi trong 48h — tính từ Sprint 2';
COMMENT ON COLUMN supplier_profiles.quote_win_rate IS '% quote được chấp nhận — tính từ Sprint 2';
COMMENT ON COLUMN supplier_profiles.on_time_rate   IS '% giao đúng hạn — tính từ Sprint 2';

-- ============================================================
-- KIỂM TRA SAU MIGRATION
-- ============================================================
DO $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM notification_templates;
    IF v_count <> 9 THEN RAISE EXCEPTION 'notification_templates: kỳ vọng 9 rows, có %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'supplier_profiles'
      AND column_name IN ('response_rate', 'quote_win_rate', 'on_time_rate');
    IF v_count <> 3 THEN RAISE EXCEPTION 'supplier_profiles: kỳ vọng 3 cột metrics mới, có %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('score_logs', 'notification_templates')
      AND c.relrowsecurity AND c.relforcerowsecurity;
    IF v_count <> 2 THEN RAISE EXCEPTION 'score_logs/notification_templates chưa bật RLS đầy đủ'; END IF;

    RAISE NOTICE 'Migration OK — score_logs, notification_templates, supplier metrics';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- ALTER TABLE supplier_profiles
--     DROP COLUMN IF EXISTS response_rate,
--     DROP COLUMN IF EXISTS quote_win_rate,
--     DROP COLUMN IF EXISTS on_time_rate;
-- DROP TABLE IF EXISTS notification_templates CASCADE;
-- DROP TABLE IF EXISTS score_logs CASCADE;
-- DROP TYPE IF EXISTS score_event_type;
-- COMMIT;
