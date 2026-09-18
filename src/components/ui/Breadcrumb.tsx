import Link from 'next/link';

// Matches .bc from the public-page prototypes: a simple "Trang chủ › ... ›
// Current page" trail, last item plain text.
export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <div className="text-brand-sub mx-auto flex max-w-[1200px] flex-wrap items-center gap-1.5 px-4 py-2.5 text-xs">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-1.5">
          {i > 0 && <span>›</span>}
          {item.href ? (
            <Link href={item.href} className="text-brand-blue">
              {item.label}
            </Link>
          ) : (
            <span className={i === items.length - 1 ? 'text-brand-ink' : undefined}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
