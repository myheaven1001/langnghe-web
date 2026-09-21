'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PublicHeader, Breadcrumb, ListToolbar, ProductListingCard, Pagination } from '@/components/ui';
import { FilterSidebar } from './FilterSidebar';
import { RelatedSearches } from './RelatedSearches';
import {
  SEARCH_PRODUCTS,
  CATEGORY_OPTIONS,
  MOQ_OPTIONS,
  FEATURE_OPTIONS,
  VILLAGE_OPTIONS,
  RELATED_SEARCHES,
  SORT_OPTIONS,
} from './data';

const SEARCH_CATEGORIES = ['Tất cả', 'Gốm sứ', 'Mây tre đan', 'Đồ gỗ', 'Lụa & thêu'];

// The query text is shared between the header's search box, the toolbar's
// "Kết quả cho: ..." highlight, and the related-search tags (clicking one
// re-fills the other two) — same cross-widget behavior as the prototype's
// imperative DOM script, done here with lifted React state instead.
//
// Submitting a search (header box or a related-search tag) navigates to
// /search?q=... instead of only setting state, so the server page runs and
// records the search in search_logs (see page.tsx).
export function SearchPageClient({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  // Keep the box in sync with the URL when it changes without a remount
  // (browser back/forward between two ?q= values).
  const [syncedQuery, setSyncedQuery] = useState(initialQuery);
  if (syncedQuery !== initialQuery) {
    setSyncedQuery(initialQuery);
    setQuery(initialQuery);
  }

  const runSearch = (term: string) => {
    setQuery(term);
    const trimmed = term.trim();
    if (trimmed) router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="text-brand-ink min-h-screen bg-[#F5F5F5] text-[13px]">
      <PublicHeader
        searchCategories={SEARCH_CATEGORIES}
        searchValue={query}
        onSearchValueChange={setQuery}
        onSearch={runSearch}
      />

      <Breadcrumb
        items={[
          { label: 'Trang chủ', href: '/' },
          { label: 'Gốm sứ', href: '#' },
          { label: 'Kết quả tìm kiếm' },
        ]}
      />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-3 px-4 pb-5 lg:grid-cols-[220px_1fr]">
        <FilterSidebar
          categories={CATEGORY_OPTIONS}
          features={FEATURE_OPTIONS}
          moqOptions={MOQ_OPTIONS}
          villages={VILLAGE_OPTIONS}
        />

        <div className="flex flex-col gap-2.5">
          <ListToolbar
            left={
              <div>
                <div className="text-[13px] font-semibold">
                  Kết quả cho: <em className="text-brand-red not-italic">&quot;{query}&quot;</em>
                </div>
                <div className="text-brand-sub mt-0.5 text-xs">248 sản phẩm từ 86 xưởng</div>
              </div>
            }
            sortOptions={SORT_OPTIONS}
            view={view}
            onViewChange={setView}
          />

          <RelatedSearches items={RELATED_SEARCHES} onSelect={runSearch} />

          <div
            className={
              view === 'grid'
                ? 'grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4'
                : 'grid grid-cols-1 gap-2.5'
            }
          >
            {SEARCH_PRODUCTS.map((product) => (
              <ProductListingCard key={product.id} product={product} />
            ))}
          </div>

          <Pagination pages={[1, 2, 3, 4, 5]} totalPages={21} />
        </div>
      </div>
    </div>
  );
}
