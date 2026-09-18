import { Fragment } from 'react';
import type { TrustItem } from './data';

// Matches .footer-mini from the prototype: a row of trust badges separated
// by vertical dividers (hidden below `sm`, where items wrap instead).
export function TrustFooter({ items }: { items: TrustItem[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded border border-[#E5DDD1] bg-white p-3.5 sm:gap-x-8 sm:px-5">
      {items.map((item, i) => (
        <Fragment key={item.title}>
          <div className="flex items-center gap-2">
            <div className="text-xl">{item.icon}</div>
            <div>
              <strong className="block text-xs font-semibold text-[#2A2420]">{item.title}</strong>
              <span className="text-[11px] text-[#6B6058]">{item.sub}</span>
            </div>
          </div>
          {i < items.length - 1 && <div className="hidden h-[30px] w-px bg-[#E5DDD1] sm:block" />}
        </Fragment>
      ))}
    </div>
  );
}
