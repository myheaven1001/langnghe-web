import type { Certification } from './data';

// Matches the "Chứng nhận" sidebar card from the prototype.
export function CertificationsCard({ items }: { items: Certification[] }) {
  return (
    <div className="border-brand-border overflow-hidden rounded border bg-white">
      <div className="border-brand-border flex items-center gap-1.5 border-b px-3.5 py-2.5 text-[13px] font-bold">
        <span className="bg-brand-red inline-block h-3.5 w-[3px] rounded-sm" />
        Chứng nhận
      </div>
      {items.map((cert) => (
        <div
          key={cert.name}
          className="border-brand-border flex items-center gap-2.5 border-b px-3.5 py-2.5 last:border-b-0"
        >
          <div className="shrink-0 text-xl">{cert.icon}</div>
          <div>
            <div className="text-brand-ink text-xs font-semibold">{cert.name}</div>
            <div className="text-brand-sub mt-px text-[11px]">{cert.note}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
