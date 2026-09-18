-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase (12/12 tính đến nay)
-- RFQ QUOTA + CREDIT + TARGETING — phần vừa đủ để chạy /rfq/new
--
-- Đây KHÔNG phải toàn bộ migration_sprint2.sql — chỉ port đúng 3 bảng
-- (membership_plans, membership_features, user_memberships) +
-- rfq_quota_configs + rfq_credit_ledger, vì đây là phần rfq_create_page.html
-- phụ thuộc trực tiếp. Phần còn lại của Sprint 2 (score_logs, rfq_messages,
-- notification_templates, supplier_profiles.response_rate/...,
-- order_status thêm 'disputed') CHƯA port — sẽ làm khi tới đúng tính năng
-- cần nó (Giai đoạn 5, 8, 9) để tránh mang theo schema chưa dùng đến.
--
-- THÊM MỚI (không có trong migration_sprint2.sql gốc):
--   rfq_targets — schema Sprint 1 không có cách nào lưu "RFQ đơn/multi này
--   gửi cho (những) xưởng nào", nhưng rfq_create_page.html bắt buyer chọn
--   xưởng trước khi gửi. Không có bảng này, buyer_profiles.id không thể nào
--   biết được request. RLS rfq_requests_supplier_view cũ vì vậy chỉ cho
--   supplier thấy RFQ SAU KHI đã báo giá — vô lý cho luồng "gửi RFQ đơn cho
--   1 xưởng cụ thể" (supplier phải thấy RFQ TRƯỚC khi báo giá được). Bảng +
--   policy mới bên dưới sửa luôn khoảng trống đó.
--
--   categories: seed data — bảng đã có từ Sprint 1 nhưng chưa từng seed,
--   nên rfq_requests.category_id (NOT NULL ở app layer) không có gì để trỏ
--   tới. Seed khớp với danh sách ngành hàng đã hardcode ở
--   src/app/_components/home/data.ts để nhất quán toàn site.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_name = 'rfq_requests') THEN
        RAISE EXCEPTION 'Không tìm thấy bảng rfq_requests. Migration Sprint 1 chưa chạy.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_name = 'membership_plans') THEN
        RAISE EXCEPTION 'membership_plans đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

-- ============================================================
-- BƯỚC 1 · ENUM
-- ============================================================

CREATE TYPE credit_reason AS ENUM ('purchase', 'consume', 'refund', 'bonus');

-- ============================================================
-- BƯỚC 2 · MEMBERSHIP  (giống migration_sprint2.sql BƯỚC 2, bỏ phần
-- score/rfq_messages liên quan ở các bước sau của file gốc)
-- ============================================================

