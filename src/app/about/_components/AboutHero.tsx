import { ABOUT_STATS } from './data';

// Matches .about-hero from the prototype: dark forest gradient, faded emoji
// watermark, Playfair Display headline (loaded by the page, see page.tsx),
// and a stat strip.
export function AboutHero() {
  return (
    <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0d2418,#1A3A2A)] py-14">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[160px] tracking-[24px] opacity-[.04]">
        🏺🧺🪵
      </div>
      <div className="relative mx-auto max-w-[800px] px-4 text-center">
        <div className="mb-3 text-[11px] font-semibold tracking-[.12em] text-[#C4622D] uppercase">
          Sứ mệnh của chúng tôi
        </div>
        <div className="font-[family-name:var(--font-playfair)] mb-3.5 text-[40px] leading-[1.2] font-semibold text-white">
          Đưa làng nghề Việt Nam ra thế giới
        </div>
        <div className="mx-auto mb-7 max-w-[560px] text-[15px] leading-[1.7] text-white/65">
          LàngNghề.vn kết nối trực tiếp 1.350 làng nghề Hà Nội với người mua sỉ trong và ngoài
          nước — không qua trung gian, giá minh bạch, thanh toán an toàn.
        </div>
        <div className="mx-auto flex max-w-[560px] rounded-[10px] bg-black/20">
          {ABOUT_STATS.map((stat, i) => (
            <div
              key={stat.label}
              className={`flex-1 px-2 py-4 text-center ${i < ABOUT_STATS.length - 1 ? 'border-r border-white/[.08]' : ''}`}
            >
              <div className="font-tight text-[22px] font-bold text-white">{stat.num}</div>
              <div className="mt-0.5 text-[11px] text-white/45">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
