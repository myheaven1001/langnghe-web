-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Storage bucket cho ảnh sản phẩm — /supplier/products/new,
-- /supplier/products/[id]/edit (4.3).
--
-- PUBLIC bucket (khác verification-documents ở 3.7, vốn private) — ảnh sản
-- phẩm vốn dĩ công khai cho buyer xem trên trang sản phẩm/tìm kiếm, không
-- cần signed URL.
--
-- product_media.r2_key (20260905120200_products_and_catalog.sql) được đặt
-- tên theo kế hoạch dùng Cloudflare R2 (xem comment gốc trong migration đó)
-- — nhưng R2/Cloudflare Images chưa được nối vào project này. Việc thực tế
-- (giống 3.7 dùng Supabase Storage cho GPKD thay vì R2) là lưu path Supabase
-- Storage vào chính cột r2_key này — tên cột không đổi để không phải sửa
-- schema, chỉ đổi nơi "key" đó trỏ tới.
--
-- Path convention: {supplier_id}/{product_id}/{filename}
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'product-media') THEN
        RAISE EXCEPTION 'Bucket product-media đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-media',
    'product-media',
    TRUE,
    10485760, -- 10MB, khớp hint "tối đa 10MB/file" ở supplier_product_form_page.html
    ARRAY['image/jpeg', 'image/png', 'image/webp']
);

-- INSERT/DELETE: chỉ supplier sở hữu thư mục {supplier_id}/... (theo path)
-- + admin. SELECT không cần policy riêng — bucket public nên Storage API
-- phục vụ file trực tiếp qua public URL, không qua RLS.
CREATE POLICY product_media_bucket_insert_own
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'product-media'
    AND EXISTS (
        SELECT 1 FROM supplier_profiles sp
        WHERE sp.id::text = (storage.foldername(name))[1]
          AND sp.user_id = auth.uid()
    )
);

CREATE POLICY product_media_bucket_delete_own
ON storage.objects FOR DELETE
USING (
    bucket_id = 'product-media'
    AND EXISTS (
        SELECT 1 FROM supplier_profiles sp
        WHERE sp.id::text = (storage.foldername(name))[1]
          AND sp.user_id = auth.uid()
    )
);

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — storage bucket product-media (+ 2 policy)';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS product_media_bucket_delete_own ON storage.objects;
-- DROP POLICY IF EXISTS product_media_bucket_insert_own ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'product-media';
-- COMMIT;
