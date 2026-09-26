import type { Metadata } from 'next';
import Link from 'next/link';
import { inter, interTight } from '@/lib/fonts';
import { PublicHeader } from '@/components/ui';

// Ported from error_404_page.html (only the "404" tab of that prototype —
// the file also sketches a 500 page and an empty-search-results state as
// design references, neither of which the roadmap maps to a route here).
// Root app/not-found.tsx handles both `notFound()` calls and unmatched
// URLs app-wide.
export const metadata: Metadata = {
  title: 'Không tìm thấy trang — LàngNghề.vn',
};

const SUGGESTED_CATEGORIES = [
  { icon: '🏺', name: 'Gốm sứ', count: '248 sản phẩm', slug: 'gom-su' },
  { icon: '🧺', name: 'Mây tre đan', count: '134 sản phẩm', slug: 'may-tre-dan' },
  { icon: '🪵', name: 'Đồ gỗ', count: '89 sản phẩm', slug: 'do-go' },
  { icon: '🎋', name: 'Lụa & thêu', count: '56 sản phẩm', slug: 'lua-theu' },
];

export default function NotFound() {
  return (
    <div
      className={`${inter.variable} ${interTight.variable} min-h-screen bg-[#F5F5F5] font-[family-name:var(--font-inter)] text-[13px] text-[#1F1F1F]`}
    >
      <PublicHeader showTopbar={false} searchPlaceholder="Tìm sản phẩm, nhà cung cấp..." />

      <div className="flex flex-col items-center px-5 py-16 text-center">
        <div className="mb-4 text-[56px]">🔍</div>
        <div className="font-tight mb-2 text-[96px] leading-none font-bold text-[#E8E8E8]">
          404
        </div>
        <div className="mb-2 text-[22px] font-bold">Trang không tìm thấy</div>
        <div className="text-brand-sub mb-6 max-w-[400px] text-sm leading-[1.7]">
          Trang bạn tìm kiếm có thể đã bị xóa, đổi địa chỉ, hoặc chưa bao giờ tồn tại. Thử tìm kiếm
          sản phẩm bạn cần bên dưới.
        </div>

        <form
          action="/search"
          method="get"
          className="border-brand-border mb-6 flex w-full max-w-[400px] overflow-hidden rounded-lg border-[1.5px] bg-white"
        >
          <input
            type="text"
            name="q"
            placeholder="Tìm gốm sứ, mây tre, đồ gỗ..."
            className="min-w-0 flex-1 border-none px-3.5 py-2.5 text-[13px] outline-none"
          />
          <button type="submit" className="bg-brand-red px-4 text-[13px] text-white">
            Tìm
          </button>
        </form>

        <div className="mb-8 flex flex-wrap justify-center gap-2.5">
          <Link
            href="/"
            className="bg-brand-red hover:bg-brand-red-dark rounded-md px-6 py-2.5 text-[13px] font-semibold text-white transition-colors"
          >
            🏠 Về trang chủ
          </Link>
          <Link
            href="/categories/gom-su"
            className="border-brand-border hover:border-brand-ink rounded-md border-[1.5px] px-6 py-2.5 text-[13px] font-semibold transition-colors"
          >
            🏺 Xem danh mục
          </Link>
          <button
            type="button"
            className="border-brand-border hover:border-brand-ink rounded-md border-[1.5px] px-6 py-2.5 text-[13px] font-semibold transition-colors"
          >
            💬 Liên hệ hỗ trợ
          </button>
        </div>

        <div className="w-full max-w-[800px]">
          <div className="text-brand-sub mb-3 text-[13px] font-semibold tracking-[.06em] uppercase">
            Ngành hàng phổ biến
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SUGGESTED_CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                href={`/categories/${cat.slug}`}
                className="border-brand-border hover:border-brand-red rounded-md border bg-white p-3 text-center transition-[border-color,transform] hover:-translate-y-0.5"
              >
                <div className="mb-1.5 text-[28px]">{cat.icon}</div>
                <div className="text-xs font-semibold">{cat.name}</div>
                <div className="text-brand-sub mt-0.5 text-[11px]">{cat.count}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
