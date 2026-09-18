import type { ReactNode } from 'react';

// Matches .section-title from the prototype: a clay-colored accent bar +
// bold heading, reused by the Why/Timeline/Team sections.
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-2 text-xl font-bold text-[#1F1F1F]">
      <span className="inline-block h-5 w-1 rounded-sm bg-[#C4622D]" />
      {children}
    </div>
  );
}
