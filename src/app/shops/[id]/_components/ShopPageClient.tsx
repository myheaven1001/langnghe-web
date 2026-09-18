'use client';

import { useState } from 'react';
import { PublicHeader, Breadcrumb, ListToolbar, ProductListingCard, Pagination } from '@/components/ui';
import { ShopHeader } from './ShopHeader';
import { AboutCard } from './AboutCard';
import { CertificationsCard } from './CertificationsCard';
import { ShopFilterSidebar } from './ShopFilterSidebar';
import { ShopBanner } from './ShopBanner';
import { AchievementStrip } from './AchievementStrip';
import { ShopToolbarChips } from './ShopToolbarChips';
import {
  SHOP,
  SHOP_BADGES,
  SHOP_METRICS,
  SHOP_NAV_TABS,
  ABOUT_ROWS,
  CERTIFICATIONS,
  FILTER_CATEGORIES,
  FEATURE_OPTIONS,
  MOQ_OPTIONS,
  BANNER,
  ACHIEVEMENTS,
  TOOLBAR_CHIPS,
  SORT_OPTIONS,
  SHOP_PRODUCTS,
} from './data';

const PRODUCT_GRID = 'grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4';

export function ShopPageClient() {
  const [view, setView] = useState<'grid' | 'list'>('grid');

  return (
    <div className="text-brand-ink min-h-screen bg-[#F5F5F5] text-[13px]">
      <PublicHeader
        searchPlaceholder={`Tìm trong gian hàng ${SHOP.name}...`}
        primaryButtonLabel="Đăng ký mua sỉ"
      />
      <Breadcrumb
        items={[{ label: 'Trang chủ', href: '/' }, { label: 'Gốm sứ', href: '/categories/gom-su' }, { label: SHOP.name }]}
      />

      <ShopHeader
        emoji={SHOP.emoji}
        name={SHOP.name}
        village={SHOP.village}
        badges={SHOP_BADGES}
        metrics={SHOP_METRICS}
        navTabs={SHOP_NAV_TABS}
      />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[220px_1fr]">
        <div className="flex flex-col gap-2.5">
          <AboutCard rows={ABOUT_ROWS} />
          <CertificationsCard items={CERTIFICATIONS} />
          <ShopFilterSidebar
            categories={FILTER_CATEGORIES}
            features={FEATURE_OPTIONS}
            moqOptions={MOQ_OPTIONS}
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <ShopBanner
            emoji={SHOP.emoji}
            title={BANNER.title}
            sub={BANNER.sub}
            tags={BANNER.tags}
            onlineStatus={SHOP.onlineStatus}
            followerCount={SHOP.followerCount}
          />

          <AchievementStrip items={ACHIEVEMENTS} />

          <ListToolbar
            left={<ShopToolbarChips chips={TOOLBAR_CHIPS} />}
            rightExtra={
              <span className="text-brand-sub text-xs">{SHOP.totalProductCount} sản phẩm</span>
            }
            sortOptions={SORT_OPTIONS}
            view={view}
            onViewChange={setView}
          />

          <div className={view === 'grid' ? PRODUCT_GRID : 'grid grid-cols-1 gap-2.5'}>
            {SHOP_PRODUCTS.map((product) => (
              <ProductListingCard key={product.id} product={product} rfqLabel="📋 Gửi yêu cầu báo giá" />
            ))}
          </div>

          <Pagination pages={[1, 2, 3]} totalPages={7} />
        </div>
      </div>
    </div>
  );
}
