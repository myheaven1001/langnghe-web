'use client';

import { useState } from 'react';
import { PublicHeader, ListToolbar, ProductListingCard, Pagination } from '@/components/ui';
import { CategoryHero } from './CategoryHero';
import { SubCatsBar } from './SubCatsBar';
import { CategoryFilterSidebar } from './CategoryFilterSidebar';
import { FeaturedVillages } from './FeaturedVillages';
import { SubCategoryCards } from './SubCategoryCards';
import {
  CATEGORY,
  SUB_CATS_BAR,
  VILLAGE_OPTIONS,
  MOQ_OPTIONS,
  FEATURE_OPTIONS,
  FEATURED_VILLAGES,
  SUB_CATEGORY_CARDS,
  SORT_OPTIONS,
  CATEGORY_PRODUCTS,
} from './data';

const PRODUCT_GRID = 'grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4';

export function CategoryPageClient() {
  const [view, setView] = useState<'grid' | 'list'>('grid');

  return (
    <div className="text-brand-ink min-h-screen bg-[#F5F5F5] text-[13px]">
      <PublicHeader searchPlaceholder={`Tìm trong ${CATEGORY.name}...`} />
      <CategoryHero />
      <SubCatsBar items={SUB_CATS_BAR} />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[220px_1fr]">
        <div className="flex flex-col gap-2.5">
          <CategoryFilterSidebar
            villages={VILLAGE_OPTIONS}
            moqOptions={MOQ_OPTIONS}
            featureOptions={FEATURE_OPTIONS}
          />
          <FeaturedVillages villages={FEATURED_VILLAGES} />
        </div>

        <div className="flex flex-col gap-2.5">
          <SubCategoryCards cards={SUB_CATEGORY_CARDS} />

          <ListToolbar
            left={
              <div className="flex-1">
                <div className="text-[15px] font-bold">{CATEGORY.name} · Tất cả</div>
                <div className="text-brand-sub mt-0.5 text-xs">248 sản phẩm · 86 nhà cung cấp</div>
              </div>
            }
            sortOptions={SORT_OPTIONS}
            view={view}
            onViewChange={setView}
          />

          <div className={view === 'grid' ? PRODUCT_GRID : 'grid grid-cols-1 gap-2.5'}>
            {CATEGORY_PRODUCTS.map((product) => (
              <ProductListingCard key={product.id} product={product} />
            ))}
          </div>

          <Pagination pages={[1, 2, 3]} totalPages={11} />
        </div>
      </div>
    </div>
  );
}
