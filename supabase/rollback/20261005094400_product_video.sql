-- Quay lui 20261005094400_product_video.sql (xem README.md).
-- Sản phẩm mất liên kết tới video. File video và bucket `product-videos` KHÔNG
-- xoá được bằng SQL (Supabase chặn xoá thẳng bảng storage): xoá trong
-- Dashboard → Storage nếu cần. Quay lui web về bản trước TRƯỚC khi chạy.
BEGIN;

DROP POLICY IF EXISTS product_videos_bucket_delete_own ON storage.objects;
DROP POLICY IF EXISTS product_videos_bucket_insert_own ON storage.objects;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_video_path;
ALTER TABLE public.products DROP COLUMN IF EXISTS video_path;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005094400';

COMMIT;
