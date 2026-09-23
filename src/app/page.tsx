import type { Metadata } from 'next';
import { inter, interTight } from '@/lib/fonts';
import { SiteHeader } from './_components/home/SiteHeader';
import { NavTabs } from './_components/home/NavTabs';
import { CategorySidebar } from './_components/home/CategorySidebar';
import { HeroBanners } from './_components/home/HeroBanners';
import { QuickCategories } from './_components/home/QuickCategories';
import { Section } from './_components/home/Section';
import { ProductCard } from './_components/home/ProductCard';
import { TrustFooter } from './_components/home/TrustFooter';
import {
  NAV_TABS,
  CATEGORY_GROUPS,
  QUICK_CATEGORIES,
  FLASH_SALE_PRODUCTS,
  FEATURED_PRODUCTS,
  CERAMIC_PRODUCTS,
  TRUST_ITEMS,
} from './_components/home/data';

export const metadata: Metadata = {
  title: 'LàngNghề.vn — Chợ sỉ thủ công mỹ nghệ Việt Nam',
  description: 'Chợ sỉ làng nghề Việt Nam — kết nối buyer với 1.200+ xưởng thủ công mỹ nghệ.',
};

const PRODUCT_GRID = 'grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-5';

// Ported from langnghe_1688_style.html (Trang chủ). Layout, content and
// interactions (sidebar accordion, nav tabs) are preserved; data below is
// still hardcoded pending the real marketplace API.
export default function HomePage() {
  return (
    <div
      className={`${inter.variable} ${interTight.variable} min-h-screen bg-[#F7F3ED] font-[family-name:var(--font-inter)] text-[13px] text-[#2A2420]`}
    >
      <SiteHeader />
      <NavTabs tabs={NAV_TABS} />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[180px_1fr]">
        <CategorySidebar groups={CATEGORY_GROUPS} />

        <div className="flex flex-col gap-2.5">
          <HeroBanners />

          <QuickCategories items={QUICK_CATEGORIES} />

          <Section
            title={<>⚡ Ưu đãi lô hàng tuần này</>}
            countdown="3 ngày"
            moreHref="/search"
          >
            <div className={PRODUCT_GRID}>
              {FLASH_SALE_PRODUCTS.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </Section>

          <Section title={<>🎯 Sản phẩm nổi bật</>} moreHref="/search">
            <div className={PRODUCT_GRID}>
              {FEATURED_PRODUCTS.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </Section>

          <Section
            title={<>🏺 Gốm sứ — Đặc sản Bát Tràng & Phù Lãng</>}
            moreLabel="Xem toàn bộ gốm sứ →"
            moreHref="/categories/gom-su"
          >
            <div className={PRODUCT_GRID}>
              {CERAMIC_PRODUCTS.map((product) => (
                <ProductCard key={product.id} product={product} compact />
              ))}
            </div>
          </Section>

          <TrustFooter items={TRUST_ITEMS} />
        </div>
      </div>
    </div>
  );
}
