'use client';

import { useState } from 'react';
import type { CategoryGroup } from './data';

// Matches .sidebar/.sb-cat accordion from the prototype: a single category
// can be open at a time, first one open by default. The prototype hid this
// entirely below `lg`; here it instead collapses into a toggleable panel so
// mobile/tablet users keep a way to browse categories from the homepage.
export function CategorySidebar({ groups }: { groups: CategoryGroup[] }) {
  const [openLabel, setOpenLabel] = useState<string | null>(groups[0]?.label ?? null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const groupList = groups.map((group) => {
    const open = group.label === openLabel;
    return (
      <div key={group.label} className="border-b border-[#E5DDD1] last:border-b-0">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpenLabel(open ? null : group.label)}
          className="flex w-full items-center gap-2 px-3.5 py-[9px] text-left text-[13px] font-semibold text-[#2A2420] transition-colors hover:bg-[#FBF3EC] hover:text-[#B5482E]"
        >
          <span className="text-[15px]">{group.icon}</span>
          {group.label}
        </button>
        {open && (
          <div className="pb-2 pl-9">
            {group.subcategories.map((sub) => (
              <a
                key={sub}
                href="#"
                className="block py-[3px] text-xs text-[#6B6058] hover:text-[#B5482E]"
              >
                {sub}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  });

  return (
    <>
      <aside className="hidden h-fit overflow-hidden rounded border border-[#E5DDD1] bg-white lg:block">
        <div className="bg-[#B5482E] px-3.5 py-2.5 text-[13px] font-semibold text-white">
          📋 Danh mục sản phẩm
        </div>
        {groupList}
      </aside>

      <div className="overflow-hidden rounded border border-[#E5DDD1] bg-white lg:hidden">
        <button
          type="button"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
          className="flex w-full items-center justify-between bg-[#B5482E] px-3.5 py-2.5 text-[13px] font-semibold text-white"
        >
          <span>📋 Danh mục sản phẩm</span>
          <span className={`transition-transform ${mobileOpen ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {mobileOpen && groupList}
      </div>
    </>
  );
}
