import { PARTNERS } from './data';

// Matches .partners from the prototype.
export function Partners() {
  return (
    <div className="border-brand-border mb-8 rounded-lg border bg-white p-5">
      <div className="text-brand-sub mb-4 text-center text-xs font-semibold tracking-[.08em] uppercase">
        Đối tác & Hỗ trợ
      </div>
      <div className="flex flex-wrap justify-center">
        {PARTNERS.map((partner, i) => (
          <div
            key={partner.name}
            className={`px-5 py-2.5 text-center text-xs font-semibold text-[#666] ${
              i < PARTNERS.length - 1 ? 'border-brand-border border-r' : ''
            }`}
          >
            {partner.name}
            <div className="text-brand-light mt-0.5 text-[10px] font-normal">{partner.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
