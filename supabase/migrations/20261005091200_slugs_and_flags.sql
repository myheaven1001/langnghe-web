-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration Supabase
-- Kế hoạch 2.1b: đường dẫn đẹp (slug) + cột cho trang công khai.
--
--   products.slug, supplier_profiles.slug
--       Sinh tự động khi tạo: tên bỏ dấu + 8 ký tự đầu của id, ví dụ
--       "binh-hoa-gom-men-ran-cao-30cm-7ea39f29" — luôn duy nhất, không cần
--       thử lại. KHÔNG đổi khi đổi tên (link cũ không chết). Người dùng không
--       tự đặt được (trigger giữ nguyên giá trị hệ thống).
--   products.is_featured     Sản phẩm nổi bật trên trang chủ — chỉ admin đặt.
--   product_variants.is_active  Biến thể đang bán (2.2: bỏ biến thể thì
--       đặt FALSE thay vì xoá, giữ id cho đơn hàng cũ).
--   categories.icon          Emoji hiển thị (lấy từ data.ts mẫu).
--   categories.is_active     Danh mục đang dùng.
--
-- Mở rộng thuần tuý: cột mới có mặc định, code hiện tại không đổi.
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'vn_unaccent') THEN
        RAISE EXCEPTION 'Thiếu vn_unaccent(). Chạy 20261005091100 (2.1a) trước.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'slug') THEN
        RAISE EXCEPTION 'products.slug đã tồn tại. Migration này đã chạy rồi.';
    END IF;
END $$;

-- ── Slug ────────────────────────────────────────────────────────────────
-- "Bình hoa gốm (men rạn) 30cm" + id → "binh-hoa-gom-men-ran-30cm-7ea39f29".
CREATE FUNCTION public.make_slug(p_text TEXT, p_id UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
    SELECT concat_ws('-',
        NULLIF(left(btrim(regexp_replace(public.vn_unaccent(p_text), '[^a-z0-9]+', '-', 'g'), '-'), 80), ''),
        left(replace(p_id::TEXT, '-', ''), 8));
$$;

ALTER TABLE public.products          ADD COLUMN slug TEXT;
ALTER TABLE public.supplier_profiles ADD COLUMN slug TEXT;

UPDATE public.products          SET slug = public.make_slug(name, id);
UPDATE public.supplier_profiles SET slug = public.make_slug(shop_name, id);

ALTER TABLE public.products          ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.supplier_profiles ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX uq_products_slug          ON public.products (slug);
CREATE UNIQUE INDEX uq_supplier_profiles_slug ON public.supplier_profiles (slug);

-- ── Cột mới ─────────────────────────────────────────────────────────────
ALTER TABLE public.products         ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.product_variants ADD COLUMN is_active   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.categories       ADD COLUMN icon        TEXT;
ALTER TABLE public.categories       ADD COLUMN is_active   BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX idx_products_featured ON public.products (is_featured) WHERE is_featured;

UPDATE public.categories c SET icon = v.icon
FROM (VALUES
    ('gom-su', '🏺'), ('may-tre-dan', '🧺'), ('do-go-my-nghe', '🪵'),
    ('lua-theu-ren', '🎋'), ('son-mai-kham-trai', '🪔'), ('duc-dong-kim-loai', '⚙️'),
    ('da-my-nghe', '🪨'), ('tranh-giay-dan-gian', '🖼️'), ('theu-may-mac', '👗'),
    ('do-da-thu-cong', '👜')
) AS v(slug, icon)
WHERE c.slug = v.slug;

-- ── Giữ cột hệ thống: slug, is_featured ────────────────────────────────
-- Sinh slug khi tạo; người dùng (không phải admin) không đổi được slug và
-- is_featured — giá trị gửi lên bị thay bằng giá trị hệ thống, không báo lỗi
-- (form lưu cả hàng vẫn chạy).
CREATE FUNCTION public.set_product_system_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.slug := public.make_slug(NEW.name, NEW.id);
        IF current_user = 'authenticated' AND NOT public.is_admin() THEN
            NEW.is_featured := FALSE;
        END IF;
    ELSE
        NEW.slug := OLD.slug;
        IF current_user = 'authenticated' AND NOT public.is_admin() THEN
            NEW.is_featured := OLD.is_featured;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_system_fields
    BEFORE INSERT OR UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.set_product_system_fields();

CREATE FUNCTION public.set_supplier_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.slug := CASE WHEN TG_OP = 'INSERT' THEN public.make_slug(NEW.shop_name, NEW.id)
                     ELSE OLD.slug END;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_supplier_slug
    BEFORE INSERT OR UPDATE ON public.supplier_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_supplier_slug();

-- ── View công khai có slug ─────────────────────────────────────────────
-- Trang gian hàng (2.6) mở theo slug; thêm cột vào cuối view 1.4.
CREATE OR REPLACE VIEW public.public_supplier_profiles
WITH (security_invoker = false)
AS
SELECT
    sp.id,
    sp.shop_name,
    sp.village_origin,
    sp.craft_category,
    sp.founding_year,
    sp.monthly_capacity,
    sp.membership_tier,
    sp.rating_avg,
    sp.total_orders,
    sp.response_rate,
    sp.on_time_rate,
    sp.logo_url,
    sp.banner_url,
    CASE WHEN sp.show_phone_public THEN sp.contact_phone END AS contact_phone,
    CASE WHEN sp.show_phone_public THEN sp.contact_zalo  END AS contact_zalo,
    sp.working_hours,
    sp.website_url,
    sp.allow_direct_message,
    sp.preferred_carriers,
    sp.default_processing_days,
    sp.created_at,
    sp.slug
FROM public.supplier_profiles sp
WHERE public.supplier_is_public(sp.id);

DO $$
BEGIN
    RAISE NOTICE 'Migration OK — slug sản phẩm/xưởng, is_featured, is_active, icon danh mục';
END $$;

COMMIT;
