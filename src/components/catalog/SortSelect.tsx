'use client';

import { useRouter } from 'next/navigation';
import { catalogHref, SORTS, type CatalogFilters, type SortValue } from '@/lib/catalog';

// Chọn cách sắp xếp → đổi ?sort= trên URL. "Phù hợp nhất" chỉ có nghĩa khi
// có từ khoá; không có từ khoá thì server tự xếp theo mới nhất.
export function SortSelect({ basePath, filters }: { basePath: string; filters: CatalogFilters }) {
  const router = useRouter();
  const options = filters.q ? SORTS : SORTS.filter((s) => s.value !== 'relevance');
  const value = !filters.q && filters.sort === 'relevance' ? 'newest' : filters.sort;

  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-brand-sub">Sắp xếp:</span>
      <select
        value={value}
        onChange={(e) =>
          router.push(catalogHref(basePath, filters, { sort: e.target.value as SortValue }), {
            scroll: false,
          })
        }
        className="border-brand-border rounded border bg-white px-2 py-1 text-xs outline-none"
      >
        {options.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
