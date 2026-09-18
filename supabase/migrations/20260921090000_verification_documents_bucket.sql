-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Storage bucket cho hồ sơ xác minh (GPKD/CCCD) — /settings/profile (3.7).
--
-- PRIVATE bucket (không phải public) — GPKD/CCCD là giấy tờ nhạy cảm (mã số
-- thuế, thông tin định danh), app phải dùng signed URL để xem, không phát
-- URL public trực tiếp.
--
-- Path convention: {entity_type}/{entity_id}/{filename}
--   vd: buyer/<buyer_profiles.id>/1699999999-gpkd.pdf
-- Dùng chung cho cả buyer (giờ) và supplier (Giai đoạn 4 —
-- supplier_profile_verification_page.html — sẽ tái dùng đúng bucket + policy
-- này, không cần bucket/migration riêng khi tới lúc xây).
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'verification-documents') THEN
        RAISE EXCEPTION 'Bucket verification-documents đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'verification-documents',
    'verification-documents',
    FALSE,
    10485760, -- 10MB, khớp hint "Tối đa 10MB" ở buyer_profile_verification_page.html
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
);

-- SELECT: chủ sở hữu (buyer/supplier tương ứng qua path) + admin.
CREATE POLICY verification_documents_select_own
ON storage.objects FOR SELECT
USING (
    bucket_id = 'verification-documents'
    AND (
        (
            (storage.foldername(name))[1] = 'buyer'
            AND EXISTS (
                SELECT 1 FROM buyer_profiles bp
                WHERE bp.id::text = (storage.foldername(name))[2]
                  AND bp.user_id = auth.uid()
            )
        )
        OR (
            (storage.foldername(name))[1] = 'supplier'
            AND EXISTS (
                SELECT 1 FROM supplier_profiles sp
                WHERE sp.id::text = (storage.foldername(name))[2]
                  AND sp.user_id = auth.uid()
            )
        )
        OR public.is_admin()
    )
);

-- INSERT: chỉ chủ sở hữu được tự upload vào đúng thư mục của mình + admin.
CREATE POLICY verification_documents_insert_own
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'verification-documents'
    AND (
        (
            (storage.foldername(name))[1] = 'buyer'
            AND EXISTS (
                SELECT 1 FROM buyer_profiles bp
                WHERE bp.id::text = (storage.foldername(name))[2]
                  AND bp.user_id = auth.uid()
            )
        )
        OR (
            (storage.foldername(name))[1] = 'supplier'
            AND EXISTS (
                SELECT 1 FROM supplier_profiles sp
                WHERE sp.id::text = (storage.foldername(name))[2]
                  AND sp.user_id = auth.uid()
            )
        )
        OR public.is_admin()
    )
);

-- Không có policy UPDATE/DELETE cho 'authenticated' có chủ đích — giấy tờ
-- đã tải lên là bất biến (đúng ghi chú "không thể chỉnh sửa trực tiếp" của
-- prototype); nộp lại = upload file MỚI + insert dòng verifications MỚI
-- (attempt_number kế tiếp), không ghi đè file cũ.

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — storage bucket verification-documents (+ 2 policy)';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS verification_documents_insert_own ON storage.objects;
-- DROP POLICY IF EXISTS verification_documents_select_own ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'verification-documents';
-- COMMIT;
