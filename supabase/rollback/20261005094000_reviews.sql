-- Quay lui 20261005094000_reviews.sql (xem README.md).
-- XOÁ toàn bộ đánh giá; rating_avg của mọi xưởng về 0. Xưởng lại tự sửa được
-- rating_avg / total_orders qua API như trước (lỗ hổng cũ). Quay lui web về
-- bản trước TRƯỚC khi chạy file này.
BEGIN;

DROP TRIGGER IF EXISTS trg_guard_supplier_rating_columns ON public.supplier_profiles;
DROP FUNCTION IF EXISTS public.guard_supplier_rating_columns();

DROP FUNCTION IF EXISTS public.supplier_review_summary(UUID);
DROP FUNCTION IF EXISTS public.supplier_reviews(UUID, INT, INT);
DROP FUNCTION IF EXISTS public.mask_name(TEXT);
DROP FUNCTION IF EXISTS public.admin_moderate_review(UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.reply_review(UUID, TEXT);
DROP FUNCTION IF EXISTS public.submit_review(UUID, INT, TEXT);

DROP TABLE IF EXISTS public.reviews;
DROP FUNCTION IF EXISTS public.sync_supplier_rating();

UPDATE public.supplier_profiles SET rating_avg = 0 WHERE rating_avg IS DISTINCT FROM 0;
ALTER TABLE public.supplier_profiles DROP COLUMN IF EXISTS rating_count;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005094000';

COMMIT;
