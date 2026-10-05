-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 3.2: sổ địa chỉ giao hàng + accept_quote bắt buộc có địa chỉ.
--
--   buyer_addresses   Sổ địa chỉ của buyer (tối đa 20). Mỗi buyer luôn có
--       đúng 1 địa chỉ mặc định khi còn ít nhất 1 địa chỉ:
--         - địa chỉ đầu tiên tự thành mặc định;
--         - đặt địa chỉ khác làm mặc định → địa chỉ cũ tự bỏ mặc định;
--         - không bỏ mặc định trực tiếp được (phải chọn địa chỉ khác);
--         - xoá địa chỉ mặc định → địa chỉ mới nhất còn lại thành mặc định.
--       Chỉ buyer chủ sở hữu đọc/ghi; admin đọc. Tài khoản bị khoá không ghi.
--   accept_quote(p_quote_id, p_address_id DEFAULT NULL)
--       SỬA HÀM ĐANG CHẠY. Thêm tham số địa chỉ: NULL → dùng địa chỉ mặc
--       định; không có địa chỉ nào → ADDRESS_REQUIRED; địa chỉ không phải của
--       mình → ADDRESS_NOT_FOUND. Địa chỉ được CHÉP (không tham chiếu) vào
--       orders.shipping_address dạng "Người nhận — SĐT" + xuống dòng + địa
--       chỉ, nên sửa/xoá sổ địa chỉ sau này không làm đổi đơn đã tạo.
--       Phần còn lại giữ nguyên bản 20260919090100.
--
-- Thứ tự deploy: migration này → Edge Function accept-quote → Next.js.
-- Giữa lúc chạy migration và lúc web mới lên, nút "Chấp nhận báo giá" của
-- web cũ báo ADDRESS_REQUIRED (không tạo đơn sai) — chấp nhận được vì chỉ
-- kéo dài vài phút.
--
-- Mã lỗi mới: ADDRESS_REQUIRED, ADDRESS_NOT_FOUND, ADDRESS_LIMIT_REACHED.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.buyer_addresses') IS NOT NULL THEN
        RAISE EXCEPTION 'buyer_addresses đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_active_user') THEN
        RAISE EXCEPTION 'Thiếu is_active_user(). Chạy 20261005090800 (1.7) trước.';
    END IF;
    IF to_regprocedure('public.accept_quote(uuid)') IS NULL THEN
        RAISE EXCEPTION 'Thiếu accept_quote(uuid). Chạy 20260919090100 trước.';
    END IF;
END $$;

-- ── Sổ địa chỉ ──────────────────────────────────────────────────────────
CREATE TABLE public.buyer_addresses (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id       UUID        NOT NULL REFERENCES public.buyer_profiles(id) ON DELETE CASCADE,
    label          TEXT        NOT NULL DEFAULT '' CHECK (char_length(label) <= 50),  -- "Kho Hà Nội"
    recipient_name TEXT        NOT NULL CHECK (char_length(btrim(recipient_name)) BETWEEN 2 AND 100),
    phone          TEXT        NOT NULL CHECK (phone ~ '^[0-9+ .()-]{8,20}$'),
    address_line   TEXT        NOT NULL CHECK (char_length(btrim(address_line)) BETWEEN 5 AND 300),
    ward           TEXT        NOT NULL DEFAULT '' CHECK (char_length(ward) <= 100),
    district       TEXT        NOT NULL DEFAULT '' CHECK (char_length(district) <= 100),
    province       TEXT        NOT NULL CHECK (char_length(btrim(province)) BETWEEN 2 AND 100),
    is_default     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_buyer_addresses_buyer ON public.buyer_addresses (buyer_id, created_at DESC);
CREATE UNIQUE INDEX uq_buyer_addresses_default ON public.buyer_addresses (buyer_id) WHERE is_default;

ALTER TABLE public.buyer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_addresses FORCE ROW LEVEL SECURITY;

CREATE POLICY buyer_addresses_select ON public.buyer_addresses
    FOR SELECT USING (
        buyer_id IN (SELECT id FROM public.buyer_profiles WHERE user_id = auth.uid())
        OR public.is_admin()
    );
CREATE POLICY buyer_addresses_insert_own ON public.buyer_addresses
    FOR INSERT WITH CHECK (
        buyer_id IN (SELECT id FROM public.buyer_profiles WHERE user_id = auth.uid())
    );
CREATE POLICY buyer_addresses_update_own ON public.buyer_addresses
    FOR UPDATE USING (
        buyer_id IN (SELECT id FROM public.buyer_profiles WHERE user_id = auth.uid())
    ) WITH CHECK (
        buyer_id IN (SELECT id FROM public.buyer_profiles WHERE user_id = auth.uid())
    );
CREATE POLICY buyer_addresses_delete_own ON public.buyer_addresses
    FOR DELETE USING (
        buyer_id IN (SELECT id FROM public.buyer_profiles WHERE user_id = auth.uid())
    );

-- Tài khoản bị khoá không ghi (cùng khuôn 1.7).
CREATE POLICY buyer_addresses_active_user_insert ON public.buyer_addresses
    AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_active_user());
