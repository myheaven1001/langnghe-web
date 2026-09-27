-- Quay lui 20261005090200_drop_orders_buyer_insert.sql (xem README.md).
-- Tạo lại đúng policy cũ của 20260905121000 (mở lại lỗ hổng 1.2 — chỉ dùng
-- khi việc bỏ policy làm hỏng một luồng thật chưa biết).
BEGIN;

CREATE POLICY orders_buyer_insert ON public.orders
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM buyer_profiles bp
            WHERE bp.id = buyer_id
              AND bp.user_id = auth.uid()
        )
        OR public.is_admin()
    );

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005090200';

COMMIT;
