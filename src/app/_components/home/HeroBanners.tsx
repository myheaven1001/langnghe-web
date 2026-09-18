// Matches .banner-row/.banner-main/.banner-side from the prototype: one big
// tile + two side columns of two smaller tiles each. Stacks to a single
// column below `lg`, with the side columns going row-wise between `sm` and
// `lg` (matching the prototype's tablet-only `.banner-side{flex-direction:row}`).
const SIDE_BANNERS_LEFT = [
  {
    label: 'Đặc sản Bát Tràng',
    title: 'Gốm sỉ từ 27.000đ',
    className: 'bg-[linear-gradient(135deg,#2d5016,#4a8025)]',
  },
  {
    label: 'Ưu đãi tháng này',
    title: 'Gửi RFQ miễn phí',
    className: 'bg-[linear-gradient(135deg,#8B1A1A,#C4622D)]',
  },
];

const SIDE_BANNERS_RIGHT = [
  {
    label: 'Mới ra mắt',
    title: 'Lụa Vạn Phúc OEM',
    className: 'bg-[linear-gradient(135deg,#1a1a5e,#2d2d8e)]',
  },
  {
    label: 'Bestseller',
    title: 'Mây tre Chương Mỹ',
    className: 'bg-[linear-gradient(135deg,#3d1a00,#7a3600)]',
  },
];

function SideBannerColumn({ items }: { items: typeof SIDE_BANNERS_LEFT }) {
  return (
    <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:flex-col">
      {items.map((b) => (
        <a
          key={b.title}
          href="#"
          className={`flex min-h-[84px] flex-1 flex-col justify-end rounded-md p-3 lg:min-h-0 ${b.className}`}
        >
          <div className="text-[10px] font-bold tracking-wide text-white/70 uppercase">
            {b.label}
          </div>
          <div className="mt-0.5 text-sm font-bold text-white">{b.title}</div>
        </a>
      ))}
    </div>
  );
}

export function HeroBanners() {
  return (
    <div className="grid grid-cols-1 gap-2 lg:h-[200px] lg:grid-cols-[2fr_1fr_1fr]">
      <a
        href="#"
        className="relative flex min-h-[160px] flex-col justify-end overflow-hidden rounded-md bg-[linear-gradient(135deg,#1a1a2e_0%,#16213e_50%,#0f3460_100%)] p-5"
      >
        <div className="pointer-events-none absolute top-1/2 right-[-10px] -translate-y-1/2 text-[60px] tracking-[8px] opacity-[.15]">
          🏺🧺🪵🎋🪔
        </div>
        <div className="relative mb-2 w-fit rounded-sm bg-[#C97A3D] px-2 py-0.5 text-[10px] font-bold text-white">
          🔥 KHAI TRƯƠNG
        </div>
        <div className="font-tight relative mb-1.5 text-[22px] leading-tight font-bold text-white">
          Chợ sỉ làng nghề
          <br />
          Việt Nam #1
        </div>
        <div className="relative text-xs text-white/65">
          1.200+ xưởng · Giá xưởng · Giao toàn quốc
        </div>
      </a>
      <SideBannerColumn items={SIDE_BANNERS_LEFT} />
      <SideBannerColumn items={SIDE_BANNERS_RIGHT} />
    </div>
  );
}
