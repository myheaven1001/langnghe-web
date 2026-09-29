import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProductDetailClient } from './_components/ProductDetailClient';
import type {
  MediaView,
  ProductView,
  RelatedView,
  SupplierView,
  TierView,
  VariantView,
  Viewer,
} from './_components/types';

// Trang sản phẩm (kế hoạch 2.3) — đọc dữ liệu thật. /products/<id> hoặc
// /products/<slug> (slug từ 2.1b). Quyền xem do RLS quyết định (1.6): khách
// chỉ thấy sản phẩm active của xưởng công khai; xưởng chủ thấy cả sản phẩm
// nháp/ẩn của mình. Không thấy → 404.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// cache(): generateMetadata và trang dùng chung một lần đọc mỗi request.
const loadProduct = cache(async (key: string) => {
  const supabase = await createClient();

  const { data: p } = await supabase
    .from('products')
    .select(
      'id, slug, name, description, min_order_qty, lead_time_days, accept_oem, accept_custom, status, supplier_id, categories(id, name, slug)',
    )
    .eq(UUID_RE.test(key) ? 'id' : 'slug', key)
    .maybeSingle();
  if (!p) return null;

  const [tiersRes, variantsRes, mediaRes, supplierRes, cardRes, userRes] = await Promise.all([
    supabase
      .from('price_tiers')
      .select('min_qty, max_qty, unit_price')
      .eq('product_id', p.id)
      .order('min_qty'),
    supabase
      .from('product_variants')
      .select('id, color, size, material, price_adjustment, stock_qty')
      .eq('product_id', p.id)
      .eq('is_active', true)
      .order('price_adjustment'),
    supabase
      .from('product_media')
      .select('id, cdn_url, thumbnail_url')
      .eq('product_id', p.id)
      .eq('media_type', 'image')
      .order('is_primary', { ascending: false })
      .order('sort_order'),
    supabase
      .from('public_supplier_profiles')
      .select(
        'id, slug, shop_name, village_origin, craft_category, rating_avg, logo_url, founding_year, monthly_capacity, response_rate, on_time_rate, total_orders',
      )
      .eq('id', p.supplier_id)
      .maybeSingle(),
    supabase.from('product_cards').select('supplier_verified').eq('id', p.id).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const user = userRes.data.user;
  let viewerKind: Viewer['kind'] = 'guest';
  let ownSupplier: typeof supplierRes.data = null;
  if (user) {
    const [{ data: own }, { data: buyer }] = await Promise.all([
      supabase
        .from('supplier_profiles')
        .select(
          'id, slug, shop_name, village_origin, craft_category, rating_avg, logo_url, founding_year, monthly_capacity, response_rate, on_time_rate, total_orders',
        )
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('buyer_profiles').select('id').eq('user_id', user.id).maybeSingle(),
    ]);
    if (own?.id === p.supplier_id) {
      viewerKind = 'owner';
      ownSupplier = own;
    } else {
      viewerKind = buyer ? 'buyer' : 'other';
    }
  }

  // Xưởng đang ẩn gian hàng không có trong view công khai — chủ xưởng xem
  // sản phẩm của mình thì dùng hồ sơ của chính họ.
  const s = supplierRes.data ?? ownSupplier;
  if (!s) return null;

  const category = Array.isArray(p.categories) ? p.categories[0] : p.categories;

  const product: ProductView = {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    moq: p.min_order_qty,
    leadTimeDays: p.lead_time_days,
    acceptOem: p.accept_oem,
    acceptCustom: p.accept_custom,
    status: p.status,
    category: category ?? null,
  };

  const tiers: TierView[] = (tiersRes.data ?? []).map((t) => ({
    minQty: t.min_qty,
    maxQty: t.max_qty,
    unitPrice: Number(t.unit_price),
  }));

  const variants: VariantView[] = (variantsRes.data ?? []).map((v) => ({
    id: v.id,
    label: [v.color, v.size, v.material].filter(Boolean).join(' · ') || 'Mặc định',
    priceAdjustment: Number(v.price_adjustment),
    stockQty: v.stock_qty,
  }));

  const media: MediaView[] = (mediaRes.data ?? [])
    .map((m) => ({ id: m.id, url: m.cdn_url ?? m.thumbnail_url ?? '' }))
    .filter((m) => m.url);

  const supplier: SupplierView = {
    id: s.id,
    slug: s.slug,
    shopName: s.shop_name,
    villageOrigin: s.village_origin,
    craftCategory: s.craft_category,
    rating: s.rating_avg != null ? Number(s.rating_avg) : null,
    logoUrl: s.logo_url,
    foundingYear: s.founding_year,
    monthlyCapacity: s.monthly_capacity,
    responseRate: s.response_rate != null ? Number(s.response_rate) : null,
    onTimeRate: s.on_time_rate != null ? Number(s.on_time_rate) : null,
    totalOrders: s.total_orders,
    verified: cardRes.data?.supplier_verified ?? false,
  };

  const path = `/products/${p.slug}`;
  const viewer: Viewer = {
    kind: viewerKind,
    loginHref: `/login?next=${encodeURIComponent(`${path}?rfq=1`)}`,
    editHref: `/supplier/products/${p.id}/edit`,
  };

  return { product, tiers, variants, media, supplier, viewer };
});

async function loadRelated(productId: string, categoryId: string | null, supplierId: string) {
  const supabase = await createClient();
  const filter = categoryId
    ? `category_id.eq.${categoryId},supplier_id.eq.${supplierId}`
    : `supplier_id.eq.${supplierId}`;
  const { data } = await supabase
    .from('product_cards')
    .select('id, slug, name, image_url, min_price, moq')
    .or(filter)
    .neq('id', productId)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5);
  return (data ?? []).map((r): RelatedView => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    imageUrl: r.image_url,
    minPrice: r.min_price != null ? Number(r.min_price) : null,
    moq: r.moq,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await loadProduct(decodeURIComponent(id));
  if (!data) return { title: 'Không tìm thấy sản phẩm — LàngNghề.vn' };

  const { product, supplier, media } = data;
  const description = (
    product.description ??
    `${product.name} — ${supplier.shopName}${supplier.villageOrigin ? `, ${supplier.villageOrigin}` : ''}`
  ).slice(0, 160);

  return {
    title: `${product.name} — LàngNghề.vn`,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      title: product.name,
      description,
      images: media[0] ? [media[0].url] : undefined,
    },
  };
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rfq?: string }>;
}) {
  const [{ id }, { rfq }] = await Promise.all([params, searchParams]);
  const data = await loadProduct(decodeURIComponent(id));
  if (!data) notFound();

  const related = await loadRelated(
    data.product.id,
    data.product.category?.id ?? null,
    data.supplier.id,
  );

  return (
    <ProductDetailClient
      {...data}
      related={related}
      // Quay lại từ trang đăng nhập (?rfq=1) → mở luôn form gửi RFQ.
      openRfqOnLoad={rfq === '1' && data.viewer.kind === 'buyer'}
    />
  );
}
