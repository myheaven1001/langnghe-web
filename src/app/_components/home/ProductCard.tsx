import Link from 'next/link';
import { formatVnd } from '@/lib/format';
import type { HomeProduct } from './queries';

// Thẻ sản phẩm trang chủ — dữ liệu từ product_cards (2.1c): ảnh chính, giá
// thấp nhất, MOQ, xưởng/làng nghề, nhãn đã xác minh / OEM.
/* eslint-disable @next/next/no-img-element */
export function ProductCard({
  product,
  compact = false,
}: {
  product: HomeProduct;
  compact?: boolean;
}) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="block overflow-hidden rounded-[6px] border border-[#E5DDD1] bg-white transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)]"
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-[#f8f5f0] text-[38px]">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          '🖼️'
        )}
        {product.villageOrigin && (
          <div className="absolute inset-x-0 bottom-0 truncate bg-[linear-gradient(transparent,rgba(0,0,0,.45))] px-2 pt-2 pb-1 text-[10px] font-semibold text-white">
            {product.villageOrigin}
          </div>
        )}
      </div>
      <div className={compact ? 'px-2 pt-1.5 pb-2' : 'px-2.5 pt-2 pb-2.5'}>
        <div className="mb-1.5 line-clamp-2 h-[37px] text-[13px] leading-[1.4] text-[#2A2420]">
          {product.name}
        </div>
        <div className="font-tight text-[16px] font-bold text-[#B5482E]">
          {product.minPrice != null ? (
            <>
              {formatVnd(product.minPrice)}{' '}
              <span className="text-xs font-normal text-[#6B6058]">/cái</span>
            </>
          ) : (
            <span className="text-sm">Liên hệ báo giá</span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-[#6B6058]">
          MOQ {product.moq.toLocaleString('vi-VN')} · {product.shopName}
        </div>
        {(product.supplierVerified || product.acceptOem) && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {product.supplierVerified && (
              <span className="rounded-[2px] bg-[#E8F1EA] px-1.5 py-0.5 text-[11px] font-medium text-[#3F7D58]">
                ✓ Xác minh
              </span>
            )}
            {product.acceptOem && (
              <span className="rounded-[2px] bg-[#F7EADC] px-1.5 py-0.5 text-[11px] font-medium text-[#C97A3D]">
                OEM
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
