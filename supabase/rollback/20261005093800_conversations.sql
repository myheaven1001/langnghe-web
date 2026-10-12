-- Quay lui 20261005093800_conversations.sql (xem README.md).
-- XOÁ mọi hội thoại và tin nhắn gửi sau khi chuyển sang mô hình mới. Tin cũ
-- vẫn còn nguyên trong rfq_messages (migration chỉ chép, không xoá) và bảng
-- đó ghi lại được như trước. Quay lui web về bản trước 5.9 TRƯỚC khi chạy.
BEGIN;

ALTER PUBLICATION supabase_realtime DROP TABLE public.conversation_messages;
ALTER PUBLICATION supabase_realtime DROP TABLE public.conversations;

DROP FUNCTION IF EXISTS public.list_conversations();
DROP FUNCTION IF EXISTS public.mark_conversation_read(UUID);
DROP FUNCTION IF EXISTS public.send_message(UUID, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.start_conversation(UUID, UUID);

DROP TABLE IF EXISTS public.conversation_messages;
DROP TABLE IF EXISTS public.conversations;
DROP FUNCTION IF EXISTS public.conversation_role(UUID);

-- Bản 20260927090000.
CREATE POLICY rfq_messages_insert ON public.rfq_messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND (
            (sender_role = 'buyer' AND EXISTS (
                SELECT 1 FROM rfq_requests r
                JOIN buyer_profiles bp ON bp.id = r.buyer_id
                WHERE r.id = rfq_messages.rfq_id
                  AND bp.user_id = auth.uid()
            ))
            OR (sender_role = 'supplier' AND EXISTS (
                SELECT 1 FROM rfq_quotes q
                JOIN supplier_profiles sp ON sp.id = q.supplier_id
                WHERE q.rfq_id = rfq_messages.rfq_id
                  AND sp.user_id = auth.uid()
                  AND (rfq_messages.quote_id IS NULL OR rfq_messages.quote_id = q.id)
            ))
            OR public.is_admin()
        )
    );

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005093800';

COMMIT;
