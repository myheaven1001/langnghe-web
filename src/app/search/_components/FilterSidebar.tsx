'use client';

import { useState } from 'react';
import { useToggleSet } from '@/lib/use-toggle-set';
import type { CountedOption } from './data';

// Matches .sidebar/.sb/.filter-sec from the prototype. All filter state here
// is cosmetic — same as the original, which never actually re-filters
// #productGrid; it's just checkbox/tag/star UI wired up client-side.
export function FilterSidebar({
  categories,
  features,
  moqOptions,
  villages,
}: {
  categories: CountedOption[];
  features: string[];
  moqOptions: string[];
  villages: CountedOption[];
}) {
  const [activeTags, setActiveTags] = useState<string[]>(['Gốm sứ', 'Xác minh']);
  const [checkedCategories, toggleCategory] = useToggleSet(['Gốm sứ']);
  const [checkedFeatures, toggleFeature] = useToggleSet(['Xưởng xác minh']);
  const [checkedVillages, toggleVillage] = useToggleSet();
  const [moq, setMoq] = useState<string | null>(null);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [minRating, setMinRating] = useState(4);

  const applyPricePreset = (min: number, max: number) => {
    setPriceMin(min ? min.toLocaleString('vi-VN') : '');
    setPriceMax(max ? max.toLocaleString('vi-VN') : '');
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="border-brand-border overflow-hidden rounded border bg-white">
        <div className="border-brand-border flex items-center justify-between border-b px-3.5 py-2.5 text-[13px] font-bold">
          Bộ lọc
          <button
            type="button"
            onClick={() => setActiveTags([])}
            className="text-brand-red text-[11px] font-normal"
          >
            Xóa tất cả
          </button>
        </div>

        {activeTags.length > 0 && (
          <div className="border-brand-border flex flex-wrap gap-1.5 border-b px-3.5 py-2">
            {activeTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTags((tags) => tags.filter((t) => t !== tag))}
                className="text-brand-red flex items-center gap-1 rounded bg-[#FFF0F0] px-2 py-[3px] text-[11px] hover:bg-[#FFE0E0]"
              >
                {tag} ✕
              </button>
            ))}
          </div>
        )}

        <div className="border-brand-border border-b px-3.5 py-2.5">
          <div className="mb-1.5 text-xs font-semibold">Ngành hàng</div>
          <div className="flex flex-col gap-1">
            {categories.map((c) => (
              <label
                key={c.label}
                className="text-brand-sub hover:text-brand-ink flex cursor-pointer items-center gap-1.5 py-0.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={checkedCategories.has(c.label)}
                  onChange={() => toggleCategory(c.label)}
                  className="accent-brand-red"
                />
                {c.label}
                <span className="text-brand-light ml-auto text-[10px]">{c.count}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="border-brand-border border-b px-3.5 py-2.5">
          <div className="mb-1.5 text-xs font-semibold">Khoảng giá (đ/cái)</div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="Từ"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              className="border-brand-border min-w-0 flex-1 rounded-[3px] border px-2 py-[5px] text-[11px] outline-none"
            />
            <span className="text-brand-sub">—</span>
            <input
              type="text"
              placeholder="Đến"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              className="border-brand-border min-w-0 flex-1 rounded-[3px] border px-2 py-[5px] text-[11px] outline-none"
            />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyPricePreset(0, 50000)}
              className="text-brand-sub rounded bg-[#FAFAFA] px-2 py-[3px] text-[10px]"
            >
              Dưới 50k
            </button>
            <button
              type="button"
              onClick={() => applyPricePreset(50000, 200000)}
              className="text-brand-sub rounded bg-[#FAFAFA] px-2 py-[3px] text-[10px]"
            >
              50k–200k
            </button>
            <button
              type="button"
              onClick={() => applyPricePreset(200000, 0)}
              className="text-brand-sub rounded bg-[#FAFAFA] px-2 py-[3px] text-[10px]"
            >
              Trên 200k
            </button>
          </div>
        </div>

        <div className="border-brand-border border-b px-3.5 py-2.5">
          <div className="mb-1.5 text-xs font-semibold">MOQ tối thiểu</div>
          <div className="flex flex-col gap-1">
            {moqOptions.map((opt) => (
              <label
                key={opt}
                className="text-brand-sub hover:text-brand-ink flex cursor-pointer items-center gap-1.5 py-0.5 text-xs"
              >
                <input
                  type="radio"
                  name="moq"
                  checked={moq === opt}
                  onChange={() => setMoq(opt)}
                  className="accent-brand-red"
                />
                {opt}
              </label>
            ))}
          </div>
        </div>

        <div className="border-brand-border border-b px-3.5 py-2.5">
          <div className="mb-1.5 text-xs font-semibold">Tính năng</div>
          <div className="flex flex-col gap-1">
            {features.map((f) => (
              <label
                key={f}
                className="text-brand-sub hover:text-brand-ink flex cursor-pointer items-center gap-1.5 py-0.5 text-xs"
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

        <div className="border-brand-border border-b px-3.5 py-2.5">
          <div className="mb-1.5 text-xs font-semibold">Đánh giá từ</div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMinRating(n)}
                aria-label={`${n} sao trở lên`}
                className={`text-[18px] transition-colors ${
                  n <= minRating ? 'text-[#FFB800]' : 'text-brand-border hover:text-[#FFB800]'
                }`}
              >
                ★
              </button>
            ))}
          </div>
          <div className="text-brand-sub mt-1 text-[11px]">{minRating} sao trở lên</div>
        </div>

        <div className="px-3.5 py-2.5">
          <div className="mb-1.5 text-xs font-semibold">Làng nghề</div>
          <div className="mb-1.5 flex flex-col gap-1">
            {villages.map((v) => (
              <label
                key={v.label}
                className="text-brand-sub hover:text-brand-ink flex cursor-pointer items-center gap-1.5 py-0.5 text-xs"
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
          <button
            type="button"
            className="bg-brand-red w-full rounded-[3px] py-[7px] text-xs font-semibold text-white"
          >
            Áp dụng bộ lọc
          </button>
        </div>
      </div>
    </div>
  );
}
