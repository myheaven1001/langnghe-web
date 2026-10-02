import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PublicHeader, Breadcrumb } from '@/components/ui';
import { CatalogFilters } from '@/components/catalog/CatalogFilters';
import { CatalogResults } from '@/components/catalog/CatalogResults';
import { parseCatalogFilters, runCatalogSearch, type SearchParamsRecord } from '@/lib/catalog';

// Trang gian hàng (kế hoạch 2.6): /shops/<id> hoặc /shops/<slug>. Hồ sơ từ
// public_supplier_profiles (chỉ cột công khai, bỏ xưởng ẩn/bị khoá — 1.4);
// sản phẩm của xưởng qua search_products. Chủ xưởng vẫn xem được gian hàng
// của mình khi đang ẩn (đọc hồ sơ của chính họ).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOP_COLUMNS =
  'id, slug, shop_name, village_origin, craft_category, founding_year, monthly_capacity, rating_avg, total_orders, response_rate, on_time_rate, logo_url, banner_url, contact_phone, contact_zalo, working_hours, website_url';

/* eslint-disable @next/next/no-img-element */

const loadShop = cache(async (key: string) => {
  const supabase = await createClient();
  const column = UUID_RE.test(key) ? 'id' : 'slug';

  const { data: pub } = await supabase
    .from('public_supplier_profiles')
    .select(`${SHOP_COLUMNS}, verified`)
    .eq(column, key)
    .maybeSingle();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: own }, { data: buyer }] = user
    ? await Promise.all([
        supabase
          .from('supplier_profiles')
          .select(`${SHOP_COLUMNS}, is_hidden`)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase.from('buyer_profiles').select('id').eq('user_id', user.id).maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  const isOwner = Boolean(own && (pub ? own.id === pub.id : own[column] === key));
  if (pub)
    return {
      shop: { ...pub, verified: Boolean(pub.verified) },
      isOwner,
      hiddenPreview: false,
      isBuyer: Boolean(buyer),
    };
  if (isOwner && own)
    return { shop: { ...own, verified: false }, isOwner, hiddenPreview: true, isBuyer: false };
  return null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const data = await loadShop(decodeURIComponent((await params).id));
  if (!data) return { title: 'Không tìm thấy gian hàng — LàngNghề.vn' };
  const { shop } = data;
  return {
    title: `${shop.shop_name} — LàngNghề.vn`,
    description: [shop.craft_category, shop.village_origin, 'mua sỉ trực tiếp từ xưởng']
      .filter(Boolean)
      .join(' · '),
    alternates: { canonical: `/shops/${shop.slug}` },
    openGraph: {
      images: shop.banner_url || shop.logo_url ? [shop.banner_url ?? shop.logo_url!] : undefined,
    },
  };
}

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const data = await loadShop(decodeURIComponent(id));
  if (!data) notFound();
  const { shop, isOwner, hiddenPreview, isBuyer } = data;

  const filters = parseCatalogFilters(sp);
  const basePath = `/shops/${shop.slug}`;
  const supabase = await createClient();
  const { products, total, facets, failed } = await runCatalogSearch(supabase, filters, {
    supplierId: shop.id,
  });

  const facts = [
    shop.founding_year && `Thành lập ${shop.founding_year}`,
    shop.monthly_capacity && `Công suất ~${shop.monthly_capacity.toLocaleString('vi-VN')} sp/tháng`,
    shop.total_orders ? `${shop.total_orders} đơn trên sàn` : null,
    shop.response_rate != null && `Phản hồi RFQ ${Math.round(Number(shop.response_rate))}%`,
    shop.on_time_rate != null && `Giao đúng hạn ${Math.round(Number(shop.on_time_rate))}%`,
    shop.working_hours && `Giờ làm việc: ${shop.working_hours}`,
  ].filter(Boolean) as string[];

  const rfqHref = `/rfq/new?supplier=${shop.id}`;
  // Link do xưởng tự nhập: chỉ nhận http(s) (chặn javascript:, data:…).
  const websiteUrl =
    shop.website_url && /^https?:\/\//i.test(shop.website_url) ? shop.website_url : null;

  return (
    <div className="text-brand-ink min-h-screen bg-[#F5F5F5] text-[13px]">
      <PublicHeader primaryButtonLabel="Gửi yêu cầu báo giá" primaryButtonHref="/rfq/new" />
      <Breadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: shop.shop_name }]} />

      <div className="mx-auto max-w-[1200px] px-4 pb-5">
        {hiddenPreview && (
          <div className="mb-2.5 rounded border border-[#FFE0B2] bg-[#FFF3E0] px-4 py-2.5 text-xs text-[#E65100]">
            Gian hàng đang <strong>ẩn</strong> — chỉ bạn thấy trang này. Bật lại trong{' '}
            <Link href="/supplier/settings/shop" className="font-semibold underline">
              Cài đặt gian hàng
            </Link>
            .
          </div>
        )}

        <div className="border-brand-border mb-3 overflow-hidden rounded border bg-white">
          <div className="h-[110px] bg-[linear-gradient(135deg,#1A3A2A,#2d5a3d)] sm:h-[150px]">
            {shop.banner_url && (
              <img src={shop.banner_url} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="flex flex-col gap-3 px-4 pb-4 sm:flex-row sm:items-end">
            <div className="-mt-9 flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#f0ede5] text-3xl">
              {shop.logo_url ? (
                <img src={shop.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                '🏭'
              )}
            </div>
            <div className="min-w-0 flex-1 sm:pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-tight text-lg leading-tight font-bold">{shop.shop_name}</h1>
                {shop.verified && (
                  <span className="text-brand-green rounded-sm bg-[#E8F5EE] px-2 py-0.5 text-[11px] font-semibold">
                    ✓ Đã xác minh
                  </span>
                )}
                {shop.rating_avg != null && Number(shop.rating_avg) > 0 && (
                  <span className="text-xs">
                    <span className="text-[#FFB800]">★</span> {Number(shop.rating_avg).toFixed(1)}
                  </span>
                )}
              </div>
              <div className="text-brand-sub mt-0.5 text-xs">
                {[shop.craft_category, shop.village_origin].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {isOwner ? (
                <Link
                  href="/supplier/settings/shop"
                  className="border-brand-border rounded border px-4 py-2 text-xs font-semibold"
                >
                  ⚙️ Cài đặt gian hàng
                </Link>
              ) : (
                <Link
                  href={isBuyer ? rfqHref : `/login?next=${encodeURIComponent(rfqHref)}`}
                  className="bg-brand-red rounded px-4 py-2 text-xs font-semibold text-white"
                >
                  📋 Gửi RFQ cho xưởng này
                </Link>
              )}
            </div>
          </div>

          {(facts.length > 0 || shop.contact_phone || websiteUrl) && (
            <div className="border-brand-border text-brand-sub flex flex-wrap gap-x-5 gap-y-1.5 border-t px-4 py-2.5 text-xs">
              {facts.map((f) => (
                <span key={f}>{f}</span>
              ))}
              {shop.contact_phone && (
                <a href={`tel:${shop.contact_phone}`} className="text-brand-blue">
                  📞 {shop.contact_phone}
                </a>
              )}
              {shop.contact_zalo && <span>Zalo: {shop.contact_zalo}</span>}
              {websiteUrl && (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-brand-blue"
                >
                  🌐 Website
                </a>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_1fr]">
          <CatalogFilters basePath={basePath} filters={filters} facets={facets} />
          <CatalogResults
            basePath={basePath}
            filters={filters}
            products={products}
            total={total}
            heading={`Sản phẩm của ${shop.shop_name}`}
            empty={
              <p className="text-brand-sub text-[13px]">
                {failed
                  ? 'Không tải được sản phẩm. Vui lòng thử lại sau ít phút.'
                  : 'Xưởng chưa đăng sản phẩm phù hợp. Bạn vẫn có thể gửi yêu cầu báo giá cho xưởng.'}
              </p>
            }
          />
        </div>
      </div>
    </div>
  );
}
