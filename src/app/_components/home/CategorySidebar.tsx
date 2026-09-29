'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { HomeCategory } from './queries';

// Danh mục thật (bảng categories, is_active) → trang /categories/[slug].
// Màn hình lớn: cột bên trái; nhỏ hơn: khối gập/mở.
export function CategorySidebar({ categories }: { categories: HomeCategory[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const list = categories.map((c) => (
    <Link
      key={c.id}
      href={`/categories/${c.slug}`}
      className="flex items-center gap-2 border-b border-[#E5DDD1] px-3.5 py-[9px] text-[13px] font-semibold text-[#2A2420] transition-colors last:border-b-0 hover:bg-[#FBF3EC] hover:text-[#B5482E]"
    >
      <span className="text-[15px]">{c.icon}</span>
      {c.name}
    </Link>
  ));

  return (
    <>
      <aside className="hidden h-fit overflow-hidden rounded border border-[#E5DDD1] bg-white lg:block">
        <div className="bg-[#B5482E] px-3.5 py-2.5 text-[13px] font-semibold text-white">
          📋 Danh mục sản phẩm
        </div>
        {list}
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
        {mobileOpen && list}
      </div>
    </>
  );
}
