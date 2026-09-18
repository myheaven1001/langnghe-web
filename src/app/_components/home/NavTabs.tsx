'use client';

import { useState } from 'react';
import type { NavTabItem } from './data';

// Matches .nav-tabs from the prototype: horizontally scrollable tab strip,
// active tab tracked client-side only (no routing yet — the tabs don't map
// to real category pages).
export function NavTabs({ tabs }: { tabs: NavTabItem[] }) {
  const [active, setActive] = useState(0);

  return (
    <div className="relative border-t border-black/10 bg-[#9C3D27]">
      <div className="mx-auto flex max-w-[1200px] gap-0 overflow-x-auto px-4 [scrollbar-width:thin]">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setActive(i)}
            className={`shrink-0 border-b-2 px-3.5 py-[7px] text-[13px] font-medium whitespace-nowrap transition-colors ${
              i === active
                ? 'border-white bg-black/10 text-white'
                : 'border-transparent text-white/85 hover:border-white hover:bg-black/10 hover:text-white'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>
      {/* Hints that the tab strip scrolls horizontally once it overflows the
          viewport. Not tied to a breakpoint: the tabs can overflow anywhere
          below ~1300px (their natural width), well past the `sm`/mobile
          range, and the gradient is a no-op visually when there's no
          overflow since it fades to the same background color. */}
      <div className="pointer-events-none absolute top-0 right-0 h-full w-8 bg-[linear-gradient(to_left,#9C3D27,transparent)]" />
    </div>
  );
}
