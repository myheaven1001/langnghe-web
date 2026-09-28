-- Test 20261005090500: bậc giá không giới hạn (max_qty trống) lưu được, bậc
-- giá chồng khoảng vẫn bị chặn.
-- Chạy trên STAGING (SQL Editor hoặc psql). Cả file ROLLBACK ở cuối.
-- Đạt: kết quả cuối là "price_tiers: TẤT CẢ ĐẠT (4 ca)".

BEGIN;

DO $$
DECLARE
    v_supplier UUID;
    v_product  UUID;
BEGIN
    SELECT id INTO v_supplier FROM supplier_profiles LIMIT 1;
    IF v_supplier IS NULL THEN
        RAISE EXCEPTION 'Chưa có xưởng nào — chạy npm run seed:staging trước.';
    END IF;
    INSERT INTO products (supplier_id, name, status) VALUES (v_supplier, 'Sản phẩm test bậc giá', 'draft')
    RETURNING id INTO v_product;

    INSERT INTO price_tiers (product_id, min_qty, max_qty, unit_price) VALUES (v_product, 50, 199, 120000);
    INSERT INTO price_tiers (product_id, min_qty, max_qty, unit_price) VALUES (v_product, 200, 499, 105000);
    RAISE NOTICE 'PASS  bậc giá có giới hạn';

    BEGIN
        INSERT INTO price_tiers (product_id, min_qty, max_qty, unit_price) VALUES (v_product, 500, NULL, 95000);
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'FAIL  bậc giá "từ 500 trở lên" (max_qty trống) không lưu được: %', SQLERRM;
    END;
    RAISE NOTICE 'PASS  bậc giá không giới hạn lưu được';

    BEGIN
        INSERT INTO price_tiers (product_id, min_qty, max_qty, unit_price) VALUES (v_product, 450, 520, 1);
        RAISE EXCEPTION 'FAIL  bậc 450–520 chồng lên 200–499 và 500+ nhưng không bị chặn';
    EXCEPTION WHEN exclusion_violation THEN
        RAISE NOTICE 'PASS  bậc giá chồng khoảng có giới hạn bị chặn';
    END;

    BEGIN
        INSERT INTO price_tiers (product_id, min_qty, max_qty, unit_price) VALUES (v_product, 1000, NULL, 1);
        RAISE EXCEPTION 'FAIL  bậc 1000+ chồng lên 500+ nhưng không bị chặn';
    EXCEPTION WHEN exclusion_violation THEN
        RAISE NOTICE 'PASS  hai bậc không giới hạn chồng nhau bị chặn';
    END;
END $$;

ROLLBACK;

SELECT 'price_tiers: TẤT CẢ ĐẠT (4 ca)' AS ket_qua;
