import type { FeaturedVillage } from './data';

// Matches the "Làng nghề nổi bật" sidebar block from the prototype.
export function FeaturedVillages({ villages }: { villages: FeaturedVillage[] }) {
  return (
    <div className="border-brand-border overflow-hidden rounded border bg-white">
      <div className="border-brand-border border-b bg-[#FAFAFA] px-3.5 py-2.5 text-[13px] font-bold">
        Làng nghề nổi bật
      </div>
      <div className="flex flex-col gap-2 px-3.5 py-2.5">
        {villages.map((v) => (
          <a
            key={v.name}
            href="#"
            className="flex items-center gap-2.5 rounded p-1.5 hover:bg-[#f5f5f5]"
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg ${v.gradient}`}
            >
              {v.emoji}
            </div>
            <div>
              <div className="text-xs font-semibold">{v.name}</div>
              <div className="text-brand-sub text-[11px]">
                {v.count} sản phẩm · {v.location}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
