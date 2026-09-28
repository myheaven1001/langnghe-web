-- Quay lui 20261005090500_fix_price_tier_open_range.sql (xem README.md).
-- Đưa lại ràng buộc cũ (có lỗi tràn số với max_qty trống). Sẽ LỖI nếu đã có
-- bậc giá max_qty trống được lưu sau migration — khi đó giữ bản sửa.
BEGIN;

ALTER TABLE public.price_tiers DROP CONSTRAINT IF EXISTS price_tiers_no_overlap;
ALTER TABLE public.price_tiers
    ADD EXCLUDE USING gist (
        product_id WITH =,
        int4range(min_qty, COALESCE(max_qty, 2147483647), '[]') WITH &&
    );

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005090500';

COMMIT;
