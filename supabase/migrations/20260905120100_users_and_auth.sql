-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration sang Supabase (2/11)
-- USERS & AUTH
--
-- THAY ĐỔI CHÍNH so với schema_v1_mvp.sql gốc:
--   [1] Bỏ email, phone, password_hash, last_login_at khỏi bảng users.
--       Supabase Auth (auth.users) đã có sẵn email, phone,
--       encrypted_password, last_sign_in_at — giữ lại ở đây sẽ tạo ra
--       2 nguồn sự thật (source of truth) dễ lệch dữ liệu.
--   [2] public.users chỉ còn 3 cột: id (FK → auth.users), role, status.
--   [3] Thêm trigger handle_new_user(): tự động tạo dòng public.users
--       mỗi khi có người đăng ký mới qua Supabase Auth (email/password,
--       OAuth, magic link... — trigger chạy cho MỌI cách đăng ký).
--   [4] buyer_profiles, supplier_profiles, verifications: giữ nguyên
--       100% cấu trúc, chỉ đổi FK trỏ sang public.users đã rút gọn.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- public.users — profile ứng dụng, KHÔNG chứa dữ liệu auth
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.users (
    id     UUID        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    role   user_role   NOT NULL DEFAULT 'buyer',
    status user_status NOT NULL DEFAULT 'pending'
);

COMMENT ON TABLE public.users IS
    'App-level profile: chỉ role + status. Email/phone/password sống ở '
    'auth.users (Supabase Auth) — không duplicate ở đây để tránh lệch dữ liệu.';

-- ────────────────────────────────────────────────────────────
-- Trigger: tự tạo dòng public.users khi có user đăng ký mới
-- ────────────────────────────────────────────────────────────
-- Đây là pattern chính thức Supabase khuyến nghị cho "profile table"
-- (xem: supabase.com/docs/guides/auth/managing-user-data).
-- SECURITY DEFINER: hàm chạy với quyền của người tạo hàm (role chạy
-- migration, mặc định là `postgres`), role này có BYPASSRLS trên
-- Supabase nên INSERT thành công dù bảng có FORCE ROW LEVEL SECURITY.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT := NEW.raw_user_meta_data ->> 'role';
BEGIN
    INSERT INTO public.users (id, role, status)
    VALUES (
        NEW.id,
        -- QUAN TRỌNG (bảo mật): raw_user_meta_data do CLIENT gửi lên lúc
        -- signUp() — hoàn toàn có thể bị giả mạo. Chỉ tin 'buyer'/'supplier'
        -- từ đây; 'admin'/'both' KHÔNG BAO GIỜ được cấp qua tự đăng ký,
        -- phải do một admin có sẵn cấp sau (UPDATE public.users trực tiếp).
        CASE WHEN v_role IN ('buyer', 'supplier') THEN v_role::user_role ELSE 'buyer' END,
        'pending'
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- buyer_profiles — không đổi cấu trúc
-- ────────────────────────────────────────────────────────────
CREATE TABLE buyer_profiles (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    tax_code     VARCHAR(20),
    address      TEXT,
    city         VARCHAR(100),
    -- Trust / Risk score: khai báo sẵn, tính từ Sprint 2
    trust_score  INT         NOT NULL DEFAULT 70 CHECK (trust_score BETWEEN 0 AND 100),
    risk_score   INT         NOT NULL DEFAULT 30 CHECK (risk_score  BETWEEN 0 AND 100),
    -- RFQ Quota: khai báo sẵn, enforce từ Sprint 2
    quota_used_this_month INT NOT NULL DEFAULT 0,
    quota_reset_at        TIMESTAMP,
    -- Credit balance: khai báo sẵn, enforce từ Sprint 2
    credit_balance        INT NOT NULL DEFAULT 0,
    verified_at  TIMESTAMP,
    created_at   TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- supplier_profiles — không đổi cấu trúc
-- ────────────────────────────────────────────────────────────
CREATE TABLE supplier_profiles (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    shop_name        VARCHAR(255) NOT NULL,
    tax_code         VARCHAR(20),
    village_origin   VARCHAR(255),               -- đặc thù làng nghề VN
    craft_category   VARCHAR(100),
    founding_year    INT,
    monthly_capacity INT,
    membership_tier  membership_tier NOT NULL DEFAULT 'free',
    -- Trust / Risk score: khai báo sẵn, tính từ Sprint 2
    trust_score      INT  NOT NULL DEFAULT 70 CHECK (trust_score BETWEEN 0 AND 100),
    risk_score       INT  NOT NULL DEFAULT 30 CHECK (risk_score  BETWEEN 0 AND 100),
    rating_avg       DECIMAL(3,2) DEFAULT 0.00,
    total_orders     INT  NOT NULL DEFAULT 0,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- verifications — không đổi cấu trúc / trigger polymorphic FK
-- ────────────────────────────────────────────────────────────
CREATE TABLE verifications (
    id                   UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id            UUID                NOT NULL,   -- buyer_profiles.id hoặc supplier_profiles.id
    entity_type          VARCHAR(20)         NOT NULL CHECK (entity_type IN ('buyer', 'supplier')),
    attempt_number       INT                 NOT NULL DEFAULT 1,
    status               verification_status NOT NULL DEFAULT 'pending',
    tax_code             VARCHAR(20),
    business_license_url VARCHAR(500),
    id_card_url          VARCHAR(500),        -- dành cho buyer cá nhân không có GPKD
    rejection_reason     TEXT,
    verified_by          UUID                REFERENCES users(id),
    verified_at          TIMESTAMP,
    created_at           TIMESTAMP           NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_verification_attempt UNIQUE (entity_id, entity_type, attempt_number)
);

CREATE OR REPLACE FUNCTION check_verification_entity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.entity_type = 'buyer' THEN
        IF NOT EXISTS (SELECT 1 FROM buyer_profiles WHERE id = NEW.entity_id) THEN
            RAISE EXCEPTION 'entity_id % không tồn tại trong buyer_profiles', NEW.entity_id;
        END IF;
    ELSIF NEW.entity_type = 'supplier' THEN
        IF NOT EXISTS (SELECT 1 FROM supplier_profiles WHERE id = NEW.entity_id) THEN
            RAISE EXCEPTION 'entity_id % không tồn tại trong supplier_profiles', NEW.entity_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_verification_entity
    BEFORE INSERT OR UPDATE ON verifications
    FOR EACH ROW EXECUTE FUNCTION check_verification_entity();
