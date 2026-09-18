-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Thêm 'dispute_opened' + 'dispute_resolved' vào notification_type — cần
-- cho trigger trg_handle_dispute_change (migration kế tiếp, 20260930090200)
-- để báo cho buyer + supplier khi admin ghi nhận/giải quyết tranh chấp ở
-- /admin/orders (Giai đoạn 6.3). Không có nhãn nào trong notification_type
-- gốc phù hợp cho trường hợp này.
--
-- Tách thành migration RIÊNG, KHÔNG bọc BEGIN/COMMIT — cùng lý do đã ghi ở
-- 20260919090000_quote_rejected_notification_type.sql: Postgres không cho
-- dùng giá trị enum mới thêm bên trong cùng transaction đã ADD VALUE nó.
-- ============================================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dispute_opened';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dispute_resolved';
