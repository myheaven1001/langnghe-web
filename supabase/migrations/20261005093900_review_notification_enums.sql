-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Bước 6 (Uy tín): giá trị enum thông báo cho đánh giá.
--
--   notification_type: review_received (xưởng nhận đánh giá mới),
--       review_replied (xưởng trả lời đánh giá của buyer).
--
-- Tách riêng một file, KHÔNG bọc BEGIN/COMMIT: Postgres không cho dùng giá
-- trị enum mới trong cùng transaction đã thêm nó (migration sau dùng).
-- Không có rollback: Postgres không xoá được giá trị enum; giá trị thừa vô hại.
-- ============================================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'review_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'review_replied';
