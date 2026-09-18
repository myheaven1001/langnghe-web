'use client';

import { useState } from 'react';

// Shared by the filter-sidebar variants (search/categories/shops), which
// each need a `Set<string>` of checked labels plus a way to flip one.
export function useToggleSet(initial?: Iterable<string>) {
  const [set, setSet] = useState<Set<string>>(() => new Set(initial));

  const toggle = (label: string) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return [set, toggle] as const;
}
