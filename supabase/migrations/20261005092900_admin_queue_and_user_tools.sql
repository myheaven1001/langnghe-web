-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 4.10: hàng đợi việc của admin, chỉnh điểm, cấp credit,
-- supplier_profiles.verified_at.
--
--   admin_queue_counts()   Mọi con số của dashboard admin trong 1 lần gọi:
--       việc đang chờ (hồ sơ xác minh + số ngày chờ lâu nhất, đơn chờ xác nhận
--       tiền — trong đó bao nhiêu đơn đã có biên lai, tranh chấp đang mở, tài
--       khoản bị khoá / chưa hoàn tất đăng ký) và tổng quan (số buyer, số
--       xưởng, hồ sơ mới trong tháng, tổng tiền đã xác nhận trong tháng).
--   admin_adjust_score(loại hồ sơ, id hồ sơ, trust, risk, lý do)
--       Chỉnh điểm uy tín / rủi ro của buyer hoặc xưởng (0–100, NULL = giữ
--       nguyên), bắt buộc lý do, ghi nhật ký user.adjust_score.
--   admin_grant_credit(buyer, số credit, lý do)
--       Cộng / trừ credit RFQ của buyer (số âm = trừ, không để âm số dư),
--       bắt buộc lý do, ghi nhật ký user.grant_credit.
--   supplier_profiles.verified_at   Thời điểm xưởng được duyệt xác minh (như
--       buyer_profiles.verified_at). Trigger duyệt hồ sơ ghi cột này; xưởng
--       không tự sửa được. Điền lại từ các hồ sơ đã duyệt.
--   Trigger guard_buyer_system_columns / guard_supplier_system_columns: admin
--       đăng nhập qua API KHÔNG còn sửa thẳng các cột hệ thống (điểm, credit,
--       verified_at…) — phải qua hàm để có nhật ký. SQL Editor, service_role,
--       hàm SECURITY DEFINER không đổi.
--
-- Mã lỗi: FORBIDDEN_NOT_ADMIN, INVALID_INPUT, PROFILE_NOT_FOUND,
--         REASON_REQUIRED, INSUFFICIENT_CREDIT.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_queue_counts') THEN
        RAISE EXCEPTION 'admin_queue_counts() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'assert_admin') THEN
        RAISE EXCEPTION 'Thiếu assert_admin(). Chạy 20261005092000 (3.6) trước.';
    END IF;
    IF to_regclass('public.order_documents') IS NULL THEN
        RAISE EXCEPTION 'Thiếu order_documents. Chạy 20261005091900 (3.3) trước.';
    END IF;
END $$;

-- ── supplier_profiles.verified_at ──────────────────────────────────────
ALTER TABLE public.supplier_profiles ADD COLUMN verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.supplier_profiles.verified_at IS
    'Thời điểm hồ sơ xác minh gần nhất được duyệt; NULL = chưa xác minh (4.10).';

UPDATE public.supplier_profiles sp
SET verified_at = v.verified_at
FROM (
    SELECT entity_id, max(COALESCE(verified_at, created_at)) AS verified_at
    FROM public.verifications
    WHERE entity_type = 'supplier' AND status = 'approved'
    GROUP BY entity_id
) v
WHERE v.entity_id = sp.id;

-- Duyệt hồ sơ xưởng → ghi verified_at (trước đây chỉ ghi cho buyer).
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
        IF NEW.status = 'approved' THEN
            UPDATE supplier_profiles SET verified_at = NOW() WHERE id = NEW.entity_id;
        END IF;
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

-- ── Cột hệ thống: admin cũng phải đi qua hàm ───────────────────────────
CREATE OR REPLACE FUNCTION public.guard_buyer_system_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Admin đăng nhập qua API cũng không sửa thẳng (từ 4.10): chỉnh điểm, cấp
    -- credit đi qua admin_adjust_score() / admin_grant_credit() để có nhật ký.
    IF current_user <> 'authenticated' THEN
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

