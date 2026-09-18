'use client';

import { useState } from 'react';
import { useToggleSet } from '@/lib/use-toggle-set';
import type { CountedOption } from './data';

// Matches the "Lọc sản phẩm" sidebar card from the prototype. Filter state
// here is cosmetic — same as search/category listing, the grid below isn't
// actually re-filtered.
export function ShopFilterSidebar({
  categories,
  features,
  moqOptions,
}: {
  categories: CountedOption[];
  features: string[];
  moqOptions: string[];
}) {
  const [checkedCategories, toggleCategory] = useToggleSet(
    categories[0] ? [categories[0].label] : [],
  );
  const [checkedFeatures, toggleFeature] = useToggleSet();
  const [moq, setMoq] = useState<string | null>(null);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');

  return (
    <div className="border-brand-border overflow-hidden rounded border bg-white">
      <div className="border-brand-border flex items-center gap-1.5 border-b px-3.5 py-2.5 text-[13px] font-bold">
        <span className="bg-brand-red inline-block h-3.5 w-[3px] rounded-sm" />
        Lọc sản phẩm
      </div>

      <div className="border-brand-border border-b px-3.5 py-2.5">
        <div className="mb-2 text-xs font-semibold">Danh mục</div>
        <div className="flex flex-col gap-1">
          {categories.map((c) => (
            <label
              key={c.label}
              className="text-brand-sub hover:text-brand-ink flex cursor-pointer items-center gap-1.5 text-xs"
            >
              <input
                type="checkbox"
                checked={checkedCategories.has(c.label)}
                onChange={() => toggleCategory(c.label)}
                className="accent-brand-red"
              />
              {c.label} ({c.count})
            </label>
          ))}
        </div>
      </div>

      <div className="border-brand-border border-b px-3.5 py-2.5">
        <div className="mb-2 text-xs font-semibold">Khoảng giá (đ/cái)</div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="Từ"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            className="border-brand-border min-w-0 flex-1 rounded-[3px] border px-2 py-1 text-[11px] outline-none"
          />
          <span className="text-brand-sub">—</span>
          <input
            type="text"
            placeholder="Đến"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            className="border-brand-border min-w-0 flex-1 rounded-[3px] border px-2 py-1 text-[11px] outline-none"
          />
        </div>
      </div>

      <div className="border-brand-border border-b px-3.5 py-2.5">
        <div className="mb-2 text-xs font-semibold">Tính năng</div>
        <div className="flex flex-col gap-1">
          {features.map((f) => (
            <label
              key={f}
              className="text-brand-sub hover:text-brand-ink flex cursor-pointer items-center gap-1.5 text-xs"
            >
              <input
                type="checkbox"
                checked={checkedFeatures.has(f)}
                onChange={() => toggleFeature(f)}
                className="accent-brand-red"
              />
              {f}
            </label>
          ))}
        </div>
      </div>

      <div className="px-3.5 py-2.5">
        <div className="mb-2 text-xs font-semibold">MOQ tối thiểu</div>
        <div className="flex flex-col gap-1">
          {moqOptions.map((opt) => (
            <label
              key={opt}
              className="text-brand-sub hover:text-brand-ink flex cursor-pointer items-center gap-1.5 text-xs"
            >
              <input
                type="radio"
                name="shop-moq"
                checked={moq === opt}
                onChange={() => setMoq(opt)}
                className="accent-brand-red"
              />
              {opt}
            </label>
          ))}
        </div>
        <button
          type="button"
          className="bg-brand-red mt-2.5 w-full rounded-[3px] py-[7px] text-xs font-semibold text-white"
        >
          Áp dụng bộ lọc
        </button>
      </div>
    </div>
  );
}
