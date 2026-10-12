-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 5.9: tin nhắn theo cặp buyer ↔ xưởng (thay cho rfq_messages).
--
-- Trước đây tin nhắn gắn chặt vào RFQ + báo giá: chưa có báo giá thì không
-- nhắn được, một cặp buyer–xưởng có nhiều luồng rời nhau theo từng RFQ, và
-- đơn đặt thẳng từ giỏ hàng (không có RFQ) thì không có chỗ nhắn.
--
--   conversations           Một dòng cho mỗi cặp (buyer, xưởng). Giữ sẵn tin
--       cuối và số tin chưa đọc của từng bên để trang danh sách không phải
--       đếm lại.
--   conversation_messages   Tin nhắn; có thể gắn ngữ cảnh (rfq / product /
--       order) để hiện "đang nói về gì".
--   Ghi qua hàm, client chỉ đọc:
--     start_conversation(supplier, buyer)   Buyer mở với xưởng đang công khai
--         (xưởng tắt "nhận tin trực tiếp" thì phải đã có báo giá / đơn chung).
--         Xưởng chỉ mở được với buyer đã có quan hệ: được mời báo giá, đã báo
--         giá, hoặc có đơn chung — tránh xưởng nhắn hàng loạt cho buyer lạ.
--     send_message(conversation, body, context_type, context_id)
--         Tối đa 4000 ký tự, 30 tin / phút mỗi người.
--     mark_conversation_read(conversation)
--     list_conversations()   Danh sách của người gọi kèm tên bên kia (buyer /
--         xưởng không đọc thẳng hồ sơ của nhau được nên phải qua hàm).
--   Realtime bật cho cả hai bảng.
--   Chuyển dữ liệu: mọi dòng rfq_messages được chép sang (ngữ cảnh = RFQ, giữ
--       thời gian gốc và trạng thái đã đọc). rfq_messages giữ nguyên, chỉ đọc
--       — bỏ ở bước 5.10.
--
-- Mã lỗi: NOT_AUTHENTICATED, ACCOUNT_SUSPENDED, NOT_A_PARTICIPANT,
--         COUNTERPART_NOT_FOUND, DIRECT_MESSAGE_DISABLED, NO_RELATIONSHIP,
--         CONVERSATION_NOT_FOUND, INVALID_MESSAGE, INVALID_CONTEXT,
--         MESSAGE_RATE_LIMIT.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.conversations') IS NOT NULL THEN
        RAISE EXCEPTION 'conversations đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF to_regclass('public.rfq_messages') IS NULL THEN
        RAISE EXCEPTION 'Thiếu rfq_messages. Chạy 20260927090000 trước.';
    END IF;
    IF to_regprocedure('public.supplier_is_public(uuid)') IS NULL THEN
        RAISE EXCEPTION 'Thiếu supplier_is_public(). Chạy 20261005090900 trước.';
    END IF;
END $$;

-- ── Bảng ───────────────────────────────────────────────────────────────
CREATE TABLE public.conversations (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id             UUID        NOT NULL REFERENCES public.buyer_profiles(id),
    supplier_id          UUID        NOT NULL REFERENCES public.supplier_profiles(id),
    last_message_at      TIMESTAMPTZ,
    last_message_preview TEXT,
    last_sender_role     TEXT        CHECK (last_sender_role IN ('buyer', 'supplier')),
    buyer_unread         INT         NOT NULL DEFAULT 0 CHECK (buyer_unread >= 0),
    supplier_unread      INT         NOT NULL DEFAULT 0 CHECK (supplier_unread >= 0),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_conversation_pair UNIQUE (buyer_id, supplier_id)
);

CREATE INDEX idx_conversations_supplier ON public.conversations (supplier_id, last_message_at DESC);
CREATE INDEX idx_conversations_buyer    ON public.conversations (buyer_id, last_message_at DESC);

