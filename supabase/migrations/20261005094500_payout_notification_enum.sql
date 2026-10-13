-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Bước 6 (Tài chính): giá trị enum thông báo cho khoản sàn trả xưởng.
--
--   notification_type: payout_paid (sàn đã chuyển tiền đơn hàng cho xưởng).
--
-- Tách riêng một file, KHÔNG bọc BEGIN/COMMIT: Postgres không cho dùng giá
-- trị enum mới trong cùng transaction đã thêm nó (migration sau dùng).
-- Không có rollback: Postgres không xoá được giá trị enum; giá trị thừa vô hại.
-- ============================================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payout_paid';
