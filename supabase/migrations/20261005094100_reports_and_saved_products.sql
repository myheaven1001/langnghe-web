-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Bước 6: báo cáo vi phạm (Uy tín) + sản phẩm đã lưu (Buyer).
--
--   content_reports   Người dùng đã đăng nhập báo một sản phẩm, gian hàng
--       hoặc đánh giá có vấn đề. Admin xem ở /admin/reports rồi xử lý bằng
--       công cụ sẵn có (gỡ sản phẩm, ẩn đánh giá, khoá tài khoản) và đóng báo
--       cáo: 'resolved' (đã xử lý) hoặc 'dismissed' (không vi phạm).
--     submit_report(target_type, target_id, reason, details)
--         Không tự báo hàng / gian hàng của mình; mỗi người một báo cáo đang
--         mở cho mỗi đối tượng; tối đa 10 báo cáo / ngày.
--     admin_resolve_report(report, outcome, note)   Có nhật ký admin.
--   saved_products   Danh sách sản phẩm đã lưu của từng tài khoản (tối đa
--       500). Người dùng tự thêm / bỏ dòng của mình qua API, không cần hàm.
--
-- Mã lỗi: NOT_AUTHENTICATED, ACCOUNT_SUSPENDED, INVALID_REPORT,
--         TARGET_NOT_FOUND, CANNOT_REPORT_OWN, REPORT_EXISTS,
--         REPORT_RATE_LIMIT, REPORT_NOT_FOUND, REPORT_ALREADY_CLOSED,
--         SAVED_LIMIT_REACHED.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.content_reports') IS NOT NULL THEN
        RAISE EXCEPTION 'content_reports đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF to_regclass('public.reviews') IS NULL THEN
        RAISE EXCEPTION 'Thiếu reviews. Chạy 20261005094000 trước.';
    END IF;
END $$;

