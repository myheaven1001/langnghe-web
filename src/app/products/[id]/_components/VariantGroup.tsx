'use client';

import { useState } from 'react';

// Matches .variants-section/.var-opt from the prototype: an independent
// single-select chip group (color, size, ...). Selection doesn't feed into
// the price/total — same as the original, where size deltas like "+8.000đ"
// are label-only and never actually applied.
export function VariantGroup({ title, options, defaultIndex }: { title: string; options: string[]; defaultIndex: number }) {
  const [active, setActive] = useState(defaultIndex);

  return (
    <div className="mb-3.5">
      <div className="text-brand-ink mb-1.5 text-xs font-semibold">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt, i) => (
          <button
            key={opt}
            type="button"
            onClick={() => setActive(i)}
            className={`rounded border px-3 py-[5px] text-xs transition-colors ${
              i === active
                ? 'border-brand-red text-brand-red bg-[#FFF8F7]'
                : 'border-brand-border hover:border-brand-red hover:text-brand-red'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
