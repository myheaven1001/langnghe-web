import type { AboutRow } from './data';

// Matches the "Thông tin xưởng" sidebar card from the prototype.
export function AboutCard({ rows }: { rows: AboutRow[] }) {
  return (
    <div className="border-brand-border overflow-hidden rounded border bg-white">
      <div className="border-brand-border flex items-center gap-1.5 border-b px-3.5 py-2.5 text-[13px] font-bold">
        <span className="bg-brand-red inline-block h-3.5 w-[3px] rounded-sm" />
        Thông tin xưởng
      </div>
      {rows.map((row) => (
        <div key={row.label} className="border-brand-border flex gap-1.5 border-b px-3.5 py-2 text-xs last:border-b-0">
          <div className="text-brand-sub min-w-[76px] shrink-0">{row.label}</div>
          <div className={`font-medium ${row.highlight ? 'text-brand-green' : 'text-brand-ink'}`}>
            {row.value}
          </div>
        </div>
      ))}
    </div>
  );
}
