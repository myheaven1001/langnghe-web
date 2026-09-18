-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- rfq_messages (Sprint 2 — schema_v6_target.sql "BƯỚC 6 · RFQ MESSAGES") —
-- nền tảng dữ liệu cho Giai đoạn 5 (Nhắn tin & Thông báo):
--   5.1 Inbox nhắn tin (/messages) — group hội thoại theo rfq_id/quote_id
--   5.2 Chat chi tiết (/messages/[rfqId]) — Supabase Realtime gửi/nhận
--
-- Khác với schema_v6_target.sql gốc: thêm cột read_at — bản gốc không có
-- cơ chế đánh dấu đã đọc, nhưng cả 2 trang trên đều cần biết "còn bao
-- nhiêu tin chưa đọc" (badge số + tab "Chưa đọc" trong messages_inbox_page.html).
--
-- message_role đã có sẵn từ 20260905120000_extensions_and_enums.sql.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rfq_messages') THEN
        RAISE EXCEPTION 'rfq_messages đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE TABLE rfq_messages (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id         UUID         NOT NULL REFERENCES rfq_requests(id),
    quote_id       UUID         REFERENCES rfq_quotes(id),  -- NULL = broadcast tới mọi supplier đã báo giá
    sender_id      UUID         NOT NULL REFERENCES users(id),
    content        TEXT         NOT NULL CHECK (char_length(content) > 0),
    attachment_url VARCHAR(500),
    sender_role    message_role NOT NULL,
    read_at        TIMESTAMP,
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rfq_messages_rfq        ON rfq_messages (rfq_id, created_at DESC);
CREATE INDEX idx_rfq_messages_quote      ON rfq_messages (quote_id);
CREATE INDEX idx_rfq_messages_unread     ON rfq_messages (rfq_id) WHERE read_at IS NULL;

-- ============================================================
-- RLS — cùng nguyên tắc participant-based như rfq_quotes ở
-- 20260905121000_rls_policies.sql: buyer thấy tin của RFQ mình tạo,
-- supplier thấy tin của RFQ mình đã báo giá (đúng quote_id, hoặc
-- broadcast quote_id IS NULL).
-- ============================================================
ALTER TABLE rfq_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY rfq_messages_select ON rfq_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM rfq_requests r
            JOIN buyer_profiles bp ON bp.id = r.buyer_id
            WHERE r.id = rfq_messages.rfq_id
              AND bp.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM rfq_quotes q
            JOIN supplier_profiles sp ON sp.id = q.supplier_id
            WHERE q.rfq_id = rfq_messages.rfq_id
              AND sp.user_id = auth.uid()
              AND (rfq_messages.quote_id IS NULL OR rfq_messages.quote_id = q.id)
        )
        OR public.is_admin()
    );

CREATE POLICY rfq_messages_insert ON rfq_messages
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

ALTER TABLE rfq_messages FORCE ROW LEVEL SECURITY;

-- ============================================================
-- mark_all_messages_read() — dùng cho nút "✓ Đánh dấu đã đọc tất cả"
-- ở /messages (5.1). SECURITY DEFINER vì cần UPDATE tin của NGƯỜI KHÁC
-- gửi (đối phương) — participant chỉ có quyền SELECT/INSERT qua RLS ở
-- trên, không có policy UPDATE (tránh 1 phía tự sửa được nội dung tin
-- của chính mình hoặc của đối phương).
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_all_messages_read()
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

    IF v_buyer_id IS NOT NULL THEN
        UPDATE rfq_messages m
        SET read_at = NOW()
        WHERE m.read_at IS NULL
          AND m.sender_role = 'supplier'
          AND EXISTS (
              SELECT 1 FROM rfq_requests r
              WHERE r.id = m.rfq_id AND r.buyer_id = v_buyer_id
          );
    END IF;

    IF v_supplier_id IS NOT NULL THEN
        UPDATE rfq_messages m
        SET read_at = NOW()
        WHERE m.read_at IS NULL
          AND m.sender_role = 'buyer'
          AND EXISTS (
              SELECT 1 FROM rfq_quotes q
              WHERE q.supplier_id = v_supplier_id
                AND q.rfq_id = m.rfq_id
                AND (m.quote_id IS NULL OR m.quote_id = q.id)
          );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_messages_read() TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — rfq_messages (RLS + mark_all_messages_read)';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.mark_all_messages_read();
-- DROP TABLE IF EXISTS rfq_messages CASCADE;
-- COMMIT;
