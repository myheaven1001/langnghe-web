import Link from 'next/link';
import type { FaqItem } from './data';

// Matches .faq-item/.faq-q/.faq-a from the prototype. Open state is owned
// by FaqSection (only one item open at a time, across every group — same
// as the original's global toggleFaq()).
export function FaqAccordionItem({
  item,
  open,
  onToggle,
}: {
  item: FaqItem;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-brand-border mb-1.5 overflow-hidden rounded-md border bg-white">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between gap-2.5 px-4 py-3.5 text-left text-[13px] font-medium transition-colors hover:bg-[#F5F5F5] ${
          open ? 'text-brand-red' : ''
        }`}
      >
        {item.q}
        <span
          className={`text-brand-light shrink-0 text-xs transition-transform ${open ? 'rotate-180' : ''}`}
        >
          ▼
        </span>
      </button>
      {open && (
        <div className="border-brand-border text-brand-sub border-t px-4 pt-3 pb-3.5 text-xs leading-[1.7]">
          {item.a}
          {item.link && (
            <>
              {' '}
              <Link href={item.link.href} className="text-brand-blue">
                {item.link.label}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
