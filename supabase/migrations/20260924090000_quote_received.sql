-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Trigger khi supplier gửi báo giá mới (INSERT rfq_quotes, xem
-- /supplier/rfq — 4.4): 2 việc mà trước giờ chưa có gì làm cả vì
-- rfq_quotes trước đây chỉ được ghi qua create_rfq()'s notifications cho
-- CHIỀU NGƯỢC LẠI (buyer → supplier khi gửi RFQ), chưa có gì cho chiều
-- supplier → buyer khi trả lời báo giá:
--
--   1. rfq_requests.status: 'published' → 'quoted' khi có báo giá ĐẦU TIÊN.
--      Không có việc này thì /rfq (3.3, tab "Đã có báo giá") và trạng thái
--      hiển thị trên /rfq/[id] (3.4) không bao giờ đúng với báo giá thật —
--      RFQ cứ nằm 'published' mãi dù đã có supplier trả lời.
--   2. Notification 'quote_received' cho buyer — loại notification này đã
--      khai báo sẵn trong enum (20260905120000) nhưng chưa từng được dùng.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_quote_received') THEN
        RAISE EXCEPTION 'log_quote_received() đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.log_quote_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rfq_title      TEXT;
    v_rfq_status     rfq_status;
    v_buyer_user_id  UUID;
BEGIN
    SELECT r.title, r.status, bp.user_id
      INTO v_rfq_title, v_rfq_status, v_buyer_user_id
    FROM rfq_requests r
    JOIN buyer_profiles bp ON bp.id = r.buyer_id
    WHERE r.id = NEW.rfq_id;

    IF v_rfq_status = 'published' THEN
        UPDATE rfq_requests SET status = 'quoted' WHERE id = NEW.rfq_id;
    END IF;

    IF v_buyer_user_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, title, body, payload, channel, status, sent_at)
        VALUES (
            v_buyer_user_id, 'quote_received',
            'Có báo giá mới: ' || v_rfq_title,
            'Một xưởng vừa gửi báo giá cho yêu cầu của bạn.',
            jsonb_build_object('rfq_id', NEW.rfq_id, 'quote_id', NEW.id),
            'in_app', 'sent', NOW()
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_quote_received
    AFTER INSERT ON rfq_quotes
    FOR EACH ROW EXECUTE FUNCTION public.log_quote_received();

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — trg_log_quote_received (rfq_requests.status published->quoted + notification)';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_log_quote_received ON rfq_quotes;
-- DROP FUNCTION IF EXISTS public.log_quote_received();
-- COMMIT;
