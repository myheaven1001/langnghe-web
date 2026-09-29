'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { catalogHref, type CatalogFacet, type CatalogFilters as Filters } from '@/lib/catalog';

const MOQ_PRESETS = [
  { value: 50, label: 'Tối đa 50' },
  { value: 100, label: 'Tối đa 100' },
  { value: 500, label: 'Tối đa 500' },
];

const PRICE_PRESETS = [
  { min: null, max: 50000, label: 'Dưới 50k' },
  { min: 50000, max: 200000, label: '50k – 200k' },
  { min: 200000, max: null, label: 'Trên 200k' },
];

// Bộ lọc danh sách sản phẩm. Mọi thay đổi → đổi URL (router.push), trang
// server đọc lại dữ liệu. Màn hình lớn: cột bên trái; nhỏ hơn: nút "Bộ lọc"
// mở ngăn kéo từ dưới lên.
export function CatalogFilters({
  basePath,
  filters,
  facets,
  showCategories = true,
}: {
  basePath: string;
  filters: Filters;
  facets: CatalogFacet[];
  showCategories?: boolean;
}) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [minText, setMinText] = useState(filters.min ? String(filters.min) : '');
  const [maxText, setMaxText] = useState(filters.max ? String(filters.max) : '');

  // Đồng bộ ô giá khi URL đổi (Back/Forward, bấm mức giá có sẵn).
  const [synced, setSynced] = useState(`${filters.min}-${filters.max}`);
  if (synced !== `${filters.min}-${filters.max}`) {
    setSynced(`${filters.min}-${filters.max}`);
    setMinText(filters.min ? String(filters.min) : '');
    setMaxText(filters.max ? String(filters.max) : '');
  }

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const go = (patch: Parameters<typeof catalogHref>[2]) => {
    setDrawerOpen(false);
    router.push(catalogHref(basePath, filters, patch), { scroll: false });
  };

  const activeCount =
    (showCategories && filters.cat ? 1 : 0) +
    (filters.min || filters.max ? 1 : 0) +
    (filters.moq ? 1 : 0) +
    (filters.verified ? 1 : 0);

  const panel = (
    <div className="border-brand-border overflow-hidden rounded border bg-white">
      <div className="border-brand-border flex items-center justify-between border-b px-3.5 py-2.5 text-[13px] font-bold">
        Bộ lọc
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => go({ cat: null, min: null, max: null, moq: null, verified: false })}
            className="text-brand-red text-[11px] font-normal"
          >
            Xóa tất cả
          </button>
        )}
      </div>

      {showCategories && facets.length > 0 && (
        <div className="border-brand-border border-b px-3.5 py-2.5">
          <div className="mb-1.5 text-xs font-semibold">Ngành hàng</div>
          <div className="flex flex-col gap-0.5">
            {facets.map((f) => {
              const active = filters.cat === f.slug;
              return (
                <button
                  key={f.slug}
                  type="button"
                  onClick={() => go({ cat: active ? null : f.slug })}
                  className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs ${
                    active
                      ? 'text-brand-red bg-[#FFF0F0] font-semibold'
                      : 'text-brand-sub hover:text-brand-ink'
                  }`}
                >
                  <span>{f.icon}</span>
                  {f.name}
                  <span className="text-brand-light ml-auto text-[10px]">{f.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <form
        className="border-brand-border border-b px-3.5 py-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          go({ min: Number(minText) || null, max: Number(maxText) || null });
        }}
      >
        <div className="mb-1.5 text-xs font-semibold">Giá thấp nhất (đ/cái)</div>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Từ"
            value={minText}
            onChange={(e) => setMinText(e.target.value)}
            className="border-brand-border min-w-0 flex-1 rounded-[3px] border px-2 py-[5px] text-xs outline-none"
          />
          <span className="text-brand-sub">—</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Đến"
            value={maxText}
            onChange={(e) => setMaxText(e.target.value)}
            className="border-brand-border min-w-0 flex-1 rounded-[3px] border px-2 py-[5px] text-xs outline-none"
          />
          <button
            type="submit"
            className="bg-brand-red rounded-[3px] px-2 py-[5px] text-[11px] font-semibold text-white"
          >
            Áp dụng
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((p) => {
            const active = filters.min === p.min && filters.max === p.max;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => go({ min: p.min, max: p.max })}
                className={`rounded px-2 py-[3px] text-[11px] ${
                  active
                    ? 'text-brand-red bg-[#FFF0F0] font-semibold'
                    : 'text-brand-sub bg-[#FAFAFA]'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </form>

      <div className="border-brand-border border-b px-3.5 py-2.5">
        <div className="mb-1.5 text-xs font-semibold">Số lượng đặt tối thiểu (MOQ)</div>
        <div className="flex flex-wrap gap-1.5">
          {MOQ_PRESETS.map((m) => {
            const active = filters.moq === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => go({ moq: active ? null : m.value })}
                className={`rounded px-2 py-[3px] text-[11px] ${
                  active
                    ? 'text-brand-red bg-[#FFF0F0] font-semibold'
                    : 'text-brand-sub bg-[#FAFAFA]'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="text-brand-ink flex cursor-pointer items-center gap-2 px-3.5 py-2.5 text-xs">
        <input
          type="checkbox"
          checked={filters.verified}
          onChange={(e) => go({ verified: e.target.checked })}
          className="accent-brand-red"
        />
        Chỉ xưởng đã xác minh
      </label>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block">{panel}</aside>

      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="border-brand-border flex items-center justify-center gap-1.5 rounded border bg-white py-2 text-[13px] font-semibold lg:hidden"
      >
        ⚙️ Bộ lọc
        {activeCount > 0 && (
          <span className="bg-brand-red rounded-full px-1.5 text-[11px] text-white">
            {activeCount}
          </span>
        )}
      </button>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Bộ lọc"
        >
          <button
            type="button"
            aria-label="Đóng bộ lọc"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-xl bg-[#F5F5F5] p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-bold">Bộ lọc</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="text-brand-sub px-2 text-lg"
              >
                ✕
              </button>
            </div>
            {panel}
          </div>
        </div>
      )}
    </>
  );
}
