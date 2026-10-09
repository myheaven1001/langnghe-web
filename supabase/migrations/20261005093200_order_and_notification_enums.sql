-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 5.1: giá trị enum cho giỏ hàng và phần dùng chung của bước 5.
--
--   order_status.pending_confirmation   Đơn đặt thẳng từ giỏ hàng đang chờ
--       xưởng nhận (quyết định: xưởng xác nhận trước khi buyer chuyển tiền).
--   notification_type: order_placed (xưởng có đơn mới), order_declined (xưởng
--       từ chối đơn), quote_countered (trả giá), dispute_reply (trả lời tranh chấp).
--
-- Tách riêng một file, KHÔNG bọc BEGIN/COMMIT: Postgres không cho dùng giá
-- trị enum mới trong cùng transaction đã thêm nó (các migration sau dùng).
-- Không có rollback: Postgres không xoá được giá trị enum; giá trị thừa vô hại.
-- ============================================================

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'pending_confirmation' BEFORE 'pending_payment';

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_placed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_declined';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'quote_countered';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dispute_reply';
