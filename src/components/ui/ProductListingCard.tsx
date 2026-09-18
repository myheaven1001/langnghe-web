// Matches .pc from the search_results/category_listing prototypes — the
// same product-card markup is reused by both /search and /categories/[slug]
// (and any future product-listing page), so it lives here instead of being
// duplicated per route. "List view" only changes the grid's column count
// (the card itself keeps this vertical layout), same as the prototypes.
export interface ProductListingTag {
  label: string;
  tone: 'oem' | 'verified';
}

export interface ProductListingTier {
  label: string;
  price: string;
  best?: boolean;
}

export interface ProductListing {
  id: string;
  emoji: string;
  /** Omit on a shop's own product grid, where every card is already the
   * same supplier — see src/app/shops/[id]. */
  village?: string;
  name: string;
  price: string;
  unit: string;
  moq: string;
  leadTime: string;
  tiers: ProductListingTier[];
  /** Supplier name, or e.g. "Đã bán 1.240" on a shop's own product grid
   * (see src/app/shops/[id]) — just the left footer label either way. */
  supplier: string;
  /** count omitted on a shop's own product grid, which shows only the
   * average (★ 4.9) with no review count. */
  rating: { value: number; count?: number };
  saleBadge?: string;
  tags: ProductListingTag[];
  sponsored?: boolean;
}

const TAG_CLASSNAMES: Record<ProductListingTag['tone'], string> = {
  oem: 'bg-[#FFF3E0] text-brand-orange',
  verified: 'bg-[#E8F5EE] text-brand-green',
};

export function ProductListingCard({
  product,
  rfqLabel = '📋 Báo giá',
}: {
  product: ProductListing;
  rfqLabel?: string;
}) {
  return (
    <a
      href="#"
      className="border-brand-border block overflow-hidden rounded border bg-white transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)]"
    >
      <div className="relative flex h-[155px] items-center justify-center bg-[#f8f5f0] text-[42px]">
        {product.emoji}
        {product.saleBadge && (
          <span className="bg-brand-red absolute top-0 left-0 py-[3px] pr-2 pl-1.5 text-[10px] font-bold text-white [clip-path:polygon(0_0,100%_0,calc(100%-5px)_100%,0_100%)]">
            {product.saleBadge}
          </span>
        )}
        {product.tags.map((tag, i) => (
          <span
            key={tag.label}
            style={{ top: i === 0 ? 8 : 30 }}
            className={`absolute right-2 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${TAG_CLASSNAMES[tag.tone]}`}
          >
            {tag.label}
          </span>
        ))}
        {product.sponsored && (
          <span className="text-brand-light absolute bottom-1.5 left-1.5 rounded-sm bg-white/80 px-1.5 py-px text-[9px]">
            Tài trợ
          </span>
        )}
      </div>

      <div className="px-[11px] py-2.5">
        {product.village && (
          <div className="text-brand-sub mb-[3px] text-[10px] font-medium tracking-[.05em] uppercase">
            {product.village}
          </div>
        )}
        <div className="mb-1.5 line-clamp-2 h-8 text-xs leading-[1.4] font-medium text-[#1F1F1F]">
          {product.name}
        </div>
        <div className="font-tight text-brand-red text-[15px] font-bold">
          {product.price} <span className="text-brand-sub text-[11px] font-normal">/{product.unit}</span>
        </div>
        <div className="text-brand-sub mt-0.5 text-[11px]">
          {product.moq} · {product.leadTime}
        </div>

        <div className="mt-[5px] flex flex-wrap gap-[3px]">
          {product.tiers.map((tier) => (
            <span
              key={tier.label}
              className={`rounded-sm px-[5px] py-px text-[10px] ${
                tier.best ? 'bg-[#FFF3F3] font-semibold text-brand-red' : 'text-brand-light bg-[#FAFAFA]'
              }`}
            >
              {tier.label}: {tier.price}
            </span>
          ))}
        </div>

        <div className="border-brand-border mt-[7px] flex items-center justify-between border-t pt-[7px]">
          <span className="text-brand-sub text-[11px]">{product.supplier}</span>
          <span className="text-brand-sub text-[11px]">
            ★ {product.rating.value}
            {product.rating.count != null && ` (${product.rating.count})`}
          </span>
        </div>

        <button
          type="button"
          className="text-brand-red mt-[7px] w-full rounded-[3px] border border-[#FFCDD2] bg-[#FFF3F3] py-1.5 text-xs font-semibold transition-colors hover:bg-brand-red hover:text-white"
        >
          {rfqLabel}
        </button>
      </div>
    </a>
  );
}
