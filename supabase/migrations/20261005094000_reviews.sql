-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Bước 6 (Uy tín): buyer đánh giá xưởng sau khi đơn hoàn tất.
--
-- supplier_profiles.rating_avg có từ đầu nhưng chưa bao giờ có dữ liệu.
--
--   reviews   Mỗi đơn hoàn tất một đánh giá (1–5 sao + nhận xét). Xưởng trả
--       lời được một lần (sửa lại được). Admin ẩn / hiện lại (hidden_at) —
--       không xoá. Bảng không đọc công khai: buyer đọc đánh giá mình viết,
--       xưởng đọc đánh giá về mình (cả cái bị ẩn), admin đọc tất cả.
--   submit_review(order, rating, comment)   Buyer của đơn, đơn 'completed',
--       chưa có đánh giá, không có tranh chấp đang mở.
--   reply_review(review, reply)             Xưởng được đánh giá.
--   admin_moderate_review(review, hide, reason)   Có nhật ký admin.
--   supplier_reviews(supplier, limit, offset) + supplier_review_summary(supplier)
--       Phần công khai cho trang gian hàng / sản phẩm: chỉ đánh giá không bị
--       ẩn của xưởng đang công khai, tên buyer được che bớt.
--   Trigger tính lại supplier_profiles.rating_avg (trung bình các đánh giá
--       không bị ẩn) + cột mới rating_count.
--   Vá kèm: xưởng không còn tự UPDATE được rating_avg / rating_count /
--       total_orders của chính mình (FORBIDDEN_SYSTEM_COLUMN_CHANGE).
--
-- Mã lỗi: NOT_AUTHENTICATED, ACCOUNT_SUSPENDED, ORDER_NOT_FOUND,
--         ORDER_NOT_COMPLETED, ORDER_IN_DISPUTE, REVIEW_EXISTS, INVALID_RATING,
--         INVALID_COMMENT, REVIEW_NOT_FOUND, REVIEW_HIDDEN, REASON_REQUIRED.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.reviews') IS NOT NULL THEN
        RAISE EXCEPTION 'reviews đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'notification_type' AND e.enumlabel = 'review_received'
    ) THEN
        RAISE EXCEPTION 'notification_type thiếu review_received. Chạy 20261005093900 trước.';
    END IF;
    IF to_regprocedure('public.assert_admin()') IS NULL THEN
        RAISE EXCEPTION 'Thiếu assert_admin(). Chạy 20261005092000 trước.';
    END IF;
END $$;

ALTER TABLE public.supplier_profiles
    ADD COLUMN rating_count INT NOT NULL DEFAULT 0 CHECK (rating_count >= 0);

COMMENT ON COLUMN public.supplier_profiles.rating_count IS
    'Số đánh giá đang hiển thị — trigger sync_supplier_rating ghi cùng rating_avg.';

CREATE TABLE public.reviews (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id       UUID        NOT NULL UNIQUE REFERENCES public.orders(id),
    buyer_id       UUID        NOT NULL REFERENCES public.buyer_profiles(id),
    supplier_id    UUID        NOT NULL REFERENCES public.supplier_profiles(id),
    rating         INT         NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment        TEXT        CHECK (comment IS NULL OR char_length(comment) <= 1000),
    supplier_reply TEXT        CHECK (supplier_reply IS NULL OR char_length(supplier_reply) <= 1000),
    replied_at     TIMESTAMPTZ,
    hidden_at      TIMESTAMPTZ,
    hidden_by      UUID        REFERENCES public.users(id),
    hidden_reason  TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_supplier ON public.reviews (supplier_id, created_at DESC);
CREATE INDEX idx_reviews_buyer    ON public.reviews (buyer_id, created_at DESC);

COMMENT ON TABLE public.reviews IS
    'Đánh giá của buyer cho xưởng, mỗi đơn hoàn tất một cái (bước 6). Ghi qua
     submit_review / reply_review / admin_moderate_review; phần công khai đọc
     qua supplier_reviews().';

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY reviews_select ON public.reviews
    FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (SELECT 1 FROM public.buyer_profiles bp
                   WHERE bp.id = reviews.buyer_id AND bp.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.supplier_profiles sp
                   WHERE sp.id = reviews.supplier_id AND sp.user_id = auth.uid())
    );

REVOKE ALL ON public.reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reviews TO authenticated;

-- ── Tính lại điểm của xưởng ────────────────────────────────────────────
CREATE FUNCTION public.sync_supplier_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier UUID := COALESCE(NEW.supplier_id, OLD.supplier_id);
BEGIN
    UPDATE supplier_profiles sp
    SET rating_avg   = COALESCE(s.avg_rating, 0),
        rating_count = COALESCE(s.cnt, 0)
    FROM (SELECT round(avg(rating)::NUMERIC, 2) AS avg_rating, count(*)::INT AS cnt
          FROM reviews WHERE supplier_id = v_supplier AND hidden_at IS NULL) s
    WHERE sp.id = v_supplier;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_supplier_rating
    AFTER INSERT OR DELETE OR UPDATE OF rating, hidden_at ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_rating();