-- ── Báo cáo vi phạm ────────────────────────────────────────────────────
CREATE TABLE public.content_reports (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id     UUID        NOT NULL REFERENCES public.users(id),
    target_type     TEXT        NOT NULL CHECK (target_type IN ('product', 'supplier', 'review')),
    target_id       UUID        NOT NULL,
    reason          TEXT        NOT NULL
                    CHECK (reason IN ('fake', 'prohibited', 'wrong_info', 'spam', 'ip', 'abuse', 'other')),
    details         TEXT        CHECK (details IS NULL OR char_length(details) <= 1000),
    status          TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    resolution_note TEXT,
    resolved_by     UUID        REFERENCES public.users(id),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_report_open_per_reporter
    ON public.content_reports (reporter_id, target_type, target_id) WHERE status = 'open';
CREATE INDEX idx_reports_status ON public.content_reports (status, created_at DESC);
CREATE INDEX idx_reports_target ON public.content_reports (target_type, target_id);

COMMENT ON TABLE public.content_reports IS
    'Báo cáo vi phạm về sản phẩm / gian hàng / đánh giá (bước 6). Ghi qua
     submit_report() và admin_resolve_report().';

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports FORCE ROW LEVEL SECURITY;

-- Người báo đọc báo cáo của mình; admin đọc tất cả. Bên bị báo không đọc được.
CREATE POLICY content_reports_select ON public.content_reports
    FOR SELECT TO authenticated
    USING (reporter_id = auth.uid() OR public.is_admin());

REVOKE ALL ON public.content_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.content_reports TO authenticated;

CREATE FUNCTION public.submit_report(
    p_target_type TEXT,
    p_target_id   UUID,
    p_reason      TEXT,
    p_details     TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_details TEXT := NULLIF(btrim(COALESCE(p_details, '')), '');
    v_owner   UUID;   -- tài khoản chủ của đối tượng bị báo
    v_id      UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;
    IF p_target_type IS NULL OR p_target_type NOT IN ('product', 'supplier', 'review')
       OR p_target_id IS NULL
       OR p_reason IS NULL
       OR p_reason NOT IN ('fake', 'prohibited', 'wrong_info', 'spam', 'ip', 'abuse', 'other')
       OR char_length(COALESCE(v_details, '')) > 1000 THEN
        RAISE EXCEPTION 'INVALID_REPORT';
    END IF;
    IF p_reason = 'other' AND v_details IS NULL THEN
        RAISE EXCEPTION 'INVALID_REPORT' USING DETAIL = 'Lý do "Khác" cần mô tả.';
    END IF;

    IF p_target_type = 'product' THEN
        SELECT sp.user_id INTO v_owner FROM products p
        JOIN supplier_profiles sp ON sp.id = p.supplier_id
        WHERE p.id = p_target_id AND p.status = 'active';
    ELSIF p_target_type = 'supplier' THEN
        SELECT sp.user_id INTO v_owner FROM supplier_profiles sp WHERE sp.id = p_target_id;
    ELSE
        SELECT bp.user_id INTO v_owner FROM reviews r
        JOIN buyer_profiles bp ON bp.id = r.buyer_id
        WHERE r.id = p_target_id AND r.hidden_at IS NULL;
    END IF;
    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'TARGET_NOT_FOUND';
    END IF;
    IF v_owner = auth.uid() THEN
        RAISE EXCEPTION 'CANNOT_REPORT_OWN';
    END IF;

    IF EXISTS (SELECT 1 FROM content_reports
               WHERE reporter_id = auth.uid() AND target_type = p_target_type
                 AND target_id = p_target_id AND status = 'open') THEN
        RAISE EXCEPTION 'REPORT_EXISTS';
    END IF;
    IF (SELECT count(*) FROM content_reports
        WHERE reporter_id = auth.uid() AND created_at > NOW() - INTERVAL '1 day') >= 10 THEN
        RAISE EXCEPTION 'REPORT_RATE_LIMIT' USING DETAIL = 'Tối đa 10 báo cáo mỗi ngày.';
    END IF;

    INSERT INTO content_reports (reporter_id, target_type, target_id, reason, details)
    VALUES (auth.uid(), p_target_type, p_target_id, p_reason, v_details)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_report(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_report(TEXT, UUID, TEXT, TEXT) TO authenticated;

CREATE FUNCTION public.admin_resolve_report(p_report_id UUID, p_outcome TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_report content_reports%ROWTYPE;
    v_note   TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
    PERFORM public.assert_admin();

    SELECT * INTO v_report FROM content_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'REPORT_NOT_FOUND';
    END IF;
    IF v_report.status <> 'open' THEN
        RAISE EXCEPTION 'REPORT_ALREADY_CLOSED';
    END IF;
    IF p_outcome IS NULL OR p_outcome NOT IN ('resolved', 'dismissed') THEN
        RAISE EXCEPTION 'INVALID_REPORT';
    END IF;

    UPDATE content_reports
    SET status = p_outcome, resolution_note = left(v_note, 500),
        resolved_by = auth.uid(), resolved_at = NOW()
    WHERE id = p_report_id;

    PERFORM public.log_admin_action('report.' || p_outcome, v_report.target_type, v_report.target_id::TEXT,
        jsonb_build_object('report_id', p_report_id, 'reason', v_report.reason, 'note', v_note));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_report(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(UUID, TEXT, TEXT) TO authenticated;

-- ── Sản phẩm đã lưu ────────────────────────────────────────────────────
CREATE TABLE public.saved_products (
    user_id    UUID        NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
    product_id UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, product_id)
);

CREATE INDEX idx_saved_products_user ON public.saved_products (user_id, created_at DESC);

COMMENT ON TABLE public.saved_products IS
    'Sản phẩm người dùng bấm "Lưu" để xem lại (bước 6). Mỗi người tự thêm / bỏ dòng của mình.';

ALTER TABLE public.saved_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_products FORCE ROW LEVEL SECURITY;

CREATE POLICY saved_products_select ON public.saved_products
    FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY saved_products_insert ON public.saved_products
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_active_user());
CREATE POLICY saved_products_delete ON public.saved_products
    FOR DELETE TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.saved_products FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.saved_products TO authenticated;

CREATE FUNCTION public.saved_products_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF (SELECT count(*) FROM saved_products WHERE user_id = NEW.user_id) >= 500 THEN
        RAISE EXCEPTION 'SAVED_LIMIT_REACHED' USING DETAIL = 'Tối đa 500 sản phẩm đã lưu.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_saved_products_limit
    BEFORE INSERT ON public.saved_products
    FOR EACH ROW EXECUTE FUNCTION public.saved_products_limit();

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — content_reports, submit_report(), admin_resolve_report(), saved_products';
END $$;

COMMIT;
