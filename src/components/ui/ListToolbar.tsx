'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

// Matches .toolbar from the search_results/category_listing prototypes:
// arbitrary info on the left (result count, category title, ...), sort
// select + grid/list toggle on the right. Sort is a no-op (the originals
// just console.log it) since results stay hardcoded.
export function ListToolbar({
  left,
  /** e.g. a "56 sản phẩm" result count — rendered just before "Sắp xếp:"
   * (see src/app/shops/[id], where `left` is already taken by category
   * chips). */
  rightExtra,
  sortOptions,
  view,
  onViewChange,
}: {
  left: ReactNode;
  rightExtra?: ReactNode;
  sortOptions: string[];
  view: 'grid' | 'list';
  onViewChange: (view: 'grid' | 'list') => void;
}) {
  const [sort, setSort] = useState(sortOptions[0]);

  return (
    <div className="border-brand-border flex flex-wrap items-center gap-2.5 rounded border bg-white px-3.5 py-2.5">
      {left}

      <div className="ml-auto flex items-center gap-1.5">
        {rightExtra}
        <span className="text-brand-sub text-xs">Sắp xếp:</span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="border-brand-border rounded border bg-white px-2.5 py-[5px] text-xs outline-none"
        >
          {sortOptions.map((opt) => (
            <option key={opt}>{opt}</option>
          ))}
        </select>
        <div className="border-brand-border flex overflow-hidden rounded border">
          <button
            type="button"
            onClick={() => onViewChange('grid')}
            aria-label="Xem dạng lưới"
            className={`px-2.5 py-[5px] text-sm ${
              view === 'grid' ? 'bg-brand-red text-white' : 'text-brand-sub'
            }`}
          >
            ⊞
          </button>
          <button
            type="button"
            onClick={() => onViewChange('list')}
            aria-label="Xem dạng danh sách"
            className={`px-2.5 py-[5px] text-sm ${
              view === 'list' ? 'bg-brand-red text-white' : 'text-brand-sub'
            }`}
          >
            ☰
          </button>
        </div>
      </div>
    </div>
  );
}
