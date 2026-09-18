'use client';

import { useState } from 'react';

// Matches .toolbar-left/.cat-chip from the prototype — the left half of the
// toolbar, passed as ListToolbar's `left` content.
export function ShopToolbarChips({ chips }: { chips: string[] }) {
  const [active, setActive] = useState(0);

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      {chips.map((chip, i) => (
        <button
          key={chip}
          type="button"
          onClick={() => setActive(i)}
          className={`rounded border px-3 py-[5px] text-xs font-medium whitespace-nowrap transition-colors ${
            i === active
              ? 'bg-brand-red border-brand-red text-white'
              : 'border-brand-border text-brand-sub hover:bg-brand-red hover:border-brand-red hover:text-white'
          }`}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
