-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Giai đoạn 5.2 — Chat chi tiết (/messages/[rfqId]): bật Supabase
-- Realtime cho rfq_messages (tạo ở 20260927090000_rfq_messages.sql) +
-- mark_thread_read() để đánh dấu đã đọc ĐÚNG 1 hội thoại đang mở, khác
-- mark_all_messages_read() (5.1) đánh dấu TẤT CẢ hội thoại.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rfq_messages'
    ) THEN
        RAISE EXCEPTION 'rfq_messages đã bật Realtime rồi. Migration này đã chạy rồi.';
    END IF;
END $$;

-- Postgres Changes chỉ phát event cho bảng đã thêm vào publication này.
-- RLS (rfq_messages_select, 20260927090000) vẫn áp dụng cho stream —
-- client chỉ nhận được INSERT của những dòng mình có quyền SELECT.
ALTER PUBLICATION supabase_realtime ADD TABLE rfq_messages;

-- mark_thread_read(rfq, quote) — đánh dấu đã đọc 1 hội thoại cụ thể khi
-- buyer/supplier mở /messages/[rfqId]. SECURITY DEFINER vì cần UPDATE
-- tin của đối phương (giống mark_all_messages_read, xem giải thích ở đó).
-- p_quote_id NULL + đang gọi với tư cách buyer => hội thoại broadcast
-- (không gắn 1 supplier cụ thể); supplier luôn truyền quote_id của chính
-- họ (không NULL) vì mỗi supplier chỉ có tối đa 1 quote/rfq đang hoạt động.
CREATE OR REPLACE FUNCTION public.mark_thread_read(p_rfq_id UUID, p_quote_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id    UUID;
    v_supplier_id UUID;
BEGIN
    SELECT id INTO v_buyer_id FROM buyer_profiles WHERE user_id = auth.uid();
    SELECT id INTO v_supplier_id FROM supplier_profiles WHERE user_id = auth.uid();

    IF v_buyer_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM rfq_requests WHERE id = p_rfq_id AND buyer_id = v_buyer_id
    ) THEN
        UPDATE rfq_messages
        SET read_at = NOW()
        WHERE rfq_id = p_rfq_id
          AND read_at IS NULL
          AND sender_role = 'supplier'
          AND quote_id IS NOT DISTINCT FROM p_quote_id;
    ELSIF v_supplier_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM rfq_quotes
        WHERE rfq_id = p_rfq_id AND supplier_id = v_supplier_id
          AND (p_quote_id IS NULL OR id = p_quote_id)
    ) THEN
        UPDATE rfq_messages
        SET read_at = NOW()
        WHERE rfq_id = p_rfq_id
          AND read_at IS NULL
          AND sender_role = 'buyer'
          AND (quote_id IS NOT DISTINCT FROM p_quote_id OR quote_id IS NULL);
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_thread_read(UUID, UUID) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — rfq_messages Realtime + mark_thread_read()';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.mark_thread_read(UUID, UUID);
-- ALTER PUBLICATION supabase_realtime DROP TABLE rfq_messages;
-- COMMIT;
