-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- FIX BẢO MẬT (kế hoạch 1.2): bỏ quy tắc orders_buyer_insert.
--
-- Lỗ hổng: orders_buyer_insert (20260905121000) cho buyer INSERT thẳng vào
-- orders miễn buyer_id là của mình. Mọi cột khác do buyer tự điền:
--     supabase.from('orders').insert({ buyer_id: myId, supplier_id: bất kỳ,
--       rfq_quote_id: bất kỳ, quantity: 1000, unit_price: 1, status: 'confirmed' })
-- → đơn "đã xác nhận thanh toán" với giá tự đặt, gắn vào báo giá của RFQ
-- khác, xưởng nhận thông báo và có thể sản xuất theo đơn giả.
--
-- Đơn hàng thật chỉ sinh ra ở accept_quote() (20260919090100) — hàm
-- SECURITY DEFINER, tự lấy giá/số lượng từ báo giá và RFQ đã kiểm tra, nên
-- không cần quy tắc INSERT nào cho role authenticated. Trong src/ không có
-- chỗ nào gọi .from('orders').insert(...).
-- Sau migration: không role authenticated nào (kể cả admin) INSERT thẳng
-- vào orders; service_role và hàm SECURITY DEFINER vẫn được.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'accept_quote') THEN
        RAISE EXCEPTION 'Không tìm thấy accept_quote(). Chạy 20260919090100 trước — nếu không, buyer sẽ không còn cách nào tạo đơn.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = 'orders'
                     AND policyname = 'orders_buyer_insert') THEN
        RAISE EXCEPTION 'Không có policy orders_buyer_insert. Migration này đã chạy rồi?';
    END IF;
END $$;

DROP POLICY orders_buyer_insert ON public.orders;

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — bỏ orders_buyer_insert; đơn hàng chỉ tạo qua accept_quote()';
END $$;

COMMIT;
