import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PublicHeader, Breadcrumb } from '@/components/ui';
import { CatalogFilters } from '@/components/catalog/CatalogFilters';
import { CatalogResults } from '@/components/catalog/CatalogResults';
import { parseCatalogFilters, runCatalogSearch, type SearchParamsRecord } from '@/lib/catalog';

// Tìm kiếm (kế hoạch 2.5): từ khoá không dấu + lọc ngành, giá, MOQ, xưởng
// xác minh, sắp xếp, phân trang — tất cả trên URL, dữ liệu thật từ
// search_products/search_facets (chỉ sản phẩm công khai).

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}): Promise<Metadata> {
  const { q } = parseCatalogFilters(await searchParams);
  return {
    title: q ? `Tìm "${q}" — LàngNghề.vn` : 'Tìm sản phẩm — LàngNghề.vn',
    description: 'Tìm sản phẩm thủ công mỹ nghệ mua sỉ từ các xưởng làng nghề Việt Nam.',
    robots: { index: false },
  };
}

// Ghi 1 dòng search_logs cho mỗi lượt tìm có từ khoá (log_search đếm kết
// quả bằng tìm kiếm không dấu — 20261005091500). Chỉ ghi ở trang 1 với bộ
// lọc gốc, để lật trang/đổi lọc không tính là lượt tìm mới. Lỗi ghi log
// không làm hỏng trang.
async function logSearch(query: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('log_search', { p_query: query });
    if (error) console.error('log_search failed:', error.message);
  } catch (e) {
    console.error('log_search failed:', e);
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const sp = await searchParams;
  const filters = parseCatalogFilters(sp);

  const isFreshSearch =
    filters.q &&
    filters.page === 1 &&
    !filters.cat &&
    !filters.min &&
    !filters.max &&
    !filters.moq &&
    !filters.verified;
  if (isFreshSearch) await logSearch(filters.q);

  const supabase = await createClient();
  const { products, total, facets, failed } = await runCatalogSearch(supabase, filters);

  return (
    <div className="text-brand-ink min-h-screen bg-[#F5F5F5] text-[13px]">
      <PublicHeader
        key={filters.q}
        searchDefaultValue={filters.q}
        primaryButtonLabel="Gửi yêu cầu báo giá"
        primaryButtonHref="/rfq/new"
      />
      <Breadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Tìm kiếm' }]} />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-3 px-4 pb-5 lg:grid-cols-[220px_1fr]">
        <CatalogFilters basePath="/search" filters={filters} facets={facets} />
        <CatalogResults
          basePath="/search"
          filters={filters}
          products={products}
          total={total}
          heading={
            filters.q ? (
              <>
                Kết quả cho: <em className="text-brand-red not-italic">&quot;{filters.q}&quot;</em>
              </>
            ) : (
              'Tất cả sản phẩm'
            )
          }
          empty={
            failed ? (
              <p className="text-brand-sub text-[13px]">
                Không tải được kết quả. Vui lòng thử lại sau ít phút.
              </p>
            ) : (
              <>
                <div className="mb-2 text-3xl">🔍</div>
                <div className="mb-1 text-[15px] font-bold">Chưa tìm thấy sản phẩm phù hợp</div>
                <p className="text-brand-sub mx-auto mb-4 max-w-[420px] text-xs leading-relaxed">
                  Thử từ khoá ngắn hơn hoặc bỏ bớt bộ lọc. Hoặc gửi yêu cầu báo giá — các xưởng sẽ
                  báo giá trực tiếp cho bạn.
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
  );
}
