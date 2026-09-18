'use client';

import { useState } from 'react';
import { useToggleSet } from '@/lib/use-toggle-set';
import type { CountedOption } from './data';

// Matches .sb/.fsec from the prototype's left filter panel. All state here
// is cosmetic, same as the original which never re-filters #products-grid.
export function CategoryFilterSidebar({
  villages,
  moqOptions,
  featureOptions,
}: {
  villages: CountedOption[];
  moqOptions: string[];
  featureOptions: string[];
}) {
  const [checkedVillages, toggleVillage] = useToggleSet(villages[0] ? [villages[0].label] : []);
  const [moq, setMoq] = useState<string | null>(null);
  const [checkedFeatures, toggleFeature] = useToggleSet(['Xưởng xác minh']);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');

  return (
    <div className="border-brand-border overflow-hidden rounded border bg-white">
      <div className="border-brand-border border-b bg-[#FAFAFA] px-3.5 py-2.5 text-[13px] font-bold">
        Lọc sản phẩm
      </div>

      <div className="border-brand-border border-b px-3.5 py-2.5">
        <div className="mb-1.5 text-xs font-semibold">Làng nghề</div>
        <div className="flex flex-col gap-1">
          {villages.map((v) => (
            <label
              key={v.label}
              className="text-brand-sub hover:text-brand-ink flex cursor-pointer items-center gap-1.5 text-xs"
            >
              <input
                type="checkbox"
                checked={checkedVillages.has(v.label)}
                onChange={() => toggleVillage(v.label)}
                className="accent-brand-red"
              />
              {v.label}
              <span className="text-brand-light ml-auto text-[10px]">{v.count}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="border-brand-border border-b px-3.5 py-2.5">
        <div className="mb-1.5 text-xs font-semibold">Khoảng giá (đ/cái)</div>
        <div className="mt-1 flex gap-1.5">
          <input
            type="text"
            placeholder="Từ"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            className="border-brand-border min-w-0 flex-1 rounded-[3px] border px-1.5 py-1 text-[11px] outline-none"
          />
          <span className="text-brand-sub self-center">—</span>
          <input
            type="text"
            placeholder="Đến"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            className="border-brand-border min-w-0 flex-1 rounded-[3px] border px-1.5 py-1 text-[11px] outline-none"
          />
        </div>
      </div>

      <div className="border-brand-border border-b px-3.5 py-2.5">
        <div className="mb-1.5 text-xs font-semibold">MOQ tối thiểu</div>
        <div className="flex flex-col gap-1">
          {moqOptions.map((opt) => (
            <label
              key={opt}
              className="text-brand-sub hover:text-brand-ink flex cursor-pointer items-center gap-1.5 text-xs"
            >
              <input
                type="radio"
                name="cat-moq"
                checked={moq === opt}
                onChange={() => setMoq(opt)}
                className="accent-brand-red"
              />
              {opt}
            </label>
          ))}
        </div>
      </div>

      <div className="px-3.5 py-2.5">
        <div className="mb-1.5 text-xs font-semibold">Tính năng</div>
        <div className="flex flex-col gap-1">
          {featureOptions.map((f) => (
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
        <button
          type="button"
          className="bg-brand-red mt-2 w-full rounded-[3px] py-[7px] text-xs font-semibold text-white"
        >
          Áp dụng
        </button>
      </div>
    </div>
  );
}
