-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 3.3: chứng từ đơn hàng + ghi chú trên dòng thời gian.
-- (Kèm phần Realtime của 3.4: orders, order_events, order_documents.)
--
--   order_role(order_id)   Vai trò của người đang đăng nhập với một đơn:
--       'buyer' | 'supplier' | 'admin' | NULL (không liên quan).
--   order_documents        Chứng từ gắn với đơn (biên lai chuyển khoản, vận
--       đơn, hoá đơn…). File nằm ở bucket riêng tư `order-documents`, đường
--       dẫn `<order_id>/<tên file>`. Buyer của đơn, xưởng của đơn và admin
--       đọc + thêm; KHÔNG ai sửa/xoá qua API (chứng từ là bằng chứng).
--       Loại chứng từ theo vai trò:
--         buyer     payment_receipt, other
--         supplier  shipping_document, invoice, other
--         admin     tất cả
--       Mỗi đơn tối đa 30 chứng từ. Thêm chứng từ tự ghi event
--       'document_added' vào order_events.
--   add_order_note(order_id, note)   Buyer/xưởng/admin của đơn ghi chú
--       (1–1000 ký tự) → event 'note'. order_events vẫn không có quy tắc
--       INSERT: chỉ ghi qua hàm/trigger.
--   order_events.event_type thêm 'note', 'document_added'; metadata của 2
--       loại này có actor_role để trang đơn hiện "Buyer/Xưởng/Sàn".
--
-- Mã lỗi: ORDER_NOT_FOUND, INVALID_NOTE, INVALID_DOCUMENT,
--         FORBIDDEN_DOCUMENT_TYPE, ORDER_DOCUMENT_LIMIT, ACCOUNT_SUSPENDED.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.order_documents') IS NOT NULL THEN
        RAISE EXCEPTION 'order_documents đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF to_regclass('public.order_events') IS NULL THEN
        RAISE EXCEPTION 'Thiếu order_events. Chạy 20260920090000 trước.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_active_user') THEN
        RAISE EXCEPTION 'Thiếu is_active_user(). Chạy 20261005090800 (1.7) trước.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.order_events'::regclass AND conname = 'order_events_event_type_check'
    ) THEN
        RAISE EXCEPTION 'Không thấy ràng buộc order_events_event_type_check.';
    END IF;
END $$;

-- ── Vai trò của người gọi với một đơn ──────────────────────────────────
CREATE FUNCTION public.order_role(p_order_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM buyer_profiles bp
                     WHERE bp.id = o.buyer_id AND bp.user_id = auth.uid()) THEN 'buyer'
        WHEN EXISTS (SELECT 1 FROM supplier_profiles sp
                     WHERE sp.id = o.supplier_id AND sp.user_id = auth.uid()) THEN 'supplier'
        WHEN public.is_admin() THEN 'admin'
    END
    FROM orders o
    WHERE o.id = p_order_id;
$$;

