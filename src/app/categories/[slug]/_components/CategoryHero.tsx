import Link from 'next/link';
import { CATEGORY } from './data';

// Matches .cat-hero from the prototype: dark forest-green gradient banner
// with a giant faded emoji watermark, its own light-on-dark breadcrumb,
// name, subtitle and stat row.
export function CategoryHero() {
  return (
    <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0d2418_0%,#1A3A2A_100%)] py-7">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[100px] tracking-[16px] opacity-[.06]">
        {CATEGORY.emoji}
      </div>
      <div className="relative mx-auto max-w-[1200px] px-4">
        <div className="mb-2.5 flex items-center gap-1.5 text-xs text-white/55">
          <Link href="/" className="text-white/70">
            Trang chủ
          </Link>
          <span>›</span>
          <span className="text-white">{CATEGORY.name}</span>
        </div>
        <div className="font-tight mb-1.5 text-[28px] font-bold text-white">
          {CATEGORY.emoji} {CATEGORY.name}
        </div>
        <div className="mb-4 text-[13px] text-white/60">{CATEGORY.sub}</div>
        <div className="flex gap-5">
          {CATEGORY.stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-tight text-lg font-bold text-white">{stat.num}</div>
              <div className="mt-0.5 text-[11px] text-white/50">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
