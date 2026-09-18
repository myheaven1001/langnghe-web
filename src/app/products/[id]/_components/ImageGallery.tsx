'use client';

import { useState } from 'react';
import type { ImageThumb } from './data';

// Matches .img-panel from the prototype: a big preview + thumbnail strip
// that swaps the preview emoji, plus the trust/feature tag row underneath.
export function ImageGallery({ thumbs, tags }: { thumbs: ImageThumb[]; tags: readonly string[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = thumbs[activeIndex];

  return (
    <div className="border-brand-border border-r p-4">
      <div className="border-brand-border relative mb-2.5 flex h-[340px] w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-md border bg-[#f8f5f0] text-[90px]">
        {active.emoji}
        <div className="absolute right-2 bottom-2 rounded-[3px] bg-black/50 px-1.5 py-1 text-[10px] text-white">
          🔍 Rê chuột để phóng to
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {thumbs.map((thumb, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveIndex(i)}
            className={`flex h-[60px] w-[60px] items-center justify-center rounded border-2 text-[22px] transition-colors ${
              i === activeIndex ? 'border-brand-red' : 'hover:border-brand-red border-transparent'
            } ${thumb.isVideo ? 'bg-[#1a1a1a] text-white' : 'bg-[#f0ede5]'}`}
          >
            {thumb.isVideo ? '▶' : thumb.emoji}
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {tags.map((tag, i) => (
          <span
            key={tag}
            className={`rounded-[3px] border px-2.5 py-[3px] text-[11px] font-medium ${
              i === 0
                ? 'border-[#BBDEFB] bg-[#E3F2FD] text-brand-blue'
                : i === 1
                  ? 'border-[#FFE0B2] bg-[#FFF3E0] text-brand-orange'
                  : 'border-[#C8E6C9] bg-[#E8F5EE] text-brand-green'
            }`}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
