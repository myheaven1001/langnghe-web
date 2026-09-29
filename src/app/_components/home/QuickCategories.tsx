import Link from 'next/link';
import type { HomeCategory } from './queries';

// Lưới ngành hàng (icon + tên) → trang danh mục thật. 5 cột trên điện thoại,
// 10 cột trên màn hình lớn.
export function QuickCategories({ categories }: { categories: HomeCategory[] }) {
  if (categories.length === 0) return null;
  return (
    <div className="rounded border border-[#E5DDD1] bg-white p-3.5">
      <div className="mb-3 text-[13px] font-bold text-[#2A2420]">Ngành hàng</div>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5 lg:grid-cols-10">
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/categories/${c.slug}`}
            className="group flex flex-col items-center gap-1 rounded px-1 py-2 text-center hover:bg-[#FFF5F5]"
          >
            <div className="text-[22px] lg:text-[26px]">{c.icon}</div>
            <div className="text-[11px] leading-tight text-[#6B6058] group-hover:text-[#B5482E]">
              {c.name}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
