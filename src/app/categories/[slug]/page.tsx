import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PublicHeader, Breadcrumb } from '@/components/ui';
import { CatalogFilters } from '@/components/catalog/CatalogFilters';
import { CatalogResults } from '@/components/catalog/CatalogResults';
import { parseCatalogFilters, runCatalogSearch, type SearchParamsRecord } from '@/lib/catalog';

// Trang danh mục (kế hoạch 2.6): danh mục thật theo slug, sản phẩm công khai
// của danh mục qua search_products — lọc giá, MOQ, xưởng xác minh, sắp xếp,
// phân trang trên URL (dùng chung với /search).

const loadCategory = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('categories')
    .select('id, slug, name, icon')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const category = await loadCategory((await params).slug);
  if (!category) return { title: 'Không tìm thấy danh mục — LàngNghề.vn' };
  return {
    title: `${category.name} mua sỉ từ xưởng — LàngNghề.vn`,
    description: `Mua sỉ ${category.name.toLowerCase()} trực tiếp từ các xưởng làng nghề Việt Nam. Xem giá theo số lượng, gửi yêu cầu báo giá.`,
    alternates: { canonical: `/categories/${category.slug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const category = await loadCategory(slug);
  if (!category) notFound();

  const filters = parseCatalogFilters(sp);
  const basePath = `/categories/${category.slug}`;
  const supabase = await createClient();
  const { products, total, failed } = await runCatalogSearch(supabase, filters, {
    categorySlug: category.slug,
  });

  return (
    <div className="text-brand-ink min-h-screen bg-[#F5F5F5] text-[13px]">
      <PublicHeader primaryButtonLabel="Gửi yêu cầu báo giá" primaryButtonHref="/rfq/new" />
      <Breadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: category.name }]} />

      <div className="mx-auto max-w-[1200px] px-4 pb-5">
        <div className="mb-3 flex items-center gap-3 rounded bg-[linear-gradient(135deg,#1a1a2e,#0f3460)] px-5 py-5 text-white">
          <div className="text-4xl">{category.icon ?? '📦'}</div>
          <div>
            <h1 className="font-tight text-xl leading-tight font-bold">{category.name}</h1>
            <p className="mt-0.5 text-xs text-white/70">
              Mua sỉ trực tiếp từ xưởng · Giá theo số lượng · Gửi yêu cầu báo giá miễn phí
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_1fr]">
          <CatalogFilters
            basePath={basePath}
            filters={filters}
            facets={[]}
            showCategories={false}
          />
          <CatalogResults
            basePath={basePath}
            filters={filters}
            products={products}
            total={total}
            heading={category.name}
            empty={
              failed ? (
                <p className="text-brand-sub text-[13px]">
                  Không tải được sản phẩm. Vui lòng thử lại sau ít phút.
                </p>
              ) : (
                <>
                  <div className="mb-2 text-3xl">{category.icon ?? '📦'}</div>
                  <div className="mb-1 text-[15px] font-bold">
                    Chưa có sản phẩm phù hợp trong ngành này
                  </div>
                  <p className="text-brand-sub mx-auto mb-4 max-w-[420px] text-xs leading-relaxed">
                    Bỏ bớt bộ lọc, hoặc gửi yêu cầu báo giá — các xưởng{' '}
                    {category.name.toLowerCase()} sẽ báo giá trực tiếp cho bạn.
                  </p>
                  <Link
                    href="/rfq/new"
                    className="bg-brand-red inline-block rounded px-5 py-2.5 text-[13px] font-semibold text-white"
                  >
                    📋 Gửi yêu cầu báo giá
                  </Link>
                </>
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
