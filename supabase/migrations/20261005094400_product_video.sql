-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Bước 6 (Công cụ nhà bán): mỗi sản phẩm kèm được 1 video ngắn.
--
--   products.video_path   Đường dẫn file trong bucket `product-videos`, dạng
--       <id xưởng>/<id sản phẩm>/<tên file>.mp4|webm — ràng buộc CHECK ép đúng
--       thư mục của chính sản phẩm, nên xưởng không trỏ được sang file của
--       xưởng khác hay một địa chỉ bên ngoài. Web tự ghép URL công khai từ
--       đường dẫn này; database không lưu URL.
--   Bucket `product-videos`   Công khai (như ảnh sản phẩm), tối đa 50MB / file,
--       chỉ mp4 và webm. Xưởng chỉ tải lên / xoá trong thư mục của mình.
--   Không dùng bảng product_media cho video: mọi nơi đang đọc bảng đó đều coi
--       dòng là ảnh.
--
-- Xưởng tự UPDATE cột video_path của sản phẩm mình (RLS sẵn có); sản phẩm bị
-- sàn khoá vẫn không sửa được (trigger guard_blocked_product).
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'video_path') THEN
        RAISE EXCEPTION 'products.video_path đã tồn tại. Migration này đã chạy rồi.';
    END IF;
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'product-videos') THEN
        RAISE EXCEPTION 'Bucket product-videos đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

ALTER TABLE public.products
    ADD COLUMN video_path TEXT,
    ADD CONSTRAINT chk_products_video_path CHECK (
        video_path IS NULL
        OR video_path ~ ('^' || supplier_id::TEXT || '/' || id::TEXT || '/[A-Za-z0-9._-]{1,120}\.(mp4|webm)$')
    );

COMMENT ON COLUMN public.products.video_path IS
    'File video của sản phẩm trong bucket product-videos (<supplier_id>/<product_id>/<file>). NULL = không có video.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-videos', 'product-videos', TRUE, 52428800, ARRAY['video/mp4', 'video/webm']);

-- Như bucket product-media: chỉ xưởng sở hữu thư mục <supplier_id>/… được tải
-- lên / xoá. Bucket công khai nên không cần policy SELECT.
CREATE POLICY product_videos_bucket_insert_own
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'product-videos'
    AND EXISTS (
        SELECT 1 FROM public.supplier_profiles sp
        WHERE sp.id::TEXT = (storage.foldername(name))[1]
          AND sp.user_id = auth.uid()
    )
);

CREATE POLICY product_videos_bucket_delete_own
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'product-videos'
    AND EXISTS (
        SELECT 1 FROM public.supplier_profiles sp
        WHERE sp.id::TEXT = (storage.foldername(name))[1]
          AND sp.user_id = auth.uid()
    )
);

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — products.video_path + bucket product-videos';
END $$;

COMMIT;
