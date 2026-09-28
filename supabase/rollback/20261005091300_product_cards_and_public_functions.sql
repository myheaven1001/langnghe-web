-- Quay lui 20261005091300_product_cards_and_public_functions.sql (xem README.md).
-- Xoá view/hàm mới, đưa create_rfq về bản 10 tham số (không có p_product_id).
-- Code app gọi product_cards/public_stats/search_suggest sẽ lỗi — quay lui
-- code cùng lúc.
BEGIN;

DROP FUNCTION IF EXISTS public.search_suggest(TEXT, INT);
DROP FUNCTION IF EXISTS public.public_stats();
DROP VIEW IF EXISTS public.product_cards;
DROP FUNCTION IF EXISTS public.create_rfq(TEXT, TEXT, INT, TEXT, NUMERIC, NUMERIC, INT, TEXT, UUID, UUID[], UUID);

CREATE FUNCTION public.create_rfq(
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


REVOKE ALL ON FUNCTION public.create_rfq(TEXT, TEXT, INT, TEXT, NUMERIC, NUMERIC, INT, TEXT, UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_rfq(TEXT, TEXT, INT, TEXT, NUMERIC, NUMERIC, INT, TEXT, UUID, UUID[]) TO authenticated;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005091300';

COMMIT;
