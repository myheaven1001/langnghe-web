import Link from 'next/link';

// Ô "việc cần làm" trên dashboard (kế hoạch 4.4, 4.8): số lớn + việc + nơi
// bấm. Có việc (count > 0) thì viền và số nổi màu đỏ. Cao tối thiểu 72px để
// dễ chạm trên điện thoại.
export function TodoTile({
  href,
  icon,
  count,
  label,
  hint,
}: {
  href: string;
  icon: string;
  count: number;
  label: string;
  hint?: string;
}) {
  const active = count > 0;
  return (
    <Link
      href={href}
      className={`flex min-h-[72px] items-center gap-3 rounded-[10px] border bg-white px-4 py-3 ${
        active ? 'border-brand-red' : 'border-brand-border'
      }`}
    >
      <span className="text-2xl">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="text-brand-ink block text-sm font-semibold">{label}</span>
        {hint && <span className="text-brand-red block text-xs font-semibold">{hint}</span>}
      </span>
      <span
        className={`font-tight text-2xl font-bold ${active ? 'text-brand-red' : 'text-brand-light'}`}
      >
        {count}
      </span>
      <span className="text-brand-light text-sm">›</span>
    </Link>
  );
}

/** Ô số liệu tĩnh (không bấm được). */
export function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-brand-border rounded-[10px] border bg-white px-4 py-3">
      <div className="font-tight text-xl font-bold">{value}</div>
      <div className="text-brand-sub mt-0.5 text-xs">{label}</div>
    </div>
  );
}
