import { PriceTierTable } from './PriceTierTable';
import { SpecsGrid } from './SpecsGrid';
import { VariantGroup } from './VariantGroup';
import { PRODUCT, PRICE_TIERS, SPECS, VARIANT_GROUPS } from './data';

// Matches .info-panel from the prototype: village line, name, rating/sold
// meta, the quantity price table, specs grid and variant pickers.
export function InfoPanel({
  tierIndex,
  onSelectTier,
}: {
  tierIndex: number;
  onSelectTier: (index: number) => void;
}) {
  return (
    <div className="border-brand-border border-r px-5 py-4">
      <div className="text-brand-sub mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-[.06em] uppercase">
        <span className="bg-brand-orange h-1.5 w-1.5 rounded-full" />
        {PRODUCT.village}
      </div>
      <h1 className="text-brand-ink mb-2.5 text-lg leading-[1.35] font-bold">{PRODUCT.name}</h1>

      <div className="mb-3.5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-xs">
          <span className="text-[13px] text-[#FFB800]">★★★★★</span>
          <span className="text-brand-ink font-semibold">{PRODUCT.rating}</span>
          <span className="text-brand-sub">({PRODUCT.ratingCount} đánh giá)</span>
        </div>
        <span className="text-brand-border">|</span>
        <div className="text-brand-sub text-xs">
          Đã bán: <strong>{PRODUCT.soldCount}</strong>
        </div>
        <span className="text-brand-border">|</span>
        <div className="text-brand-green flex items-center gap-1 rounded-sm bg-[#E8F5EE] px-2 py-0.5 text-[11px] font-semibold">
          ✓ Đã xác minh
        </div>
      </div>

      <PriceTierTable tiers={PRICE_TIERS} selectedIndex={tierIndex} onSelect={onSelectTier} />
      <SpecsGrid specs={SPECS} />

      {VARIANT_GROUPS.map((group) => (
        <VariantGroup
          key={group.title}
          title={group.title}
          options={group.options}
          defaultIndex={group.defaultIndex}
        />
      ))}
    </div>
  );
}
