-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration sang Supabase (3/11)
-- PRODUCTS & CATALOG — không đổi so với schema_v1_mvp.sql gốc
-- ============================================================

CREATE TABLE categories (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id  UUID        REFERENCES categories(id),
    name       VARCHAR(255) NOT NULL,
    slug       VARCHAR(255) NOT NULL UNIQUE,
    craft_type VARCHAR(100),
    sort_order INT         NOT NULL DEFAULT 0
);

CREATE TABLE products (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id     UUID           NOT NULL REFERENCES supplier_profiles(id),
    category_id     UUID           REFERENCES categories(id),
    name            VARCHAR(255)   NOT NULL,
    description     TEXT,
    min_order_qty   INT            NOT NULL DEFAULT 1,
    lead_time_days  INT,
    status          product_status NOT NULL DEFAULT 'draft',
    accept_oem      BOOLEAN        NOT NULL DEFAULT FALSE,
    accept_custom   BOOLEAN        NOT NULL DEFAULT FALSE,
    -- FTS vector: cập nhật bằng trigger khi name/description thay đổi
    search_vector   TSVECTOR,
    created_at      TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE TABLE price_tiers (
    id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    min_qty    INT           NOT NULL,
    max_qty    INT,                       -- NULL = không giới hạn
    unit_price DECIMAL(14,2) NOT NULL,
    currency   VARCHAR(3)    NOT NULL DEFAULT 'VND',
    CONSTRAINT chk_tier_qty CHECK (max_qty IS NULL OR max_qty >= min_qty),
    -- Chặn bậc giá chồng lấn (cần btree_gist)
    EXCLUDE USING gist (
        product_id WITH =,
        int4range(min_qty, COALESCE(max_qty, 2147483647), '[]') WITH &&
    )
);

-- product_media: gộp ảnh + video + PDF catalogue vào 1 bảng
-- Lưu trữ: Cloudflare R2 · CDN: Cloudflare Images
-- Pipeline: uploading → processing (resize/thumbnail/watermark) → ready
CREATE TABLE product_media (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id     UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    media_type     media_type   NOT NULL DEFAULT 'image',
    status         media_status NOT NULL DEFAULT 'uploading',
    -- r2_key: đường dẫn trong bucket R2, ví dụ: products/{product_id}/{uuid}.jpg
    r2_key         VARCHAR(500) NOT NULL,
    -- cdn_url: URL Cloudflare Images để serve (transform on-demand)
    cdn_url        VARCHAR(500),
    thumbnail_url  VARCHAR(500),
    file_size_bytes INT,
    mime_type      VARCHAR(100),
    is_primary     BOOLEAN      NOT NULL DEFAULT FALSE,
    sort_order     INT          NOT NULL DEFAULT 0,
    processing_error TEXT,       -- lý do failed nếu có
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);