CREATE TABLE public.conversation_messages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    sender_role     TEXT        NOT NULL CHECK (sender_role IN ('buyer', 'supplier')),
    body            TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    context_type    TEXT        CHECK (context_type IN ('rfq', 'product', 'order')),
    context_id      UUID,
    legacy_id       UUID,       -- rfq_messages.id của tin được chuyển sang (5.9)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_message_context CHECK ((context_type IS NULL) = (context_id IS NULL))
);

CREATE INDEX idx_conversation_messages_thread
    ON public.conversation_messages (conversation_id, created_at);

COMMENT ON TABLE public.conversations IS
    'Một luồng tin nhắn cho mỗi cặp buyer ↔ xưởng (kế hoạch 5.9). Ghi qua
     start_conversation / send_message / mark_conversation_read.';

-- Vai trò của người gọi trong một hội thoại: 'buyer' | 'supplier' | 'admin' | NULL.
CREATE FUNCTION public.conversation_role(p_conversation_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM buyer_profiles bp
                     WHERE bp.id = c.buyer_id AND bp.user_id = auth.uid()) THEN 'buyer'
        WHEN EXISTS (SELECT 1 FROM supplier_profiles sp
                     WHERE sp.id = c.supplier_id AND sp.user_id = auth.uid()) THEN 'supplier'
        WHEN public.is_admin() THEN 'admin'
    END
    FROM conversations c
    WHERE c.id = p_conversation_id;
$$;