CREATE OR REPLACE FUNCTION public.guard_supplier_system_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Admin đăng nhập qua API cũng không sửa thẳng (từ 4.10): chỉnh điểm, cấp
    -- credit đi qua admin_adjust_score() / admin_grant_credit() để có nhật ký.
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Hàng mới tự tạo (completeProfile) phải mang đúng giá trị mặc định.
        IF NEW.trust_score      IS DISTINCT FROM 70
           OR NEW.risk_score    IS DISTINCT FROM 30
           OR NEW.membership_tier IS DISTINCT FROM 'free'
           OR NEW.response_rate  IS NOT NULL
           OR NEW.quote_win_rate IS NOT NULL
           OR NEW.on_time_rate   IS NOT NULL
           OR NEW.verified_at    IS NOT NULL THEN
            RAISE EXCEPTION 'FORBIDDEN_SYSTEM_COLUMN_CHANGE';
        END IF;
    ELSE
        IF NEW.trust_score      IS DISTINCT FROM OLD.trust_score
           OR NEW.risk_score    IS DISTINCT FROM OLD.risk_score
           OR NEW.membership_tier IS DISTINCT FROM OLD.membership_tier
           OR NEW.response_rate  IS DISTINCT FROM OLD.response_rate
           OR NEW.quote_win_rate IS DISTINCT FROM OLD.quote_win_rate
           OR NEW.on_time_rate   IS DISTINCT FROM OLD.on_time_rate
           OR NEW.verified_at    IS DISTINCT FROM OLD.verified_at THEN
            RAISE EXCEPTION 'FORBIDDEN_SYSTEM_COLUMN_CHANGE';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ── Hàng đợi việc của admin ────────────────────────────────────────────
