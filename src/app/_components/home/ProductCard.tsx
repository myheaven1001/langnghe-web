import Link from 'next/link';
import type { Product, ProductTag } from './data';

// Matches .prod-card / .rec-card from langnghe_1688_style.html, but uses a
// full border + rounded corners per card (rather than the prototype's
// border-collapsed strip with nth-child edge rules) so the grid doesn't need
// breakpoint-specific nth-child bookkeeping to look right.
const TAG_CLASSNAMES: Record<ProductTag['tone'], string> = {
  verified: 'bg-[#E8F1EA] text-[#3F7D58]',
  oem: 'bg-[#F7EADC] text-[#C97A3D]',
  hot: 'bg-[#F7E5DF] text-[#B5482E]',
  sale: 'bg-[#F7E5DF] text-[#B5482E] border border-[#E9C6BA]',
};

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  return (
    // /products/[id] still ignores its id param and renders one sample
    // product (see src/app/products/[id]/page.tsx) — same "hardcoded
    // pending real data" stage as this card, so every card lands on that
    // one page for now instead of a dead "#".
    <Link
      href={`/products/${product.id}`}
      className="block overflow-hidden rounded-[6px] border border-[#E5DDD1] bg-white transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)]"
    >
      <div
        className={`relative flex items-center justify-center bg-[#f8f5f0] ${
          compact ? 'h-[130px] text-[38px]' : 'h-[148px] text-[44px]'
        }`}
      >
        {product.emoji}
        {product.discountBadge && (
          <div className="absolute top-2 left-0 bg-[#B5482E] py-0.5 pr-2 pl-1.5 text-[10px] font-bold text-white [clip-path:polygon(0_0,100%_0,calc(100%-5px)_100%,0_100%)]">
            {product.discountBadge}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(transparent,rgba(0,0,0,.4))] px-2 pt-1.5 pb-1 text-[10px] font-semibold text-white">
          {product.imageLabel}
        </div>
      </div>
      <div className={compact ? 'px-2 pt-1.5 pb-2' : 'px-2.5 pt-2 pb-2.5'}>
        <div className="mb-1.5 line-clamp-2 h-[37px] text-[13px] leading-[1.4] text-[#2A2420]">
          {product.name}
        </div>
        <div className="font-tight text-[16px] font-bold text-[#B5482E]">
          {product.price}{' '}
          <span className="text-xs font-normal text-[#6B6058]">/{product.unit}</span>
        </div>
        <div className="mt-0.5 text-xs text-[#6B6058]">{product.metaLine}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {product.tags.map((tag) => (
            <span
              key={tag.label}
              className={`rounded-[2px] px-1.5 py-0.5 text-[11px] font-medium ${TAG_CLASSNAMES[tag.tone]}`}
            >
              {tag.label}
            </span>
          ))}
        </div>
        {product.rating && (
          <div className="mt-1 text-[11px] text-[#6B6058]">
            <span className="text-[#FFB800]">{product.rating.stars}</span> {product.rating.value} (
            {product.rating.count} đánh giá)
          </div>
        )}
      </div>
    </Link>
  );
}