REVOKE ALL ON FUNCTION public.order_role(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_role(UUID) TO authenticated;

-- ── order_events: thêm 2 loại ──────────────────────────────────────────
ALTER TABLE public.order_events DROP CONSTRAINT order_events_event_type_check;
ALTER TABLE public.order_events ADD CONSTRAINT order_events_event_type_check
    CHECK (event_type IN (
        'order_created', 'payment_confirmed', 'producing_started',
        'shipped', 'delivered', 'dispute_opened', 'dispute_resolved',
        'completed', 'cancelled', 'note', 'document_added'
    ));

CREATE FUNCTION public.add_order_note(p_order_id UUID, p_note TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT := public.order_role(p_order_id);
    v_note TEXT := btrim(COALESCE(p_note, ''));
    v_id   UUID;
BEGIN
    IF auth.uid() IS NULL OR v_role IS NULL THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;
    IF char_length(v_note) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'INVALID_NOTE' USING DETAIL = 'Ghi chú dài 1–1000 ký tự.';
    END IF;

    INSERT INTO order_events (order_id, actor_id, event_type, note, metadata)
    VALUES (p_order_id, auth.uid(), 'note', v_note, jsonb_build_object('actor_role', v_role))
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_order_note(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_order_note(UUID, TEXT) TO authenticated;

-- ── Chứng từ ────────────────────────────────────────────────────────────
CREATE TABLE public.order_documents (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID        NOT NULL REFERENCES public.orders(id),
    uploaded_by   UUID        NOT NULL REFERENCES public.users(id),
    uploader_role TEXT        NOT NULL CHECK (uploader_role IN ('buyer', 'supplier', 'admin')),
    doc_type      TEXT        NOT NULL
                  CHECK (doc_type IN ('payment_receipt', 'shipping_document', 'invoice', 'other')),
    storage_path  TEXT        NOT NULL UNIQUE,   -- trong bucket order-documents
    file_name     TEXT        NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
    mime_type     TEXT,
    file_size     INT         CHECK (file_size IS NULL OR file_size >= 0),
    note          TEXT        CHECK (note IS NULL OR char_length(note) <= 500),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_documents_order ON public.order_documents (order_id, created_at DESC);

ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY order_documents_select ON public.order_documents
    FOR SELECT USING (public.order_role(order_id) IS NOT NULL);
CREATE POLICY order_documents_insert ON public.order_documents
    FOR INSERT WITH CHECK (public.order_role(order_id) IS NOT NULL AND uploaded_by = auth.uid());
CREATE POLICY order_documents_active_user_insert ON public.order_documents
    AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_active_user());
-- Cố ý không có policy UPDATE/DELETE.

-- Người dùng app: tự điền người tải + vai trò, kiểm tra loại chứng từ và
-- đường dẫn file. service_role / SQL Editor: giữ nguyên giá trị truyền vào.
-- Chạy với quyền người gọi (như các trigger guard_* của bước 1) để
-- current_user phân biệt được app với SQL Editor.
CREATE FUNCTION public.order_documents_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF current_user = 'authenticated' THEN
        v_role := public.order_role(NEW.order_id);
        IF v_role IS NULL THEN
            RAISE EXCEPTION 'ORDER_NOT_FOUND';
        END IF;
        NEW.uploaded_by   := auth.uid();
        NEW.uploader_role := v_role;
        NEW.created_at    := NOW();

        IF (v_role = 'buyer' AND NEW.doc_type NOT IN ('payment_receipt', 'other'))
           OR (v_role = 'supplier' AND NEW.doc_type NOT IN ('shipping_document', 'invoice', 'other')) THEN
            RAISE EXCEPTION 'FORBIDDEN_DOCUMENT_TYPE'
                USING DETAIL = 'Vai trò ' || v_role || ' không tải được loại ' || NEW.doc_type || '.';
        END IF;
        IF NEW.storage_path NOT LIKE NEW.order_id::TEXT || '/%' THEN
            RAISE EXCEPTION 'INVALID_DOCUMENT'
                USING DETAIL = 'Đường dẫn file phải nằm trong thư mục của đơn.';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM storage.objects
                       WHERE bucket_id = 'order-documents' AND name = NEW.storage_path) THEN
            RAISE EXCEPTION 'INVALID_DOCUMENT' USING DETAIL = 'Chưa tải file lên.';
        END IF;
    END IF;

    IF (SELECT count(*) FROM order_documents WHERE order_id = NEW.order_id) >= 30 THEN
        RAISE EXCEPTION 'ORDER_DOCUMENT_LIMIT' USING DETAIL = 'Mỗi đơn tối đa 30 chứng từ.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_documents_before_insert
    BEFORE INSERT ON public.order_documents
    FOR EACH ROW EXECUTE FUNCTION public.order_documents_before_insert();

CREATE FUNCTION public.order_documents_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO order_events (order_id, actor_id, event_type, note, metadata)
    VALUES (NEW.order_id, NEW.uploaded_by, 'document_added', NEW.note,
            jsonb_build_object('actor_role', NEW.uploader_role, 'document_id', NEW.id,
                               'doc_type', NEW.doc_type, 'file_name', NEW.file_name));
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_order_documents_after_insert
    AFTER INSERT ON public.order_documents
    FOR EACH ROW EXECUTE FUNCTION public.order_documents_after_insert();

REVOKE ALL ON FUNCTION public.order_documents_after_insert() FROM PUBLIC, anon, authenticated;

-- ── Bucket riêng tư ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('order-documents', 'order-documents', FALSE, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

-- Thư mục cấp 1 của file là id đơn; tên lạ (không phải UUID) → FALSE.
CREATE FUNCTION public.can_access_order_file(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_folder TEXT := split_part(p_name, '/', 1);
BEGIN
    IF v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN FALSE;
    END IF;
    RETURN public.order_role(v_folder::UUID) IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_order_file(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_order_file(TEXT) TO authenticated;

CREATE POLICY order_documents_files_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'order-documents' AND public.can_access_order_file(name));
CREATE POLICY order_documents_files_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'order-documents' AND public.can_access_order_file(name));
-- Không có policy UPDATE/DELETE: file đã tải không thay/xoá được qua API.

-- ── Realtime cho trang đơn (3.4) ───────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_documents;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — order_documents + bucket order-documents + add_order_note() + Realtime';
END $$;

COMMIT;
