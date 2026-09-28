-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- SỬA LỖI: không lưu được bậc giá "không giới hạn" (max_qty trống).
--
-- price_tiers (20260905120200) chống trùng khoảng số lượng bằng
--     EXCLUDE USING gist (product_id WITH =,
--         int4range(min_qty, COALESCE(max_qty, 2147483647), '[]') WITH &&)
-- Khoảng '[]' được Postgres chuẩn hoá về '[min, max + 1)'; với max =
-- 2147483647 (số int lớn nhất) phép + 1 tràn số:
--     ERROR 22003: integer out of range
-- → mọi bậc giá để trống ô "Đến" (ví dụ "từ 500 trở lên") đều lỗi, nên
-- xưởng không lưu được sản phẩm có bậc giá cuối mở. Phát hiện khi chạy
-- scripts/seed-staging.mjs.
--
-- Sửa: int4range(min_qty, max_qty, '[]') — max_qty NULL tự thành khoảng
-- không có cận trên, không cần số thay thế. Ý nghĩa ràng buộc giữ nguyên:
-- hai bậc giá của cùng sản phẩm không được chồng khoảng số lượng.
-- ============================================================

BEGIN;

DO $$
DECLARE
    v_name TEXT;
BEGIN
    SELECT conname INTO v_name
    FROM pg_constraint
    WHERE conrelid = 'public.price_tiers'::regclass AND contype = 'x';

    IF v_name IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy ràng buộc EXCLUDE trên price_tiers.';
    END IF;
    IF v_name = 'price_tiers_no_overlap' THEN
        RAISE EXCEPTION 'price_tiers_no_overlap đã tồn tại. Migration này đã chạy rồi.';
    END IF;

    EXECUTE format('ALTER TABLE public.price_tiers DROP CONSTRAINT %I', v_name);
END $$;

ALTER TABLE public.price_tiers
    ADD CONSTRAINT price_tiers_no_overlap EXCLUDE USING gist (
        product_id WITH =,
        int4range(min_qty, max_qty, '[]') WITH &&
    );

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — price_tiers_no_overlap: bậc giá max_qty trống không còn tràn số';
END $$;

COMMIT;
