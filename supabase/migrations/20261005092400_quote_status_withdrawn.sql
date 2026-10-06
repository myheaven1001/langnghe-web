-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 4.6 (phần 1/2): thêm trạng thái báo giá 'withdrawn' (xưởng rút).
--
-- Tách riêng một file, KHÔNG bọc BEGIN/COMMIT: Postgres không cho dùng giá
-- trị enum mới trong cùng transaction đã thêm nó, mà file kế tiếp
-- (20261005092500) dùng 'withdrawn' trong index và quy tắc RLS.
-- Không có rollback: Postgres không xoá được giá trị enum; giá trị thừa vô hại.
-- ============================================================

ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'withdrawn';
