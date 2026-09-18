import type { Achievement } from './data';

// Matches .ach-strip from the prototype.
export function AchievementStrip({ items }: { items: Achievement[] }) {
  return (
    <div className="border-brand-border rounded border bg-white p-4">
      <div className="text-brand-sub mb-2.5 text-xs font-bold tracking-[.06em] uppercase">
        Thành tích nổi bật
      </div>
      <div className="flex flex-wrap gap-2.5">
        {items.map((item) => (
          <div
            key={item.title}
            className="border-brand-border flex items-center gap-2 rounded-md border bg-[#FAFAFA] px-3 py-2"
          >
            <div className="text-lg">{item.icon}</div>
            <div>
              <strong className="text-brand-ink block text-xs font-semibold">{item.title}</strong>
              <span className="text-brand-sub text-[11px]">{item.sub}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
