-- Quay lui 20261005093700_disputes_self_service.sql (xem README.md).
-- XOÁ toàn bộ trao đổi trong tranh chấp và sổ hoàn tiền (refunds) — xuất dữ
-- liệu refunds ra trước nếu còn khoản chưa chuyển. Tranh chấp do buyer / xưởng
-- tự mở vẫn giữ. File bằng chứng và bucket `dispute-files` KHÔNG xoá được
-- bằng SQL: xoá trong Dashboard → Storage nếu cần.
-- Quay lui web về bản trước 5.8 TRƯỚC khi chạy file này.
BEGIN;

DROP TRIGGER IF EXISTS trg_guard_order_in_dispute ON public.orders;
DROP FUNCTION IF EXISTS public.guard_order_in_dispute();

DROP FUNCTION IF EXISTS public.admin_mark_refund_paid(UUID, TEXT, TEXT);

-- Bản 20261005092200.
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(
    p_dispute_id   UUID,
    p_resolution   TEXT,
    p_refund_ratio NUMERIC DEFAULT NULL,
    p_note         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dispute disputes%ROWTYPE;
    v_note    TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
    v_ratio   NUMERIC;
BEGIN
    PERFORM public.assert_admin();

    SELECT * INTO v_dispute FROM disputes WHERE id = p_dispute_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'DISPUTE_NOT_FOUND';
    END IF;
    IF v_dispute.status = 'resolved' THEN
        RAISE EXCEPTION 'DISPUTE_ALREADY_RESOLVED';
    END IF;
    IF p_resolution IS NULL OR p_resolution NOT IN ('release_supplier', 'refund_buyer', 'partial') THEN
        RAISE EXCEPTION 'INVALID_RESOLUTION';
    END IF;
    IF p_resolution = 'partial' THEN
        IF p_refund_ratio IS NULL OR p_refund_ratio < 0 OR p_refund_ratio > 1 THEN
            RAISE EXCEPTION 'INVALID_RESOLUTION'
                USING DETAIL = 'Chia tỷ lệ cần phần hoàn cho buyer từ 0 đến 1.';
        END IF;
        v_ratio := p_refund_ratio;
    END IF;

    -- trg_handle_dispute_update gửi thông báo cho buyer + xưởng.
    UPDATE disputes
    SET status          = 'resolved',
        resolution      = p_resolution::dispute_resolution,
        refund_ratio    = v_ratio,
        resolution_note = v_note,
        resolved_by     = auth.uid(),
        resolved_at     = NOW()
    WHERE id = p_dispute_id;

    PERFORM public.log_admin_action('dispute.resolve', 'order', v_dispute.order_id::TEXT,
        jsonb_build_object('dispute_id', p_dispute_id, 'resolution', p_resolution,
                           'refund_ratio', v_ratio, 'note', v_note));

    RETURN jsonb_build_object('dispute_id', p_dispute_id, 'status', 'resolved');
END;
$$;

DROP TABLE IF EXISTS public.refunds;

ALTER PUBLICATION supabase_realtime DROP TABLE public.dispute_messages;
DROP FUNCTION IF EXISTS public.add_dispute_message(UUID, TEXT, TEXT, TEXT);
DROP POLICY IF EXISTS dispute_files_select ON storage.objects;
DROP POLICY IF EXISTS dispute_files_insert ON storage.objects;
DROP FUNCTION IF EXISTS public.can_access_dispute_file(TEXT);
DROP TABLE IF EXISTS public.dispute_messages;
DROP FUNCTION IF EXISTS public.dispute_role(UUID);

DROP FUNCTION IF EXISTS public.open_dispute(UUID, TEXT);

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005093700';

COMMIT;
