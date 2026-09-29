import Link from 'next/link';
import type { HomeCategory } from './queries';

// Dải ngành hàng dưới header — mỗi mục mở trang danh mục thật. Cuộn ngang
// khi không đủ chỗ (mép phải mờ gợi ý còn mục).
export function NavTabs({ categories }: { categories: HomeCategory[] }) {
  return (
    <div className="relative border-t border-black/10 bg-[#9C3D27]">
      <nav className="mx-auto flex max-w-[1200px] [scrollbar-width:thin] overflow-x-auto px-4">
        <span className="shrink-0 border-b-2 border-white bg-black/10 px-3.5 py-[7px] text-[13px] font-medium whitespace-nowrap text-white">
          🏠 Trang chủ
        </span>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/categories/${c.slug}`}
            className="shrink-0 border-b-2 border-transparent px-3.5 py-[7px] text-[13px] font-medium whitespace-nowrap text-white/85 transition-colors hover:border-white hover:bg-black/10 hover:text-white"
          >
            {c.icon} {c.name}
          </Link>
        ))}
        <Link
          href="/rfq/new"
          className="shrink-0 border-b-2 border-transparent px-3.5 py-[7px] text-[13px] font-medium whitespace-nowrap text-white/85 transition-colors hover:border-white hover:bg-black/10 hover:text-white"
        >
          📦 Đặt hàng lớn
        </Link>
      </nav>
      <div className="pointer-events-none absolute top-0 right-0 h-full w-8 bg-[linear-gradient(to_left,#9C3D27,transparent)]" />
    </div>
  );
}
