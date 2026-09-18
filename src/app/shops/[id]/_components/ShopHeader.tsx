'use client';

import { useState } from 'react';
import type { ShopBadge, ShopMetric } from './data';

const BADGE_CLASSNAMES: Record<ShopBadge['tone'], string> = {
  verified: 'bg-[rgba(0,166,80,.2)] text-[#4DDB88] border border-[rgba(0,166,80,.3)]',
  premium: 'bg-[rgba(255,185,0,.15)] text-[#FFD700] border border-[rgba(255,185,0,.3)]',
  export: 'bg-[rgba(22,119,255,.15)] text-[#69B1FF] border border-[rgba(22,119,255,.3)]',
};

// Matches .shop-header from the prototype: dark gradient banner with
// avatar/name/badges, follow/chat/RFQ actions, a metrics strip and the
// shop-nav tab row underneath.
export function ShopHeader({
  emoji,
  name,
  village,
  badges,
  metrics,
  navTabs,
}: {
  emoji: string;
  name: string;
  village: string;
  badges: ShopBadge[];
  metrics: ShopMetric[];
  navTabs: string[];
}) {
  const [following, setFollowing] = useState(false);
  const [activeNav, setActiveNav] = useState(0);

  return (
    <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0d2418_0%,#1A3A2A_60%,#2d5a3d_100%)]">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[120px] tracking-[20px] opacity-[.07]">
        {emoji}
      </div>
      <div className="relative mx-auto max-w-[1200px] px-4 py-6">
        <div className="mb-5 flex flex-wrap items-start gap-5">
          <div className="flex h-[90px] w-[90px] shrink-0 items-center justify-center rounded-xl border-[3px] border-white/20 bg-[linear-gradient(135deg,#C4622D,#E8A87C)] text-[42px]">
            {emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-tight mb-1.5 text-[22px] font-bold text-white">{name}</div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {badges.map((b) => (
                <span
                  key={b.label}
                  className={`rounded-[3px] px-2.5 py-[3px] text-[10px] font-semibold ${BADGE_CLASSNAMES[b.tone]}`}
                >
                  {b.label}
                </span>
              ))}
            </div>
            <div className="text-xs text-white/60">{village}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setFollowing((f) => !f)}
              className={`rounded-md px-4 py-2 text-[13px] font-semibold transition-colors ${
                following
                  ? 'bg-[rgba(0,166,80,.2)] text-[#4DDB88] border border-[rgba(0,166,80,.4)]'
                  : 'border border-white/30 bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {following ? '✓ Đang theo dõi' : '❤ Theo dõi'}
            </button>
            <button
              type="button"
              className="rounded-md bg-white px-4 py-2 text-[13px] font-semibold text-[#1F1F1F] hover:bg-[#f0ede5]"
            >
              💬 Nhắn tin
            </button>
            <button
              type="button"
              className="rounded-md bg-[#C4622D] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#a84e22]"
            >
              📋 Gửi RFQ
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-y-3 overflow-hidden rounded-lg bg-black/20 sm:grid-cols-6 sm:gap-y-0 sm:divide-x sm:divide-white/[.08]">
          {metrics.map((m) => (
            <div key={m.label} className="px-2 py-3 text-center">
              <div className="font-tight text-xl leading-none font-bold text-white">{m.num}</div>
              <div className="mt-[3px] text-[10px] text-white/50">{m.label}</div>
              <div className="mt-px text-[10px] text-white/30">{m.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/[.08] bg-black/25">
        <div className="mx-auto flex max-w-[1200px] gap-0 overflow-x-auto px-4">
          {navTabs.map((tab, i) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveNav(i)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
                i === activeNav
                  ? 'border-[#C4622D] text-white'
                  : 'border-transparent text-white/65 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