CREATE TABLE membership_plans (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL UNIQUE,
    price_vnd     INT          NOT NULL DEFAULT 0,
    billing_cycle VARCHAR(20)  NOT NULL DEFAULT 'yearly'
                  CHECK (billing_cycle IN ('monthly', 'yearly')),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE membership_features (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id       UUID         NOT NULL REFERENCES membership_plans(id),
    feature_key   VARCHAR(100) NOT NULL,
    feature_value VARCHAR(255) NOT NULL,
    CONSTRAINT uq_plan_feature UNIQUE (plan_id, feature_key)
);

CREATE TABLE user_memberships (
    id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID      NOT NULL REFERENCES users(id),
    plan_id     UUID      NOT NULL REFERENCES membership_plans(id),
    started_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMP,
    is_active   BOOLEAN   NOT NULL DEFAULT TRUE,
    payment_ref VARCHAR(255),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_memberships_user   ON user_memberships (user_id);
CREATE INDEX idx_user_memberships_active ON user_memberships (user_id) WHERE is_active = TRUE;

INSERT INTO membership_plans (id, name, price_vnd, billing_cycle) VALUES
    ('00000000-0000-0000-0003-000000000001', 'free',    0,       'yearly'),
    ('00000000-0000-0000-0003-000000000002', 'basic',   1500000, 'yearly'),
    ('00000000-0000-0000-0003-000000000003', 'premium', 3000000, 'yearly');

INSERT INTO membership_features (plan_id, feature_key, feature_value) VALUES
    ('00000000-0000-0000-0003-000000000001', 'rfq_monthly_quota',    '5'),
    ('00000000-0000-0000-0003-000000000001', 'multi_rfq_allowed',    'false'),
    ('00000000-0000-0000-0003-000000000001', 'max_suppliers_per_rfq','1'),
    ('00000000-0000-0000-0003-000000000002', 'rfq_monthly_quota',    '30'),
    ('00000000-0000-0000-0003-000000000002', 'multi_rfq_allowed',    'true'),
    ('00000000-0000-0000-0003-000000000002', 'max_suppliers_per_rfq','3'),
    ('00000000-0000-0000-0003-000000000003', 'rfq_monthly_quota',    'unlimited'),
    ('00000000-0000-0000-0003-000000000003', 'multi_rfq_allowed',    'true'),
    ('00000000-0000-0000-0003-000000000003', 'max_suppliers_per_rfq','10');

-- Gán free plan cho user hiện có (nếu đã có ai đăng ký trước khi migration này chạy)
INSERT INTO user_memberships (user_id, plan_id, is_active)
SELECT u.id, '00000000-0000-0000-0003-000000000001', TRUE
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM user_memberships um WHERE um.user_id = u.id AND um.is_active = TRUE
);

CREATE OR REPLACE FUNCTION assign_free_plan_on_register()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_memberships (user_id, plan_id, is_active)
    VALUES (NEW.id, '00000000-0000-0000-0003-000000000001', TRUE)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_free_plan
    AFTER INSERT ON users
    FOR EACH ROW
    WHEN (NEW.role IN ('buyer', 'supplier', 'both'))
    EXECUTE FUNCTION assign_free_plan_on_register();

-- ============================================================
-- BƯỚC 3 · RFQ QUOTA CONFIGS  (cache phẳng của membership_features)
-- ============================================================

CREATE TABLE rfq_quota_configs (
    id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_name             VARCHAR(100) NOT NULL UNIQUE,
    monthly_quota         INT,          -- NULL = unlimited
    multi_rfq_allowed     BOOLEAN NOT NULL DEFAULT FALSE,
    max_suppliers_per_rfq INT     NOT NULL DEFAULT 1,
    updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE rfq_quota_configs IS
    'Cache phẳng của membership_features để query nhanh trong create_rfq().
     NGUỒN SỰ THẬT là membership_features — không sửa bảng này trực tiếp.
     Trigger sync_quota_cache tự đồng bộ khi features thay đổi.';

INSERT INTO rfq_quota_configs (plan_name, monthly_quota, multi_rfq_allowed, max_suppliers_per_rfq)
SELECT
    mp.name,
    CASE WHEN mf_quota.feature_value = 'unlimited' THEN NULL
         ELSE mf_quota.feature_value::INT END,
    (mf_multi.feature_value = 'true'),
    mf_max.feature_value::INT
FROM membership_plans mp
JOIN membership_features mf_quota ON mf_quota.plan_id = mp.id
    AND mf_quota.feature_key = 'rfq_monthly_quota'
JOIN membership_features mf_multi ON mf_multi.plan_id = mp.id
    AND mf_multi.feature_key = 'multi_rfq_allowed'
JOIN membership_features mf_max   ON mf_max.plan_id = mp.id
    AND mf_max.feature_key = 'max_suppliers_per_rfq';

CREATE OR REPLACE FUNCTION sync_quota_cache()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.feature_key IN ('rfq_monthly_quota','multi_rfq_allowed','max_suppliers_per_rfq') THEN
        UPDATE rfq_quota_configs SET
            monthly_quota = (
                SELECT CASE WHEN f.feature_value = 'unlimited' THEN NULL
                            ELSE f.feature_value::INT END
                FROM membership_features f WHERE f.plan_id = NEW.plan_id AND f.feature_key = 'rfq_monthly_quota'
            ),
            multi_rfq_allowed = (
                SELECT (f.feature_value = 'true')
                FROM membership_features f WHERE f.plan_id = NEW.plan_id AND f.feature_key = 'multi_rfq_allowed'
            ),
            max_suppliers_per_rfq = (
                SELECT f.feature_value::INT
                FROM membership_features f WHERE f.plan_id = NEW.plan_id AND f.feature_key = 'max_suppliers_per_rfq'
            ),
            updated_at = NOW()
        WHERE plan_name = (SELECT name FROM membership_plans WHERE id = NEW.plan_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_quota_cache
    AFTER INSERT OR UPDATE ON membership_features
    FOR EACH ROW EXECUTE FUNCTION sync_quota_cache();

UPDATE buyer_profiles
SET quota_reset_at = DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
WHERE quota_reset_at IS NULL;

-- ============================================================
-- BƯỚC 4 · RFQ CREDIT LEDGER
-- ============================================================

CREATE TABLE rfq_credit_ledger (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id      UUID          NOT NULL REFERENCES buyer_profiles(id),
    change_amount INT           NOT NULL,
    balance_after INT           NOT NULL,
    reason        credit_reason NOT NULL,
    rfq_id        UUID          REFERENCES rfq_requests(id),
    order_ref     VARCHAR(255),
    created_at    TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_ledger_buyer ON rfq_credit_ledger (buyer_id, created_at DESC);

CREATE OR REPLACE FUNCTION sync_credit_balance()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE buyer_profiles
    SET credit_balance = (
        SELECT COALESCE(SUM(change_amount), 0)
        FROM rfq_credit_ledger
        WHERE buyer_id = NEW.buyer_id
    )
    WHERE id = NEW.buyer_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_credit_balance
    AFTER INSERT ON rfq_credit_ledger
    FOR EACH ROW EXECUTE FUNCTION sync_credit_balance();

-- ============================================================
-- BƯỚC 5 · RFQ TARGETS  (mới — xem giải thích đầu file)
-- ============================================================

CREATE TABLE rfq_targets (
    id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id      UUID      NOT NULL REFERENCES rfq_requests(id) ON DELETE CASCADE,
    supplier_id UUID      NOT NULL REFERENCES supplier_profiles(id),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rfq_target UNIQUE (rfq_id, supplier_id)
);

CREATE INDEX idx_rfq_targets_supplier ON rfq_targets (supplier_id);

ALTER TABLE rfq_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_targets FORCE ROW LEVEL SECURITY;

CREATE POLICY rfq_targets_buyer_own ON rfq_targets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM rfq_requests r
            JOIN buyer_profiles bp ON bp.id = r.buyer_id
            WHERE r.id = rfq_targets.rfq_id AND bp.user_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY rfq_targets_supplier_view ON rfq_targets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM supplier_profiles sp
            WHERE sp.id = rfq_targets.supplier_id AND sp.user_id = auth.uid()
        )
    );

-- Không có policy INSERT/UPDATE/DELETE cho 'authenticated' có chủ đích —
-- chỉ create_rfq() (SECURITY DEFINER, bypass RLS) được ghi bảng này, để
-- không ai tự thêm mình vào target list của RFQ người khác qua REST API.

-- Mở lại quyền nhìn thấy RFQ cho supplier ĐƯỢC MỜI (single hoặc multi),
-- không chỉ sau khi đã báo giá như policy cũ.
DROP POLICY IF EXISTS rfq_requests_supplier_view ON rfq_requests;

CREATE POLICY rfq_requests_supplier_view ON rfq_requests
    FOR SELECT USING (
        -- Supplier được mời đích danh (rfq_targets) — bao gồm cả RFQ đơn
        EXISTS (
            SELECT 1 FROM rfq_targets t
            JOIN supplier_profiles sp ON sp.id = t.supplier_id
            WHERE t.rfq_id = rfq_requests.id AND sp.user_id = auth.uid()
        )
        -- Supplier đã báo giá (trường hợp cũ, giữ lại phòng khi có luồng khác gán quote không qua targets)
        OR EXISTS (
            SELECT 1 FROM rfq_quotes rq
            JOIN supplier_profiles sp ON sp.id = rq.supplier_id
            WHERE rq.rfq_id = rfq_requests.id AND sp.user_id = auth.uid()
        )
        -- Multi-RFQ theo ngành hàng của mình
        OR (rfq_type = 'multi' AND status = 'published' AND EXISTS (
            SELECT 1 FROM supplier_profiles sp
            JOIN products p ON p.supplier_id = sp.id
            WHERE sp.user_id = auth.uid()
              AND p.category_id = rfq_requests.category_id
              AND p.status = 'active'
        ))
    );

-- ============================================================
-- BƯỚC 6 · SEED categories  (khớp CATEGORY_GROUPS trong
-- src/app/_components/home/data.ts — idempotent qua slug)
-- ============================================================

INSERT INTO categories (name, slug, craft_type, sort_order) VALUES
    ('Gốm sứ',                'gom-su',            'gom_su',    1),
    ('Mây tre đan',            'may-tre-dan',       'may_tre',   2),
    ('Đồ gỗ mỹ nghệ',          'do-go-my-nghe',     'do_go',     3),
    ('Lụa & thêu ren',         'lua-theu-ren',      'lua_theu',  4),
    ('Sơn mài & khảm trai',    'son-mai-kham-trai', 'son_mai',   5),
    ('Đúc đồng & kim loại',    'duc-dong-kim-loai', 'duc_dong',  6),
    ('Đá mỹ nghệ',             'da-my-nghe',        'da_my_nghe',7),
    ('Tranh & giấy dân gian',  'tranh-giay-dan-gian','tranh_dan_gian', 8),
    ('Thêu & may mặc',         'theu-may-mac',      'theu_may',  9),
    ('Đồ da thủ công',         'do-da-thu-cong',    'do_da',     10)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- BƯỚC 7 · create_rfq()  — atomic: check quota/credit + insert +
-- consume credit + ghi targets + notify, trong ĐÚNG 1 transaction (1 lời
-- gọi function Postgres = 1 transaction ngầm định), nên 2 request cùng
-- lúc của cùng 1 buyer không thể làm quota_used_this_month lệch số: câu
-- UPDATE ... WHERE quota_used_this_month < monthly_quota tự khóa hàng và
-- chỉ 1 trong 2 request thấy điều kiện còn đúng tại thời điểm nó chạy.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_rfq(
    p_title         TEXT,
    p_requirements  TEXT,
    p_quantity      INT,
    p_unit          TEXT,
    p_budget_min    NUMERIC,
    p_budget_max    NUMERIC,
    p_deadline_days INT,
    p_rfq_type      TEXT,
    p_category_id   UUID,
    p_supplier_ids  UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id       UUID;
    v_plan_name      TEXT;
    v_quota          rfq_quota_configs%ROWTYPE;
    v_credit_balance INT;
    v_rfq_id         UUID;
    v_used_credit    BOOLEAN := FALSE;
    v_supplier_id    UUID;
    v_supplier_count INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    SELECT id INTO v_buyer_id FROM buyer_profiles WHERE user_id = auth.uid();
    IF v_buyer_id IS NULL THEN
        RAISE EXCEPTION 'NOT_A_BUYER';
    END IF;

    IF p_rfq_type NOT IN ('single', 'multi') THEN
        RAISE EXCEPTION 'INVALID_RFQ_TYPE';
    END IF;

    IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT';
    END IF;
    IF p_quantity IS NULL OR p_quantity < 1 THEN
        RAISE EXCEPTION 'INVALID_INPUT';
    END IF;

    v_supplier_count := COALESCE(array_length(p_supplier_ids, 1), 0);
    IF v_supplier_count < 1 THEN
        RAISE EXCEPTION 'NO_SUPPLIER_SELECTED';
    END IF;
    IF p_rfq_type = 'single' AND v_supplier_count > 1 THEN
        RAISE EXCEPTION 'SINGLE_RFQ_ONE_SUPPLIER_ONLY';
    END IF;

    -- Lazy reset quota nếu đã sang kỳ hạn mức mới
    UPDATE buyer_profiles
    SET quota_used_this_month = 0,
        quota_reset_at = DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
    WHERE id = v_buyer_id
      AND quota_reset_at IS NOT NULL
      AND quota_reset_at <= NOW();

    SELECT mp.name INTO v_plan_name
    FROM user_memberships um
    JOIN membership_plans mp ON mp.id = um.plan_id
    WHERE um.user_id = auth.uid() AND um.is_active = TRUE
    ORDER BY um.started_at DESC
    LIMIT 1;

    IF v_plan_name IS NULL THEN
        v_plan_name := 'free';
    END IF;

    SELECT * INTO v_quota FROM rfq_quota_configs WHERE plan_name = v_plan_name;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'QUOTA_CONFIG_MISSING';
    END IF;

    IF p_rfq_type = 'multi' AND NOT v_quota.multi_rfq_allowed THEN
        RAISE EXCEPTION 'MULTI_RFQ_NOT_ALLOWED';
    END IF;
    IF v_supplier_count > v_quota.max_suppliers_per_rfq THEN
        RAISE EXCEPTION 'TOO_MANY_SUPPLIERS';
    END IF;

    -- Atomic quota consume. monthly_quota IS NULL = gói unlimited, bỏ qua
    -- toàn bộ khối check quota/credit bên dưới.
    IF v_quota.monthly_quota IS NOT NULL THEN
        UPDATE buyer_profiles
        SET quota_used_this_month = quota_used_this_month + 1
        WHERE id = v_buyer_id
          AND quota_used_this_month < v_quota.monthly_quota;

        IF NOT FOUND THEN
            SELECT credit_balance INTO v_credit_balance
            FROM buyer_profiles WHERE id = v_buyer_id FOR UPDATE;

            IF v_credit_balance IS NULL OR v_credit_balance < 1 THEN
                RAISE EXCEPTION 'QUOTA_EXCEEDED_NO_CREDIT';
            END IF;
            v_used_credit := TRUE;
        END IF;
    END IF;

    INSERT INTO rfq_requests (
        buyer_id, category_id, title, requirements, quantity, unit,
        budget_min, budget_max, deadline_days, rfq_type, status
    ) VALUES (
        v_buyer_id, p_category_id, trim(p_title), p_requirements, p_quantity, p_unit,
        p_budget_min, p_budget_max, p_deadline_days, p_rfq_type::rfq_type, 'published'
    ) RETURNING id INTO v_rfq_id;

    IF v_used_credit THEN
        INSERT INTO rfq_credit_ledger (buyer_id, change_amount, balance_after, reason, rfq_id)
        VALUES (v_buyer_id, -1, v_credit_balance - 1, 'consume', v_rfq_id);
    END IF;

    FOREACH v_supplier_id IN ARRAY p_supplier_ids LOOP
        INSERT INTO rfq_targets (rfq_id, supplier_id) VALUES (v_rfq_id, v_supplier_id);

        INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
        SELECT sp.user_id, 'rfq_received', 'Yêu cầu báo giá mới: ' || trim(p_title),
               'Số lượng ' || p_quantity || ' ' || COALESCE(p_unit, ''),
               jsonb_build_object('rfq_id', v_rfq_id),
               'in_app', 'sent', NOW()
        FROM supplier_profiles sp
        WHERE sp.id = v_supplier_id;
    END LOOP;

    RETURN jsonb_build_object('rfq_id', v_rfq_id, 'used_credit', v_used_credit);
END;
$$;

COMMENT ON FUNCTION public.create_rfq IS
    'Gọi qua Edge Function create-rfq (supabase/functions/create-rfq). Không
     gọi trực tiếp từ client nếu tránh được — Edge Function validate input
     thô trước, function này chỉ RAISE EXCEPTION với mã lỗi ngắn (xem
     ERROR_MESSAGES trong Edge Function) chứ không có message tiếng Việt
     sẵn, vì đây là lớp DB, không phải lớp hiển thị.';

REVOKE ALL ON FUNCTION public.create_rfq FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_rfq TO authenticated;

-- ============================================================
-- KIỂM TRA SAU MIGRATION
-- ============================================================
DO $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM membership_plans;
    IF v_count <> 3 THEN RAISE EXCEPTION 'membership_plans: kỳ vọng 3 rows, có %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM rfq_quota_configs;
    IF v_count <> 3 THEN RAISE EXCEPTION 'rfq_quota_configs: kỳ vọng 3 rows, có %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM categories;
    IF v_count < 10 THEN RAISE EXCEPTION 'categories: kỳ vọng >=10 rows, có %', v_count; END IF;

    RAISE NOTICE 'Migration OK — membership, quota, credit, rfq_targets, categories, create_rfq()';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.create_rfq(TEXT,TEXT,INT,TEXT,NUMERIC,NUMERIC,INT,TEXT,UUID,UUID[]);
-- DROP POLICY IF EXISTS rfq_requests_supplier_view ON rfq_requests;
-- CREATE POLICY rfq_requests_supplier_view ON rfq_requests FOR SELECT USING (
--     EXISTS (SELECT 1 FROM rfq_quotes rq JOIN supplier_profiles sp ON sp.id = rq.supplier_id
--             WHERE rq.rfq_id = rfq_requests.id AND sp.user_id = auth.uid())
--     OR (rfq_type = 'multi' AND status = 'published' AND EXISTS (
--         SELECT 1 FROM supplier_profiles sp JOIN products p ON p.supplier_id = sp.id
--         WHERE sp.user_id = auth.uid() AND p.category_id = rfq_requests.category_id AND p.status = 'active'))
-- );
-- DROP TABLE IF EXISTS rfq_targets CASCADE;
-- DROP TABLE IF EXISTS rfq_credit_ledger CASCADE;
-- DROP TABLE IF EXISTS rfq_quota_configs CASCADE;
-- DROP TABLE IF EXISTS user_memberships CASCADE;
-- DROP TABLE IF EXISTS membership_features CASCADE;
-- DROP TABLE IF EXISTS membership_plans CASCADE;
-- DROP TYPE IF EXISTS credit_reason;
-- DELETE FROM categories WHERE slug IN (
--     'gom-su','may-tre-dan','do-go-my-nghe','lua-theu-ren','son-mai-kham-trai',
--     'duc-dong-kim-loai','da-my-nghe','tranh-giay-dan-gian','theu-may-mac','do-da-thu-cong'
-- );
-- COMMIT;
