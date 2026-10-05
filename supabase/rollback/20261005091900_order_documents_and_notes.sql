-- Quay lui 20261005091900_order_documents_and_notes.sql (xem README.md).
-- XOÁ danh sách chứng từ và các event 'note' / 'document_added'. File đã tải
-- và bucket `order-documents` KHÔNG xoá được bằng SQL (Supabase chặn xoá
-- thẳng bảng storage): xoá trong Dashboard → Storage nếu cần.
-- Quay lui web về bản trước 3.4 TRƯỚC khi chạy file này.
BEGIN;

ALTER PUBLICATION supabase_realtime DROP TABLE public.order_documents;
ALTER PUBLICATION supabase_realtime DROP TABLE public.order_events;
ALTER PUBLICATION supabase_realtime DROP TABLE public.orders;

DROP POLICY IF EXISTS order_documents_files_select ON storage.objects;
DROP POLICY IF EXISTS order_documents_files_insert ON storage.objects;
DROP FUNCTION IF EXISTS public.can_access_order_file(TEXT);

DROP TABLE IF EXISTS public.order_documents;
DROP FUNCTION IF EXISTS public.order_documents_before_insert();
DROP FUNCTION IF EXISTS public.order_documents_after_insert();

DROP FUNCTION IF EXISTS public.add_order_note(UUID, TEXT);

DELETE FROM public.order_events WHERE event_type IN ('note', 'document_added');
ALTER TABLE public.order_events DROP CONSTRAINT order_events_event_type_check;
ALTER TABLE public.order_events ADD CONSTRAINT order_events_event_type_check
    CHECK (event_type IN (
        'order_created', 'payment_confirmed', 'producing_started',
        'shipped', 'delivered', 'dispute_opened', 'dispute_resolved',
        'completed', 'cancelled'
    ));

DROP FUNCTION IF EXISTS public.order_role(UUID);

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005091900';

COMMIT;
