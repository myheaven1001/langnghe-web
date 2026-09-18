import type { PriceTier } from './data';

// Matches .price-section/.tier-table from the prototype: clicking a row
// selects that quantity tier, which also drives the order panel's big price
// and running total (tierIndex/onSelect are owned by ProductDetailClient).
export function PriceTierTable({
  tiers,
  selectedIndex,
  onSelect,
}: {
  tiers: PriceTier[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="mb-3.5 rounded-md border border-[#FFE0DC] bg-[#FFF8F7] p-3.5">
      <div className="text-brand-red mb-2.5 text-[11px] font-semibold tracking-[.06em] uppercase">
        📊 Bảng giá sỉ theo số lượng
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-brand-border text-brand-sub border-b px-2.5 pb-1.5 text-left text-[11px] font-medium">
              Số lượng
            </th>
            <th className="border-brand-border text-brand-sub border-b px-2.5 pb-1.5 text-left text-[11px] font-medium">
              Đơn giá
            </th>
            <th className="border-brand-border text-brand-sub border-b px-2.5 pb-1.5 text-left text-[11px] font-medium">
              Tiết kiệm
            </th>
            <th className="border-brand-border border-b px-2.5 pb-1.5" />
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier, i) => (
            <tr
              key={tier.qtyLabel}
              onClick={() => onSelect(i)}
              className={`cursor-pointer border-b border-[#f5f0ee] last:border-none ${
                i === selectedIndex ? 'bg-[#FFF3F3]' : ''
              }`}
            >
              <td className="px-2.5 py-2 text-[13px]">{tier.qtyLabel}</td>
              <td className="px-2.5 py-2">
                <span
                  className={`font-tight text-[15px] font-bold ${
                    i === selectedIndex ? 'text-brand-red' : 'text-brand-ink'
                  }`}
                >
                  {tier.priceLabel}
                </span>
              </td>
              <td className="text-brand-green px-2.5 py-2 text-[11px] font-medium">
                {tier.save ?? '—'}
              </td>
              <td className="px-2.5 py-2">
                {tier.badge && (
                  <span
                    className={`ml-1.5 rounded-sm px-1.5 py-px text-[10px] font-semibold text-white ${
                      tier.badge.tone === 'best' ? 'bg-brand-red' : 'bg-[#FF9100]'
                    }`}
                  >
                    {tier.badge.label}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