REVOKE ALL ON FUNCTION public.conversation_role(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversation_role(UUID) TO authenticated;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY conversations_select ON public.conversations
    FOR SELECT TO authenticated
    USING (public.conversation_role(id) IS NOT NULL);
CREATE POLICY conversation_messages_select ON public.conversation_messages
    FOR SELECT TO authenticated
    USING (public.conversation_role(conversation_id) IS NOT NULL);

REVOKE ALL ON public.conversations, public.conversation_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.conversations, public.conversation_messages TO authenticated;

-- ── Mở hội thoại ───────────────────────────────────────────────────────
CREATE FUNCTION public.start_conversation(p_supplier_id UUID DEFAULT NULL, p_buyer_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer    UUID;
    v_supplier UUID;
    v_related  BOOLEAN;
    v_id       UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;
    IF (p_supplier_id IS NULL) = (p_buyer_id IS NULL) THEN
        RAISE EXCEPTION 'COUNTERPART_NOT_FOUND';
    END IF;

    IF p_supplier_id IS NOT NULL THEN
        -- Người gọi là buyer.
        SELECT id INTO v_buyer FROM buyer_profiles WHERE user_id = auth.uid();
        IF v_buyer IS NULL THEN
            RAISE EXCEPTION 'NOT_A_PARTICIPANT' USING DETAIL = 'Chỉ tài khoản người mua nhắn cho xưởng.';
        END IF;
        v_supplier := p_supplier_id;
        IF NOT EXISTS (SELECT 1 FROM supplier_profiles WHERE id = v_supplier) THEN
            RAISE EXCEPTION 'COUNTERPART_NOT_FOUND';
        END IF;
    ELSE
        -- Người gọi là xưởng.
        SELECT id INTO v_supplier FROM supplier_profiles WHERE user_id = auth.uid();
        IF v_supplier IS NULL THEN
            RAISE EXCEPTION 'NOT_A_PARTICIPANT' USING DETAIL = 'Chỉ tài khoản xưởng nhắn cho buyer.';
        END IF;
        v_buyer := p_buyer_id;
        IF NOT EXISTS (SELECT 1 FROM buyer_profiles WHERE id = v_buyer) THEN
            RAISE EXCEPTION 'COUNTERPART_NOT_FOUND';
        END IF;
    END IF;

    SELECT id INTO v_id FROM conversations WHERE buyer_id = v_buyer AND supplier_id = v_supplier;
    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    -- Hai bên đã có việc chung: xưởng được mời / đã báo giá RFQ của buyer, hoặc có đơn.
    v_related :=
        EXISTS (SELECT 1 FROM rfq_quotes q JOIN rfq_requests r ON r.id = q.rfq_id
                WHERE q.supplier_id = v_supplier AND r.buyer_id = v_buyer)
        OR EXISTS (SELECT 1 FROM rfq_targets t JOIN rfq_requests r ON r.id = t.rfq_id
                   WHERE t.supplier_id = v_supplier AND r.buyer_id = v_buyer
                     AND r.status NOT IN ('draft', 'cancelled'))
        OR EXISTS (SELECT 1 FROM orders o WHERE o.supplier_id = v_supplier AND o.buyer_id = v_buyer);

    IF p_supplier_id IS NOT NULL THEN
        IF NOT v_related THEN
            IF NOT public.supplier_is_public(v_supplier) THEN
                RAISE EXCEPTION 'COUNTERPART_NOT_FOUND';
            END IF;
            IF NOT COALESCE((SELECT allow_direct_message FROM supplier_profiles WHERE id = v_supplier), TRUE) THEN
                RAISE EXCEPTION 'DIRECT_MESSAGE_DISABLED'
                    USING DETAIL = 'Xưởng chỉ nhận tin từ buyer đã gửi yêu cầu báo giá hoặc có đơn.';
            END IF;
        END IF;
    ELSIF NOT v_related THEN
        RAISE EXCEPTION 'NO_RELATIONSHIP'
            USING DETAIL = 'Xưởng chỉ nhắn được cho buyer đã mời báo giá hoặc có đơn chung.';
    END IF;

    INSERT INTO conversations (buyer_id, supplier_id)
    VALUES (v_buyer, v_supplier)
    ON CONFLICT (buyer_id, supplier_id) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
        SELECT id INTO v_id FROM conversations WHERE buyer_id = v_buyer AND supplier_id = v_supplier;
    END IF;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_conversation(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_conversation(UUID, UUID) TO authenticated;

-- ── Gửi tin ────────────────────────────────────────────────────────────
CREATE FUNCTION public.send_message(
    p_conversation_id UUID,
    p_body            TEXT,
    p_context_type    TEXT DEFAULT NULL,
    p_context_id      UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_body TEXT := NULLIF(btrim(COALESCE(p_body, '')), '');
    v_conv conversations%ROWTYPE;
    v_ok   BOOLEAN;
    v_id   UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;

    v_role := public.conversation_role(p_conversation_id);
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'CONVERSATION_NOT_FOUND';
    END IF;
    IF v_role = 'admin' THEN
        RAISE EXCEPTION 'NOT_A_PARTICIPANT' USING DETAIL = 'Admin chỉ xem, không gửi tin trong hội thoại.';
    END IF;
    IF v_body IS NULL OR char_length(v_body) > 4000 THEN
        RAISE EXCEPTION 'INVALID_MESSAGE' USING DETAIL = 'Tin nhắn dài 1–4000 ký tự.';
    END IF;

    SELECT * INTO v_conv FROM conversations WHERE id = p_conversation_id FOR UPDATE;

    IF (p_context_type IS NULL) <> (p_context_id IS NULL) THEN
        RAISE EXCEPTION 'INVALID_CONTEXT';
    END IF;
    IF p_context_type IS NOT NULL THEN
        -- Ngữ cảnh phải thuộc đúng cặp này, không gắn bừa RFQ / đơn của người khác.
        v_ok := CASE p_context_type
            WHEN 'rfq' THEN EXISTS (SELECT 1 FROM rfq_requests r
                                    WHERE r.id = p_context_id AND r.buyer_id = v_conv.buyer_id)
            WHEN 'order' THEN EXISTS (SELECT 1 FROM orders o
                                      WHERE o.id = p_context_id AND o.buyer_id = v_conv.buyer_id
                                        AND o.supplier_id = v_conv.supplier_id)
            WHEN 'product' THEN EXISTS (SELECT 1 FROM products p
                                        WHERE p.id = p_context_id AND p.supplier_id = v_conv.supplier_id)
            ELSE FALSE END;
        IF NOT v_ok THEN
            RAISE EXCEPTION 'INVALID_CONTEXT';
        END IF;
    END IF;

    IF (SELECT count(*) FROM conversation_messages
        WHERE sender_id = auth.uid() AND created_at > clock_timestamp() - INTERVAL '1 minute') >= 30 THEN
        RAISE EXCEPTION 'MESSAGE_RATE_LIMIT' USING DETAIL = 'Tối đa 30 tin mỗi phút.';
    END IF;

    INSERT INTO conversation_messages (conversation_id, sender_id, sender_role, body, context_type, context_id)
    VALUES (p_conversation_id, auth.uid(), v_role, v_body, p_context_type, p_context_id)
    RETURNING id INTO v_id;

    UPDATE conversations
    SET last_message_at      = clock_timestamp(),
        last_message_preview = left(v_body, 160),
        last_sender_role     = v_role,
        buyer_unread         = CASE WHEN v_role = 'supplier' THEN buyer_unread + 1 ELSE buyer_unread END,
        supplier_unread      = CASE WHEN v_role = 'buyer' THEN supplier_unread + 1 ELSE supplier_unread END
    WHERE id = p_conversation_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_message(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message(UUID, TEXT, TEXT, UUID) TO authenticated;

CREATE INDEX idx_conversation_messages_sender
    ON public.conversation_messages (sender_id, created_at DESC);

-- ── Đánh dấu đã đọc ────────────────────────────────────────────────────
-- p_conversation_id NULL = đánh dấu mọi hội thoại của người gọi.
CREATE FUNCTION public.mark_conversation_read(p_conversation_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    UPDATE conversations c
    SET buyer_unread = 0
    WHERE (p_conversation_id IS NULL OR c.id = p_conversation_id)
      AND c.buyer_unread > 0
      AND EXISTS (SELECT 1 FROM buyer_profiles bp WHERE bp.id = c.buyer_id AND bp.user_id = auth.uid());
    UPDATE conversations c
    SET supplier_unread = 0
    WHERE (p_conversation_id IS NULL OR c.id = p_conversation_id)
      AND c.supplier_unread > 0
      AND EXISTS (SELECT 1 FROM supplier_profiles sp WHERE sp.id = c.supplier_id AND sp.user_id = auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;

-- ── Danh sách hội thoại của người gọi ──────────────────────────────────
CREATE FUNCTION public.list_conversations()
RETURNS TABLE (
    id                   UUID,
    my_role              TEXT,
    counterpart_id       UUID,
    counterpart_name     TEXT,
    last_message_at      TIMESTAMPTZ,
    last_message_preview TEXT,
    last_sender_role     TEXT,
    unread               INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT c.id, 'buyer', sp.id, sp.shop_name::TEXT,
           c.last_message_at, c.last_message_preview, c.last_sender_role, c.buyer_unread
    FROM conversations c
    JOIN buyer_profiles bp ON bp.id = c.buyer_id
    JOIN supplier_profiles sp ON sp.id = c.supplier_id
    WHERE bp.user_id = auth.uid()
    UNION ALL
    SELECT c.id, 'supplier', bp.id, bp.company_name::TEXT,
           c.last_message_at, c.last_message_preview, c.last_sender_role, c.supplier_unread
    FROM conversations c
    JOIN supplier_profiles sp ON sp.id = c.supplier_id
    JOIN buyer_profiles bp ON bp.id = c.buyer_id
    WHERE sp.user_id = auth.uid()
    ORDER BY 5 DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.list_conversations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_conversations() TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages;

-- ── Chuyển dữ liệu từ rfq_messages ─────────────────────────────────────
-- Mỗi tin cũ thuộc cặp (buyer của RFQ, xưởng của báo giá). Tin không gắn báo
-- giá (quote_id NULL): của xưởng gửi → cặp với chính xưởng đó; của buyer gửi
-- → chép cho từng xưởng đã báo giá RFQ ấy (đúng những người từng đọc được).
CREATE TEMP TABLE _legacy_messages ON COMMIT DROP AS
SELECT m.id AS legacy_id, r.buyer_id, q.supplier_id, m.rfq_id, m.sender_id,
       m.sender_role::TEXT AS sender_role, left(m.content, 4000) AS body,
       m.created_at AT TIME ZONE 'UTC' AS created_at, m.read_at IS NULL AS unread
FROM rfq_messages m
JOIN rfq_requests r ON r.id = m.rfq_id
JOIN rfq_quotes q ON q.id = m.quote_id
UNION ALL
SELECT m.id, r.buyer_id, sp.id, m.rfq_id, m.sender_id, 'supplier', left(m.content, 4000),
       m.created_at AT TIME ZONE 'UTC', m.read_at IS NULL
FROM rfq_messages m
JOIN rfq_requests r ON r.id = m.rfq_id
JOIN supplier_profiles sp ON sp.user_id = m.sender_id
WHERE m.quote_id IS NULL AND m.sender_role = 'supplier'
UNION ALL
SELECT m.id, r.buyer_id, s.supplier_id, m.rfq_id, m.sender_id, 'buyer', left(m.content, 4000),
       m.created_at AT TIME ZONE 'UTC', m.read_at IS NULL
FROM rfq_messages m
JOIN rfq_requests r ON r.id = m.rfq_id
JOIN (SELECT DISTINCT rfq_id, supplier_id FROM rfq_quotes) s ON s.rfq_id = m.rfq_id
WHERE m.quote_id IS NULL AND m.sender_role = 'buyer';

INSERT INTO public.conversations (buyer_id, supplier_id, created_at)
SELECT buyer_id, supplier_id, min(created_at) FROM _legacy_messages GROUP BY buyer_id, supplier_id;

INSERT INTO public.conversation_messages
    (conversation_id, sender_id, sender_role, body, context_type, context_id, legacy_id, created_at)
SELECT c.id, l.sender_id, l.sender_role, l.body, 'rfq', l.rfq_id, l.legacy_id, l.created_at
FROM _legacy_messages l
JOIN public.conversations c ON c.buyer_id = l.buyer_id AND c.supplier_id = l.supplier_id
WHERE char_length(l.body) > 0;

UPDATE public.conversations c
SET last_message_at      = s.last_at,
    last_message_preview = left(s.last_body, 160),
    last_sender_role     = s.last_role,
    buyer_unread         = s.buyer_unread,
    supplier_unread      = s.supplier_unread
FROM (
    SELECT c2.id,
           max(l.created_at) AS last_at,
           (array_agg(l.body ORDER BY l.created_at DESC))[1] AS last_body,
           (array_agg(l.sender_role ORDER BY l.created_at DESC))[1] AS last_role,
           count(*) FILTER (WHERE l.unread AND l.sender_role = 'supplier')::INT AS buyer_unread,
           count(*) FILTER (WHERE l.unread AND l.sender_role = 'buyer')::INT AS supplier_unread
    FROM _legacy_messages l
    JOIN public.conversations c2 ON c2.buyer_id = l.buyer_id AND c2.supplier_id = l.supplier_id
    GROUP BY c2.id
) s
WHERE c.id = s.id;

-- Đối soát: mọi tin cũ xác định được cặp buyer–xưởng phải có mặt ở bảng mới.
DO $$
DECLARE
    v_expected INT;
    v_copied   INT;
BEGIN
    SELECT count(*) INTO v_expected FROM _legacy_messages WHERE char_length(body) > 0;
    SELECT count(*) INTO v_copied FROM public.conversation_messages WHERE legacy_id IS NOT NULL;
    IF v_expected <> v_copied THEN
        RAISE EXCEPTION 'Chuyển tin nhắn lệch: cần % dòng, đã chép % dòng.', v_expected, v_copied;
    END IF;
    RAISE NOTICE 'Đã chuyển % tin nhắn cũ vào % hội thoại.', v_copied,
        (SELECT count(*) FROM public.conversations);
END $$;

-- rfq_messages thành chỉ đọc: web mới không ghi vào nữa, bảng bỏ ở 5.10.
DROP POLICY rfq_messages_insert ON public.rfq_messages;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — conversations, conversation_messages, start_conversation(), send_message(), mark_conversation_read(), list_conversations()';
END $$;

COMMIT;
