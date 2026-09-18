'use client';

import { useState } from 'react';
import type { SubCategoryCard } from './data';

// Matches .subcat-grid from the prototype: clicking a card highlights it
// (cosmetic single-select, same as the original's setScat2).
export function SubCategoryCards({ cards }: { cards: SubCategoryCard[] }) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => setActive(card.id)}
          className={`border-brand-border flex items-center gap-2.5 rounded-md border bg-white p-3 text-left transition-colors ${
            active === card.id ? 'border-brand-red bg-[#FFF5F5]' : 'hover:border-brand-red hover:bg-[#FFF5F5]'
          }`}
        >
          <div className="shrink-0 text-2xl">{card.icon}</div>
          <div>
            <div className="text-brand-ink text-xs font-semibold">{card.name}</div>
            <div className="text-brand-sub mt-0.5 text-[11px]">{card.count} sản phẩm</div>
          </div>
        </button>
      ))}
    </div>
  );
}
