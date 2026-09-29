import Link from 'next/link';
import { formatVnd } from '@/lib/format';
import type { RelatedView } from './types';

// Sản phẩm cùng danh mục hoặc cùng xưởng (product_cards — chỉ hàng công
// khai). Không có thì ẩn cả khối.
/* eslint-disable @next/next/no-img-element */
export function RelatedProducts({
  products,
  categoryName,
}: {
  products: RelatedView[];
  categoryName: string | null;
}) {
  if (products.length === 0) return null;

  return (
    <div className="border-brand-border overflow-hidden rounded border bg-white">
      <div className="border-brand-border border-b px-4 py-3 text-[15px] font-bold">
        Sản phẩm tương tự{categoryName ? ` — ${categoryName}` : ''}
      </div>
      <div className="grid grid-cols-2 gap-2.5 p-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {products.map((p) => (
          <Link
            key={p.id}
            href={`/products/${p.slug}`}
            className="border-brand-border block overflow-hidden rounded border bg-white transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)]"
          >
            <div className="flex aspect-square items-center justify-center overflow-hidden bg-[#f8f5f0] text-3xl">
              {p.imageUrl ? (
                <img
                  src={p.imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                '🖼️'
              )}
            </div>
            <div className="p-2">
              <div className="text-brand-ink mb-1 line-clamp-2 text-xs leading-[1.4] font-medium">
                {p.name}
              </div>
              <div className="font-tight text-brand-red text-sm font-bold">
                {p.minPrice != null ? `từ ${formatVnd(p.minPrice)}` : 'Liên hệ'}
              </div>
              <div className="text-brand-sub text-[11px]">MOQ {p.moq.toLocaleString('vi-VN')}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
