import type { QuickCategoryItem } from './data';

// Matches .quick-cats/.qcat-grid from the prototype: 8 columns on desktop,
// 4 on smaller screens.
export function QuickCategories({ items }: { items: QuickCategoryItem[] }) {
  return (
    <div className="rounded border border-[#E5DDD1] bg-white p-3.5">
      <div className="mb-3 text-[13px] font-bold text-[#2A2420]">Ngành hàng phổ biến</div>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5 lg:grid-cols-8">
        {items.map((c) => (
          <a
            key={c.label}
            href="#"
            className="group flex flex-col items-center gap-1 rounded px-1 py-2 text-center hover:bg-[#FFF5F5]"
          >
            <div className="text-[22px] lg:text-[26px]">{c.icon}</div>
            <div className="text-[11px] leading-tight text-[#6B6058] group-hover:text-[#B5482E]">
              {c.label}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