CREATE POLICY buyer_addresses_active_user_update ON public.buyer_addresses
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY buyer_addresses_active_user_delete ON public.buyer_addresses
    AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_active_user());

-- Giữ "đúng 1 địa chỉ mặc định". SECURITY DEFINER để việc bỏ/đặt mặc định
-- ở các dòng khác của cùng buyer không phụ thuộc quy tắc RLS của người gọi.
CREATE FUNCTION public.buyer_addresses_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Lần ghi do chính trigger này (hoặc trigger sau khi xoá) gây ra: để nguyên.
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF (SELECT count(*) FROM buyer_addresses WHERE buyer_id = NEW.buyer_id) >= 20 THEN
            RAISE EXCEPTION 'ADDRESS_LIMIT_REACHED'
                USING DETAIL = 'Mỗi tài khoản lưu tối đa 20 địa chỉ.';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM buyer_addresses WHERE buyer_id = NEW.buyer_id) THEN
            NEW.is_default := TRUE;
        END IF;
    ELSE
        NEW.buyer_id   := OLD.buyer_id;
        NEW.created_at := OLD.created_at;
        NEW.updated_at := NOW();
        IF OLD.is_default THEN
            NEW.is_default := TRUE;  -- muốn đổi mặc định thì đặt địa chỉ khác làm mặc định
        END IF;
    END IF;

    IF NEW.is_default AND (TG_OP = 'INSERT' OR NOT OLD.is_default) THEN
        UPDATE buyer_addresses SET is_default = FALSE
        WHERE buyer_id = NEW.buyer_id AND id <> NEW.id AND is_default;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_buyer_addresses_before_write
    BEFORE INSERT OR UPDATE ON public.buyer_addresses
    FOR EACH ROW EXECUTE FUNCTION public.buyer_addresses_before_write();

CREATE FUNCTION public.buyer_addresses_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.is_default THEN
        UPDATE buyer_addresses SET is_default = TRUE
        WHERE id = (SELECT id FROM buyer_addresses
                    WHERE buyer_id = OLD.buyer_id
                    ORDER BY created_at DESC, id LIMIT 1);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_buyer_addresses_after_delete
    AFTER DELETE ON public.buyer_addresses
    FOR EACH ROW EXECUTE FUNCTION public.buyer_addresses_after_delete();

REVOKE ALL ON FUNCTION public.buyer_addresses_before_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buyer_addresses_after_delete() FROM PUBLIC, anon, authenticated;

-- ── accept_quote: thêm địa chỉ giao hàng ───────────────────────────────
-- Bỏ bản 1 tham số để PostgREST không thấy 2 hàm trùng tên.
DROP FUNCTION public.accept_quote(UUID);

