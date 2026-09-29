import Link from 'next/link';
import type { HomeStats } from './queries';

// Banner chính (số liệu thật từ public_stats) + các ô phụ. Màn hình lớn: 1
// ô lớn + 2 cột ô nhỏ; nhỏ hơn: ô lớn ở trên, các ô phụ trượt ngang.
const SIDE_BANNERS = [
  {
    label: 'Mua sỉ theo yêu cầu',
    title: 'Gửi RFQ, xưởng báo giá',
    href: '/rfq/new',
    className: 'bg-[linear-gradient(135deg,#8B1A1A,#C4622D)]',
  },
  {
    label: 'Đặc sản Bát Tràng',
    title: 'Gốm sứ giá xưởng',
    href: '/categories/gom-su',
    className: 'bg-[linear-gradient(135deg,#2d5016,#4a8025)]',
  },
  {
    label: 'Làng nghề Chương Mỹ',
    title: 'Mây tre đan',
    href: '/categories/may-tre-dan',
    className: 'bg-[linear-gradient(135deg,#3d1a00,#7a3600)]',
  },
  {
    label: 'Dành cho xưởng',
    title: 'Mở gian hàng miễn phí',
    href: '/register?role=supplier',
    className: 'bg-[linear-gradient(135deg,#1a1a5e,#2d2d8e)]',
  },
];

function statLine(stats: HomeStats | null) {
  if (!stats) return 'Giá xưởng · Mua sỉ trực tiếp · Giao toàn quốc';
  const parts = [
    stats.suppliers > 0 && `${stats.suppliers.toLocaleString('vi-VN')} xưởng`,
    stats.villages > 0 && `${stats.villages.toLocaleString('vi-VN')} làng nghề`,
    stats.products > 0 && `${stats.products.toLocaleString('vi-VN')} sản phẩm`,
  ].filter(Boolean);
  return parts.length > 0
    ? `${parts.join(' · ')} · Giá xưởng`
    : 'Giá xưởng · Mua sỉ trực tiếp · Giao toàn quốc';
}

export function HeroBanners({ stats }: { stats: HomeStats | null }) {
  return (
    <div className="grid grid-cols-1 gap-2 lg:h-[200px] lg:grid-cols-[2fr_1fr_1fr]">
      <Link
        href="/search"
        className="relative flex min-h-[150px] flex-col justify-end overflow-hidden rounded-md bg-[linear-gradient(135deg,#1a1a2e_0%,#16213e_50%,#0f3460_100%)] p-5"
      >
        <div className="pointer-events-none absolute top-1/2 right-[-10px] -translate-y-1/2 text-[60px] tracking-[8px] opacity-[.15]">
          🏺🧺🪵🎋🪔
        </div>
        <div className="font-tight relative mb-1.5 text-[22px] leading-tight font-bold text-white">
          Chợ sỉ làng nghề
          <br />
          Việt Nam
        </div>
        <div className="relative text-xs text-white/70">{statLine(stats)}</div>
      </Link>

      {/* Dưới lg: một hàng trượt ngang; từ lg: 2 cột, mỗi cột 2 ô. */}
      <div className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 lg:contents">
        {[SIDE_BANNERS.slice(0, 2), SIDE_BANNERS.slice(2)].map((column, ci) => (
          <div key={ci} className="flex gap-2 lg:flex-col">
            {column.map((b) => (
              <Link
                key={b.title}
                href={b.href}
                className={`flex min-h-[84px] w-[62vw] shrink-0 snap-start flex-col justify-end rounded-md p-3 sm:w-[240px] lg:min-h-0 lg:w-auto lg:flex-1 ${b.className}`}
              >
                <div className="text-[10px] font-bold tracking-wide text-white/70 uppercase">
                  {b.label}
                </div>
                <div className="mt-0.5 text-sm font-bold text-white">{b.title}</div>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
