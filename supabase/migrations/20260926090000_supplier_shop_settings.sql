-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Cột mới cho supplier_profiles — /supplier/settings/shop (4.8).
--
-- Không bảng schema nào có sẵn (schema_v1_mvp.sql, các migration đã port,
-- kể cả schema_v6_target.sql — bản target xa nhất) mô hình hoá nội dung
-- trang cài đặt gian hàng (logo/banner, liên hệ công khai, đơn vị vận
-- chuyển ưu tiên, các công tắc hiển thị) — khác hẳn product_variants/
-- order_events/rfq_targets (chỉ "port sớm" 1 bảng đã có sẵn ở future
-- schema). Phần này là thiết kế cột MỚI, xác nhận với người dùng trước khi
-- thêm (xem câu hỏi trong hội thoại build 4.8).
--
-- logo_url/banner_url: lưu Supabase Storage public URL, dùng LẠI bucket
-- product-media (đã public, đã có RLS insert/delete theo
-- {supplier_id}/...) — path con "shop/" thay vì "{product_id}/", policy
-- hiện tại chỉ kiểm tra segment đầu ((storage.foldername(name))[1] =
-- supplier_id) nên không cần sửa policy bucket.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'supplier_profiles' AND column_name = 'logo_url'
    ) THEN
        RAISE EXCEPTION 'supplier_profiles đã có cột logo_url. Migration này đã chạy rồi.';
    END IF;
END $$;

ALTER TABLE supplier_profiles
    ADD COLUMN logo_url               VARCHAR(500),
    ADD COLUMN banner_url             VARCHAR(500),
    ADD COLUMN contact_phone          VARCHAR(20),
    ADD COLUMN contact_zalo           VARCHAR(20),
    ADD COLUMN working_hours          VARCHAR(255),
    ADD COLUMN website_url            VARCHAR(255),
    ADD COLUMN show_phone_public      BOOLEAN     NOT NULL DEFAULT TRUE,
    ADD COLUMN show_address_public    BOOLEAN     NOT NULL DEFAULT TRUE,
    ADD COLUMN allow_direct_message   BOOLEAN     NOT NULL DEFAULT TRUE,
    ADD COLUMN is_hidden              BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN preferred_carriers     TEXT[]      NOT NULL DEFAULT '{}',
    ADD COLUMN default_processing_days INT;

COMMENT ON COLUMN supplier_profiles.logo_url IS 'Supabase Storage public URL, bucket product-media, path {supplier_id}/shop/...';
COMMENT ON COLUMN supplier_profiles.banner_url IS 'Supabase Storage public URL, bucket product-media, path {supplier_id}/shop/...';
COMMENT ON COLUMN supplier_profiles.is_hidden IS 'TRUE = ẩn toàn bộ gian hàng khỏi tìm kiếm/RFQ mới (vd. nghỉ Tết) — app phải lọc is_hidden ở mọi nơi hiển thị supplier công khai.';

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — 12 cột mới trên supplier_profiles (cài đặt gian hàng)';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (chạy thủ công nếu cần)
-- ============================================================
-- BEGIN;
-- ALTER TABLE supplier_profiles
--     DROP COLUMN IF EXISTS default_processing_days,
--     DROP COLUMN IF EXISTS preferred_carriers,
--     DROP COLUMN IF EXISTS is_hidden,
--     DROP COLUMN IF EXISTS allow_direct_message,
--     DROP COLUMN IF EXISTS show_address_public,
--     DROP COLUMN IF EXISTS show_phone_public,
--     DROP COLUMN IF EXISTS website_url,
--     DROP COLUMN IF EXISTS working_hours,
--     DROP COLUMN IF EXISTS contact_zalo,
--     DROP COLUMN IF EXISTS contact_phone,
--     DROP COLUMN IF EXISTS banner_url,
--     DROP COLUMN IF EXISTS logo_url;
-- COMMIT;
