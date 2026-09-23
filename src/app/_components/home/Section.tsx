import type { ReactNode } from 'react';
import Link from 'next/link';

// Matches .product-row/.rec-section + .section-hdr from the prototype: a
// bordered white block with a title (colored dot + label), an optional
// countdown, and a "see all" link. moreHref has no sensible universal
// default (it depends what the section is "see all" *of*) — callers in
// page.tsx now always pass one instead of relying on a "#" fallback.
export function Section({
  title,
  moreHref,
  moreLabel = 'Xem tất cả →',
  countdown,
  children,
  className = '',
}: {
  title: ReactNode;
  moreHref: string;
  moreLabel?: string;
  countdown?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded border border-[#E5DDD1] bg-white ${className}`}>
      <div className="flex items-center justify-between border-b border-[#E5DDD1] px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-[#2A2420]">
          <span className="h-4 w-1 rounded-sm bg-[#B5482E]" />
          {title}
          {countdown && (
            <span className="flex items-center gap-1 text-xs font-normal text-[#6B6058]">
              Còn lại:{' '}
              <span className="font-tight rounded-[3px] bg-[#2A2420] px-1.5 py-0.5 text-[13px] font-bold text-white">
                {countdown}
              </span>
            </span>
          )}
        </div>
        <Link href={moreHref} className="text-xs text-[#3D6B94] hover:underline">
          {moreLabel}
        </Link>
      </div>
      {children}
    </div>
  );
}
