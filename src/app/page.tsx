import type { Metadata } from 'next';
import Link from 'next/link';
import { inter, interTight } from '@/lib/fonts';
import { SiteHeader } from './_components/home/SiteHeader';
import { NavTabs } from './_components/home/NavTabs';
import { CategorySidebar } from './_components/home/CategorySidebar';
import { HeroBanners } from './_components/home/HeroBanners';
import { QuickCategories } from './_components/home/QuickCategories';
import { Section } from './_components/home/Section';
import { ProductCard } from './_components/home/ProductCard';
import { TrustFooter } from './_components/home/TrustFooter';
import { getHomeData } from './_components/home/queries';

export const metadata: Metadata = {
  title: 'LàngNghề.vn — Chợ sỉ thủ công mỹ nghệ Việt Nam',
  description:
    'Chợ sỉ làng nghề Việt Nam — mua sỉ gốm sứ, mây tre đan, đồ gỗ, lụa, sơn mài trực tiếp từ xưởng. Gửi yêu cầu báo giá miễn phí.',
};

// Trang chủ (kế hoạch 2.4): dữ liệu thật, tạo sẵn và làm mới tối đa 5
// phút/lần — không đọc cookie (header tự lấy phiên đăng nhập ở trình duyệt).
export const revalidate = 300;

const PRODUCT_GRID = 'grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-5';

export default async function HomePage() {
  const { categories, stats, newest, featured, categorySections } = await getHomeData();
  const hasProducts = newest.length > 0;

  return (
    <div
      className={`${inter.variable} ${interTight.variable} min-h-screen bg-[#F7F3ED] font-[family-name:var(--font-inter)] text-[13px] text-[#2A2420]`}
    >
      <SiteHeader />
      <NavTabs categories={categories} />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[180px_1fr]">
        <CategorySidebar categories={categories} />

        <div className="flex min-w-0 flex-col gap-2.5">
          <HeroBanners stats={stats} />
          <QuickCategories categories={categories} />

          {!hasProducts && (
            <div className="rounded border border-[#E5DDD1] bg-white px-5 py-8 text-center">
              <div className="mb-2 text-3xl">🏺</div>
              <div className="mb-1 text-[15px] font-bold">Các xưởng đang cập nhật sản phẩm</div>
              <p className="mx-auto mb-4 max-w-[440px] text-xs leading-relaxed text-[#6B6058]">
                Bạn cần mua sỉ mặt hàng thủ công nào? Gửi yêu cầu báo giá — các xưởng làng nghề sẽ
                gửi giá trực tiếp cho bạn.
              </p>
              <Link
                href="/rfq/new"
                className="inline-block rounded bg-[#B5482E] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#9C3D27]"
              >
                📋 Gửi yêu cầu báo giá
              </Link>
            </div>
          )}

          {featured.length > 0 && (
            <Section title={<>🎯 Sản phẩm nổi bật</>} moreHref="/search">
              <div className={PRODUCT_GRID}>
                {featured.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </Section>
          )}

          {/* Thay mục "Ưu đãi lô hàng tuần này" của bản mẫu tới khi chốt
              câu hỏi 7 (có làm khuyến mãi hay không). */}
          {hasProducts && (
            <Section title={<>🆕 Sản phẩm mới</>} moreHref="/search">
              <div className={PRODUCT_GRID}>
                {newest.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </Section>
          )}

          {categorySections.map(({ category, products }) => (
            <Section
              key={category.id}
              title={
                <>
                  {category.icon} {category.name}
                </>
              }
              moreLabel={`Xem toàn bộ ${category.name.toLowerCase()} →`}
              moreHref={`/categories/${category.slug}`}
            >
              <div className={PRODUCT_GRID}>
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} compact />
                ))}
              </div>
            </Section>
          ))}

          <TrustFooter />
        </div>
      </div>
    </div>
  );
}
