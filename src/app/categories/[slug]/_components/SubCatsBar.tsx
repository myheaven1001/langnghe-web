'use client';

import { useState } from 'react';
import type { CountedOption } from './data';

// Matches .sub-cats-bar from the prototype: a horizontally scrollable tab
// strip, one active at a time (cosmetic — doesn't re-filter the grid).
export function SubCatsBar({ items }: { items: CountedOption[] }) {
  const [active, setActive] = useState(0);

  return (
    <div className="border-brand-border border-b bg-white">
      <div className="mx-auto flex max-w-[1200px] gap-0 overflow-x-auto px-4">
        {items.map((item, i) => (
          <button
            key={item.label}
            type="button"
            onClick={() => setActive(i)}
            className={`shrink-0 border-b-2 px-3.5 py-2.5 text-[13px] whitespace-nowrap transition-colors ${
              i === active
                ? 'border-brand-red text-brand-red'
                : 'text-brand-sub hover:text-brand-red hover:border-brand-red border-transparent'
            }`}
          >
            {item.label} ({item.count})
          </button>
        ))}
      </div>
    </div>
  );
}