CREATE FUNCTION public.accept_quote(p_quote_id UUID, p_address_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id         UUID;
    v_quote            rfq_quotes%ROWTYPE;
    v_rfq              rfq_requests%ROWTYPE;
    v_addr             buyer_addresses%ROWTYPE;
    v_order_id         UUID;
    v_supplier_user_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    -- Trước đây chỉ trigger trên orders chặn (1.7); kiểm tra sớm để tài khoản
    -- bị khoá nhận đúng ACCOUNT_SUSPENDED thay vì ADDRESS_REQUIRED.
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
    END IF;

    SELECT id INTO v_buyer_id FROM buyer_profiles WHERE user_id = auth.uid();
    IF v_buyer_id IS NULL THEN
        RAISE EXCEPTION 'NOT_A_BUYER';
    END IF;

    SELECT * INTO v_quote FROM rfq_quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND';
    END IF;

    -- Khóa dòng RFQ trước khi kiểm tra status (2 lần bấm gần nhau không
    -- cùng thắng — xem 20260919090100).
    SELECT * INTO v_rfq FROM rfq_requests WHERE id = v_quote.rfq_id FOR UPDATE;
    IF NOT FOUND OR v_rfq.buyer_id <> v_buyer_id THEN
        RAISE EXCEPTION 'NOT_YOUR_RFQ';
    END IF;

    IF v_rfq.status IN ('awarded', 'closed', 'expired', 'cancelled') THEN
        RAISE EXCEPTION 'RFQ_ALREADY_SETTLED';
    END IF;

    IF v_quote.status NOT IN ('pending', 'counter_offered') THEN
        RAISE EXCEPTION 'QUOTE_NOT_ACCEPTABLE';
    END IF;

    IF p_address_id IS NOT NULL THEN
        SELECT * INTO v_addr FROM buyer_addresses
        WHERE id = p_address_id AND buyer_id = v_buyer_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'ADDRESS_NOT_FOUND';
        END IF;
    ELSE
        SELECT * INTO v_addr FROM buyer_addresses
        WHERE buyer_id = v_buyer_id AND is_default;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'ADDRESS_REQUIRED';
        END IF;
    END IF;

    UPDATE rfq_quotes
    SET status = 'accepted', updated_at = NOW()
    WHERE id = p_quote_id;

    -- Đóng mọi báo giá đang hoạt động khác của RFQ này.
    UPDATE rfq_quotes
    SET status = 'rejected', updated_at = NOW()
    WHERE rfq_id = v_rfq.id
      AND id <> p_quote_id
      AND status IN ('pending', 'counter_offered');

    UPDATE rfq_requests SET status = 'awarded' WHERE id = v_rfq.id;

    INSERT INTO orders (rfq_quote_id, buyer_id, supplier_id, quantity, unit_price, shipping_address)
    VALUES (
        p_quote_id, v_buyer_id, v_quote.supplier_id, v_rfq.quantity, v_quote.unit_price,
        btrim(v_addr.recipient_name) || ' — ' || btrim(v_addr.phone) || E'\n'
            || concat_ws(', ', btrim(v_addr.address_line), NULLIF(btrim(v_addr.ward), ''),
                         NULLIF(btrim(v_addr.district), ''), btrim(v_addr.province))
    )
    RETURNING id INTO v_order_id;

    SELECT user_id INTO v_supplier_user_id FROM supplier_profiles WHERE id = v_quote.supplier_id;

    INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
    VALUES (
        v_supplier_user_id, 'quote_accepted',
        'Báo giá của bạn đã được chấp nhận: ' || v_rfq.title,
        'Đơn hàng mới đã được tạo — chuẩn bị sản xuất và liên hệ buyer để thống nhất thanh toán.',
        jsonb_build_object('order_id', v_order_id, 'rfq_id', v_rfq.id),
        'in_app', 'sent', NOW()
    );

    INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
    SELECT sp.user_id, 'quote_rejected',
           'RFQ đã được chốt cho xưởng khác: ' || v_rfq.title,
           'Rất tiếc, buyer đã chọn báo giá khác cho yêu cầu này.',
           jsonb_build_object('rfq_id', v_rfq.id),
           'in_app', 'sent', NOW()
    FROM rfq_quotes q
    JOIN supplier_profiles sp ON sp.id = q.supplier_id
    WHERE q.rfq_id = v_rfq.id AND q.id <> p_quote_id AND q.status = 'rejected';

    RETURN jsonb_build_object('order_id', v_order_id, 'rfq_id', v_rfq.id);
END;
$$;

COMMENT ON FUNCTION public.accept_quote(UUID, UUID) IS
    'Gọi qua Edge Function accept-quote. Atomic: accept 1 quote + reject các
     quote còn lại + tạo orders (chép địa chỉ giao hàng từ buyer_addresses) +
     chuyển rfq_requests.status = awarded, trong đúng 1 transaction.';

REVOKE ALL ON FUNCTION public.accept_quote(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_quote(UUID, UUID) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — buyer_addresses + accept_quote(quote, address)';
END $$;

COMMIT;