CREATE FUNCTION public.admin_queue_counts()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month_start TIMESTAMP :=
        (date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AT TIME ZONE 'UTC';
BEGIN
    PERFORM public.assert_admin();

    RETURN jsonb_build_object(
        'pending_verifications',
            (SELECT count(*) FROM verifications WHERE status = 'pending'),
        'oldest_verification_days',
            (SELECT COALESCE(floor(extract(epoch FROM (NOW() AT TIME ZONE 'UTC') - min(created_at)) / 86400), 0)::INT
             FROM verifications WHERE status = 'pending'),
        'orders_pending_payment',
            (SELECT count(*) FROM orders WHERE status = 'pending_payment'),
        'orders_with_receipt',
            (SELECT count(*) FROM orders o
             WHERE o.status = 'pending_payment'
               AND EXISTS (SELECT 1 FROM order_documents d
                           WHERE d.order_id = o.id AND d.doc_type = 'payment_receipt')),
        'open_disputes',
            (SELECT count(*) FROM disputes WHERE status <> 'resolved'),
        'suspended_users',
            (SELECT count(*) FROM users WHERE status = 'suspended'),
        'pending_users',
            (SELECT count(*) FROM users WHERE status = 'pending'),
        'buyers',
            (SELECT count(*) FROM users WHERE role IN ('buyer', 'both')),
        'suppliers',
            (SELECT count(*) FROM users WHERE role IN ('supplier', 'both')),
        'new_profiles_month',
            (SELECT count(*) FROM buyer_profiles WHERE created_at >= v_month_start)
            + (SELECT count(*) FROM supplier_profiles WHERE created_at >= v_month_start),
        'paid_amount_month',
            (SELECT COALESCE(sum(COALESCE(paid_amount, total_amount)), 0) FROM orders
             WHERE status NOT IN ('pending_payment', 'cancelled') AND confirmed_at >= v_month_start));
END;
$$;

-- ── Chỉnh điểm uy tín / rủi ro ─────────────────────────────────────────
CREATE FUNCTION public.admin_adjust_score(
    p_profile_type TEXT,
    p_profile_id   UUID,
    p_trust_score  INT,
    p_risk_score   INT,
    p_reason       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reason    TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
    v_user_id   UUID;
    v_old_trust INT;
    v_old_risk  INT;
    v_new_trust INT;
    v_new_risk  INT;
BEGIN
    PERFORM public.assert_admin();

    IF p_profile_type IS NULL OR p_profile_type NOT IN ('buyer', 'supplier')
       OR (p_trust_score IS NULL AND p_risk_score IS NULL)
       OR p_trust_score NOT BETWEEN 0 AND 100
       OR p_risk_score NOT BETWEEN 0 AND 100 THEN
        RAISE EXCEPTION 'INVALID_INPUT' USING DETAIL = 'Điểm phải từ 0 đến 100.';
    END IF;
    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'REASON_REQUIRED' USING DETAIL = 'Chỉnh điểm phải ghi lý do.';
    END IF;

    IF p_profile_type = 'buyer' THEN
        SELECT user_id, trust_score, risk_score INTO v_user_id, v_old_trust, v_old_risk
        FROM buyer_profiles WHERE id = p_profile_id FOR UPDATE;
    ELSE
        SELECT user_id, trust_score, risk_score INTO v_user_id, v_old_trust, v_old_risk
        FROM supplier_profiles WHERE id = p_profile_id FOR UPDATE;
    END IF;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    v_new_trust := COALESCE(p_trust_score, v_old_trust);
    v_new_risk  := COALESCE(p_risk_score, v_old_risk);

    IF p_profile_type = 'buyer' THEN
        UPDATE buyer_profiles SET trust_score = v_new_trust, risk_score = v_new_risk
        WHERE id = p_profile_id;
    ELSE
        UPDATE supplier_profiles SET trust_score = v_new_trust, risk_score = v_new_risk
        WHERE id = p_profile_id;
    END IF;

    PERFORM public.log_admin_action('user.adjust_score', 'user', v_user_id::TEXT,
        jsonb_build_object('profile_type', p_profile_type, 'profile_id', p_profile_id,
                           'old_trust', v_old_trust, 'new_trust', v_new_trust,
                           'old_risk', v_old_risk, 'new_risk', v_new_risk, 'reason', v_reason));

    RETURN jsonb_build_object('trust_score', v_new_trust, 'risk_score', v_new_risk);
END;
$$;

-- ── Cấp / trừ credit RFQ ───────────────────────────────────────────────
CREATE FUNCTION public.admin_grant_credit(p_buyer_id UUID, p_amount INT, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reason  TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
    v_user_id UUID;
    v_old     INT;
    v_new     INT;
BEGIN
    PERFORM public.assert_admin();

    IF p_amount IS NULL OR p_amount = 0 OR p_amount NOT BETWEEN -1000 AND 1000 THEN
        RAISE EXCEPTION 'INVALID_INPUT' USING DETAIL = 'Số credit phải khác 0, trong khoảng -1000 đến 1000.';
    END IF;
    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'REASON_REQUIRED' USING DETAIL = 'Cấp/trừ credit phải ghi lý do.';
    END IF;

    SELECT user_id, credit_balance INTO v_user_id, v_old
    FROM buyer_profiles WHERE id = p_buyer_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    v_new := v_old + p_amount;
    IF v_new < 0 THEN
        RAISE EXCEPTION 'INSUFFICIENT_CREDIT'
            USING DETAIL = format('Buyer chỉ còn %s credit.', v_old);
    END IF;

    UPDATE buyer_profiles SET credit_balance = v_new WHERE id = p_buyer_id;

    PERFORM public.log_admin_action('user.grant_credit', 'user', v_user_id::TEXT,
        jsonb_build_object('buyer_id', p_buyer_id, 'amount', p_amount,
                           'old_balance', v_old, 'new_balance', v_new, 'reason', v_reason));

    RETURN jsonb_build_object('credit_balance', v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_queue_counts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_adjust_score(TEXT, UUID, INT, INT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_grant_credit(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_queue_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_score(TEXT, UUID, INT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_credit(UUID, INT, TEXT) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — admin_queue_counts / admin_adjust_score / admin_grant_credit + supplier_profiles.verified_at';
END $$;

COMMIT;
