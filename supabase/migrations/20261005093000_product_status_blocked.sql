-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 4.11 (phần 1/2): thêm trạng thái sản phẩm 'blocked' (sàn khoá).
--
-- Tách riêng một file, KHÔNG bọc BEGIN/COMMIT: Postgres không cho dùng giá
-- trị enum mới trong cùng transaction đã thêm nó (file kế tiếp dùng).
-- Không có rollback: Postgres không xoá được giá trị enum; giá trị thừa vô hại.
-- ============================================================

ALTER TYPE product_status ADD VALUE IF NOT EXISTS 'blocked';
