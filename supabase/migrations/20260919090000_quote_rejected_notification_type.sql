-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Thêm 'quote_rejected' vào notification_type — cần cho accept_quote()
-- (migration kế tiếp, 20260919090100) để báo cho các xưởng bị từ chối tự
-- động khi buyer chốt xưởng khác. Không có nhãn nào trong 12 giá trị gốc
-- của notification_type (20260905120000_extensions_and_enums.sql) phù hợp
-- cho trường hợp này.
--
-- Tách thành migration RIÊNG, KHÔNG bọc BEGIN/COMMIT — Postgres không cho
-- dùng giá trị enum mới thêm bên trong cùng transaction đã ADD VALUE nó.
-- Chạy statement này một mình thì nó tự commit ngay (autocommit), nên
-- migration kế tiếp dùng được giá trị này ngay.
-- ============================================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'quote_rejected';