REVOKE ALL ON FUNCTION public.sync_supplier_rating() FROM PUBLIC, anon, authenticated;

-- ── Buyer gửi đánh giá ─────────────────────────────────────────────────
CREATE FUNCTION public.submit_review(p_order_id UUID, p_rating INT, p_comment TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order   orders%ROWTYPE;
    v_comment TEXT := NULLIF(btrim(COALESCE(p_comment, '')), '');
    v_id      UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;

    SELECT o.* INTO v_order FROM orders o
    JOIN buyer_profiles bp ON bp.id = o.buyer_id
    WHERE o.id = p_order_id AND bp.user_id = auth.uid()
    FOR UPDATE OF o;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF v_order.status <> 'completed' THEN
        RAISE EXCEPTION 'ORDER_NOT_COMPLETED' USING DETAIL = 'Chỉ đánh giá được đơn đã hoàn tất.';
    END IF;
    IF EXISTS (SELECT 1 FROM disputes WHERE order_id = p_order_id AND status <> 'resolved') THEN
        RAISE EXCEPTION 'ORDER_IN_DISPUTE';
    END IF;
    IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'INVALID_RATING';
    END IF;
    IF char_length(COALESCE(v_comment, '')) > 1000 THEN
        RAISE EXCEPTION 'INVALID_COMMENT';
    END IF;
    IF EXISTS (SELECT 1 FROM reviews WHERE order_id = p_order_id) THEN
        RAISE EXCEPTION 'REVIEW_EXISTS';
    END IF;

    INSERT INTO reviews (order_id, buyer_id, supplier_id, rating, comment)
    VALUES (p_order_id, v_order.buyer_id, v_order.supplier_id, p_rating, v_comment)
    RETURNING id INTO v_id;

    INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
    SELECT sp.user_id, 'review_received',
           'Đánh giá mới ' || p_rating || '★ cho đơn #' || UPPER(LEFT(p_order_id::TEXT, 8)),
           COALESCE(left(v_comment, 200), 'Buyer đã chấm điểm đơn hàng.'),
           jsonb_build_object('order_id', p_order_id, 'review_id', v_id),
           'in_app', 'sent', NOW()
    FROM supplier_profiles sp WHERE sp.id = v_order.supplier_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_review(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_review(UUID, INT, TEXT) TO authenticated;

-- ── Xưởng trả lời ──────────────────────────────────────────────────────
CREATE FUNCTION public.reply_review(p_review_id UUID, p_reply TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_review reviews%ROWTYPE;
    v_reply  TEXT := NULLIF(btrim(COALESCE(p_reply, '')), '');
    v_first  BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;

    SELECT r.* INTO v_review FROM reviews r
    JOIN supplier_profiles sp ON sp.id = r.supplier_id
    WHERE r.id = p_review_id AND sp.user_id = auth.uid()
    FOR UPDATE OF r;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'REVIEW_NOT_FOUND';
    END IF;
    IF v_review.hidden_at IS NOT NULL THEN
        RAISE EXCEPTION 'REVIEW_HIDDEN' USING DETAIL = 'Đánh giá đang bị sàn ẩn, không trả lời được.';
    END IF;
    IF v_reply IS NULL OR char_length(v_reply) > 1000 THEN
        RAISE EXCEPTION 'INVALID_COMMENT' USING DETAIL = 'Trả lời dài 1–1000 ký tự.';
    END IF;

    v_first := v_review.supplier_reply IS NULL;
    UPDATE reviews SET supplier_reply = v_reply, replied_at = NOW() WHERE id = p_review_id;

    IF v_first THEN
        INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
        SELECT bp.user_id, 'review_replied',
               'Xưởng đã trả lời đánh giá đơn #' || UPPER(LEFT(v_review.order_id::TEXT, 8)),
               left(v_reply, 200),
               jsonb_build_object('order_id', v_review.order_id, 'review_id', p_review_id),
               'in_app', 'sent', NOW()
        FROM buyer_profiles bp WHERE bp.id = v_review.buyer_id;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reply_review(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reply_review(UUID, TEXT) TO authenticated;

-- ── Admin ẩn / hiện lại ────────────────────────────────────────────────
CREATE FUNCTION public.admin_moderate_review(p_review_id UUID, p_hide BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_review reviews%ROWTYPE;
    v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
    PERFORM public.assert_admin();

    SELECT * INTO v_review FROM reviews WHERE id = p_review_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'REVIEW_NOT_FOUND';
    END IF;
    IF p_hide IS NULL THEN
        RAISE EXCEPTION 'REASON_REQUIRED';
    END IF;
    IF p_hide AND v_reason IS NULL THEN
        RAISE EXCEPTION 'REASON_REQUIRED' USING DETAIL = 'Ẩn đánh giá phải ghi lý do.';
    END IF;

    IF p_hide THEN
        UPDATE reviews
        SET hidden_at = COALESCE(hidden_at, NOW()), hidden_by = auth.uid(), hidden_reason = left(v_reason, 500)
        WHERE id = p_review_id;
    ELSE
        UPDATE reviews SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL
        WHERE id = p_review_id;
    END IF;

    PERFORM public.log_admin_action(
        CASE WHEN p_hide THEN 'review.hide' ELSE 'review.unhide' END,
        'review', p_review_id::TEXT,
        jsonb_build_object('order_id', v_review.order_id, 'supplier_id', v_review.supplier_id,
                           'rating', v_review.rating, 'reason', v_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_moderate_review(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_review(UUID, BOOLEAN, TEXT) TO authenticated;

-- ── Phần công khai ─────────────────────────────────────────────────────
-- Tên buyer che bớt: giữ chữ đầu mỗi từ ("Decor Hà Nội" → "D*** H* N**").
CREATE FUNCTION public.mask_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(string_agg(left(w, 1) || repeat('*', LEAST(GREATEST(char_length(w) - 1, 1), 4)), ' '), 'Buyer')
    FROM unnest(regexp_split_to_array(btrim(COALESCE(p_name, '')), '\s+')) AS w
    WHERE w <> '';
$$;

CREATE FUNCTION public.supplier_reviews(p_supplier_id UUID, p_limit INT DEFAULT 10, p_offset INT DEFAULT 0)
RETURNS TABLE (
    id             UUID,
    rating         INT,
    comment        TEXT,
    supplier_reply TEXT,
    replied_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ,
    buyer_name     TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT r.id, r.rating, r.comment, r.supplier_reply, r.replied_at, r.created_at,
           public.mask_name(bp.company_name)
    FROM reviews r
    JOIN buyer_profiles bp ON bp.id = r.buyer_id
    WHERE r.supplier_id = p_supplier_id
      AND r.hidden_at IS NULL
      AND public.supplier_is_public(p_supplier_id)
    ORDER BY r.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE FUNCTION public.supplier_review_summary(p_supplier_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'count', count(*),
        'average', COALESCE(round(avg(r.rating)::NUMERIC, 1), 0),
        'stars', jsonb_build_object(
            '5', count(*) FILTER (WHERE r.rating = 5),
            '4', count(*) FILTER (WHERE r.rating = 4),
            '3', count(*) FILTER (WHERE r.rating = 3),
            '2', count(*) FILTER (WHERE r.rating = 2),
            '1', count(*) FILTER (WHERE r.rating = 1)))
    FROM reviews r
    WHERE r.supplier_id = p_supplier_id
      AND r.hidden_at IS NULL
      AND public.supplier_is_public(p_supplier_id);
$$;

REVOKE ALL ON FUNCTION public.supplier_reviews(UUID, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supplier_review_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_reviews(UUID, INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_review_summary(UUID) TO anon, authenticated;

-- ── Xưởng không tự sửa điểm đánh giá / số đơn của mình ─────────────────
-- guard_supplier_system_columns (4.10) chưa chặn rating_avg, total_orders:
-- xưởng UPDATE thẳng hồ sơ của mình qua API là tự đặt được 5 sao. Giờ điểm
-- có dữ liệu thật nên chặn bằng một trigger riêng (không đụng trigger cũ).
CREATE FUNCTION public.guard_supplier_rating_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Trigger / hàm SECURITY DEFINER của hệ thống chạy dưới vai trò khác → bỏ qua.
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF COALESCE(NEW.rating_avg, 0) <> 0
           OR COALESCE(NEW.rating_count, 0) <> 0
           OR COALESCE(NEW.total_orders, 0) <> 0 THEN
            RAISE EXCEPTION 'FORBIDDEN_SYSTEM_COLUMN_CHANGE';
        END IF;
    ELSIF NEW.rating_avg IS DISTINCT FROM OLD.rating_avg
       OR NEW.rating_count IS DISTINCT FROM OLD.rating_count
       OR NEW.total_orders IS DISTINCT FROM OLD.total_orders THEN
        RAISE EXCEPTION 'FORBIDDEN_SYSTEM_COLUMN_CHANGE';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_supplier_rating_columns
    BEFORE INSERT OR UPDATE ON public.supplier_profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_rating_columns();

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — reviews, submit_review(), reply_review(), admin_moderate_review(), supplier_reviews(), supplier_review_summary()';
END $$;

COMMIT;
