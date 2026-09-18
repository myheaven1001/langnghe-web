-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- accept_quote() — chốt 1 báo giá cho RFQ: cập nhật rfq_quotes.status,
-- tự động đóng các báo giá còn lại, tạo orders, chuyển rfq_requests.status.
--
-- Cùng pattern atomic với create_rfq() (20260918090000): toàn bộ chạy
-- trong 1 function SECURITY DEFINER = 1 transaction Postgres ngầm định.
-- FOR UPDATE khóa dòng rfq_requests trước khi kiểm tra status, nên 2 quote
-- khác nhau của cùng 1 RFQ không thể "cùng thắng" nếu buyer bấm 2 lần
-- (hoặc 2 tab) gần như đồng thời — request thứ 2 sẽ thấy status đã là
-- 'awarded' sau khi request đầu commit và bị chặn ở RFQ_ALREADY_SETTLED.
--
-- Gọi qua Edge Function accept-quote (supabase/functions/accept-quote).
-- Không gọi trực tiếp từ client — buyer không có quyền UPDATE rfq_quotes
-- qua RLS (rfq_quotes chỉ cho phép supplier sở hữu CRUD, buyer chỉ SELECT),
-- nên phải qua RPC SECURITY DEFINER này.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
        RAISE EXCEPTION 'Không tìm thấy bảng orders. Migration Sprint 1 chưa chạy.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'accept_quote') THEN
        RAISE EXCEPTION 'accept_quote() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'notification_type' AND e.enumlabel = 'quote_rejected'
    ) THEN
        RAISE EXCEPTION 'notification_type thiếu giá trị quote_rejected. Chạy migration 20260919090000 trước.';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.accept_quote(p_quote_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id         UUID;
    v_quote            rfq_quotes%ROWTYPE;
    v_rfq              rfq_requests%ROWTYPE;
    v_order_id         UUID;
    v_supplier_user_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    SELECT id INTO v_buyer_id FROM buyer_profiles WHERE user_id = auth.uid();
    IF v_buyer_id IS NULL THEN
        RAISE EXCEPTION 'NOT_A_BUYER';
    END IF;

    SELECT * INTO v_quote FROM rfq_quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND';
    END IF;

    -- Khóa dòng RFQ trước khi kiểm tra status — xem giải thích ở đầu file.
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

    INSERT INTO orders (rfq_quote_id, buyer_id, supplier_id, quantity, unit_price)
    VALUES (p_quote_id, v_buyer_id, v_quote.supplier_id, v_rfq.quantity, v_quote.unit_price)
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

COMMENT ON FUNCTION public.accept_quote IS
    'Gọi qua Edge Function accept-quote (supabase/functions/accept-quote).
     Atomic: accept 1 quote + reject các quote còn lại + tạo orders + chuyển
     rfq_requests.status = awarded, trong đúng 1 transaction.';

REVOKE ALL ON FUNCTION public.accept_quote FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_quote TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — accept_quote()';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- DROP FUNCTION IF EXISTS public.accept_quote(UUID);
