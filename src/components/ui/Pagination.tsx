'use client';

import { useState } from 'react';

// Matches .pagination from the search_results/category_listing prototypes:
// page buttons are cosmetic (no real page navigation since results are
// hardcoded), just tracking which one looks active.
export function Pagination({ pages, totalPages }: { pages: number[]; totalPages: number }) {
  const [active, setActive] = useState(1);

  // Only page numbers that actually get a button (the leading `pages` list
  // plus the trailing `totalPages` button) — ‹/› must land on one of these,
  // otherwise `active` can drift into the "..." gap where no button matches
  // it and the pager renders with nothing highlighted.
  const visiblePages = Array.from(new Set([...pages, totalPages])).sort((a, b) => a - b);

  const step = (direction: 1 | -1) => {
    setActive((current) => {
      const index = visiblePages.indexOf(current);
      const nextIndex = index === -1 ? 0 : index + direction;
      return visiblePages[nextIndex] ?? current;
    });
  };

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => step(-1)}
        className="border-brand-border text-brand-sub hover:border-brand-red hover:text-brand-red flex h-8 w-8 items-center justify-center rounded-[3px] border bg-white text-[13px]"
      >
        ‹
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setActive(p)}
          className={`flex h-8 w-8 items-center justify-center rounded-[3px] border text-[13px] ${
            active === p
              ? 'bg-brand-red border-brand-red font-semibold text-white'
              : 'border-brand-border text-brand-sub hover:border-brand-red hover:text-brand-red bg-white'
          }`}
        >
          {p}
        </button>
      ))}
      {totalPages > (pages.at(-1) ?? 0) + 1 && <span className="text-brand-light px-1">...</span>}
      {totalPages > (pages.at(-1) ?? 0) && (
        <button
          type="button"
          onClick={() => setActive(totalPages)}
          className={`flex h-8 w-8 items-center justify-center rounded-[3px] border text-[13px] ${
            active === totalPages
              ? 'bg-brand-red border-brand-red font-semibold text-white'
              : 'border-brand-border text-brand-sub hover:border-brand-red hover:text-brand-red bg-white'
          }`}
        >
          {totalPages}
        </button>
      )}
      <button
        type="button"
        onClick={() => step(1)}
        className="border-brand-border text-brand-sub hover:border-brand-red hover:text-brand-red flex h-8 w-8 items-center justify-center rounded-[3px] border bg-white text-[13px]"
      >
        ›
      </button>
    </div>
  );
}
