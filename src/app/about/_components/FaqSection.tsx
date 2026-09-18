'use client';

import { useState } from 'react';
import { FaqHero } from './FaqHero';
import { FaqAccordionItem } from './FaqAccordionItem';
import { FAQ_CATEGORIES, FAQ_GROUPS } from './data';

const itemKey = (groupTitle: string, question: string) => `${groupTitle}::${question}`;

const DEFAULT_OPEN_KEY = (() => {
  for (const group of FAQ_GROUPS) {
    const item = group.items.find((i) => i.defaultOpen);
    if (item) return itemKey(group.title, item.q);
  }
  return null;
})();

// Matches #faq from the prototype. Category chips are cosmetic — like the
// original, clicking one only highlights it and doesn't filter the groups
// below.
export function FaqSection() {
  const [activeCategory, setActiveCategory] = useState(FAQ_CATEGORIES[0]);
  const [openKey, setOpenKey] = useState<string | null>(DEFAULT_OPEN_KEY);

  return (
    <div>
      <FaqHero />
      <div className="mx-auto max-w-[800px] px-4 py-6">
        <div className="mb-5 flex flex-wrap justify-center gap-2">
          {FAQ_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                cat === activeCategory
                  ? 'bg-brand-red border-brand-red text-white'
                  : 'border-brand-border text-brand-sub hover:bg-brand-red hover:border-brand-red bg-white hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {FAQ_GROUPS.map((group) => (
          <div key={group.title} className="mb-6">
            <div className="mb-2.5 flex items-center gap-1.5 text-sm font-bold">{group.title}</div>
            {group.items.map((item) => {
              const key = itemKey(group.title, item.q);
              return (
                <FaqAccordionItem
                  key={key}
                  item={item}
                  open={openKey === key}
                  onToggle={() => setOpenKey((k) => (k === key ? null : key))}
                />
              );
            })}
          </div>
        ))}

        <div className="border-brand-border mt-2 rounded-lg border bg-white p-5 text-center">
          <div className="mb-1.5 text-sm font-bold">Không tìm thấy câu trả lời?</div>
          <div className="text-brand-sub mb-3.5 text-xs">
            Đội hỗ trợ của chúng tôi phản hồi trong vòng 2 giờ trong giờ hành chính
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="bg-brand-red rounded-md px-4 py-2 text-xs font-semibold text-white"
            >
              💬 Chat trực tiếp
            </button>
            <button
              type="button"
              className="border-brand-border rounded-md border px-4 py-2 text-xs font-semibold"
            >
              📧 Gửi email
            </button>
            <button
              type="button"
              className="border-brand-border rounded-md border px-4 py-2 text-xs font-semibold"
            >
              📞 Hotline: 1800-xxxx
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
