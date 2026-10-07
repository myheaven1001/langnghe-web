'use client';

import { useState } from 'react';
import type { MediaView, ProductView, SupplierView } from './types';

// Ảnh sản phẩm (product_media, ảnh chính đứng đầu) + dải ảnh nhỏ để đổi ảnh
// lớn; chưa có ảnh thì hiện khung trống. Nhãn bên dưới lấy từ dữ liệu thật
// (xưởng đã xác minh, nhận OEM, đặt theo mẫu).
//
// Dùng <img> thường thay cho next/image: ảnh nằm ở Supabase Storage (domain
// ngoài), không cần cấu hình images.remotePatterns cho từng project.
/* eslint-disable @next/next/no-img-element */
export function ImageGallery({
  media,
  product,
  supplier,
  variantId,
}: {
  media: MediaView[];
  product: ProductView;
  supplier: SupplierView;
  /** Biến thể buyer đang chọn — có ảnh riêng thì ảnh lớn đổi theo. */
  variantId?: string | null;
}) {
  // Ảnh buyer tự bấm chọn, kèm biến thể lúc bấm: đổi biến thể thì lựa chọn
  // cũ hết hiệu lực và ảnh lớn nhảy sang ảnh của biến thể mới (nếu có).
  const [picked, setPicked] = useState<{ index: number; variantId: string | null }>({
    index: 0,
    variantId: null,
  });
  const currentVariant = variantId ?? null;
  const variantIndex = currentVariant ? media.findIndex((m) => m.variantId === currentVariant) : -1;
  const activeIndex =
    picked.variantId === currentVariant && picked.index < media.length
      ? picked.index
      : Math.max(0, variantIndex);
  const setActiveIndex = (index: number) => setPicked({ index, variantId: currentVariant });
  const active = media[activeIndex];

  const tags = [
    supplier.verified && { label: '✓ Xưởng đã xác minh', tone: 'blue' },
    product.acceptOem && { label: 'Nhận OEM / in logo', tone: 'orange' },
    product.acceptCustom && { label: 'Đặt hàng theo mẫu', tone: 'green' },
  ].filter(Boolean) as { label: string; tone: 'blue' | 'orange' | 'green' }[];

  return (
    <div className="border-brand-border p-4 lg:border-r">
      <div className="border-brand-border relative mb-2.5 flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-[#f8f5f0] sm:aspect-[4/3] lg:aspect-square">
        {active ? (
          <img src={active.url} alt={product.name} className="h-full w-full object-contain" />
        ) : (
          <div className="text-brand-light flex flex-col items-center gap-2 text-xs">
            <span className="text-5xl">🖼️</span>
            Xưởng chưa đăng ảnh
          </div>
        )}
      </div>

      {media.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {media.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={`Ảnh ${i + 1}`}
              className={`h-[60px] w-[60px] shrink-0 overflow-hidden rounded border-2 bg-[#f0ede5] transition-colors ${
                i === activeIndex ? 'border-brand-red' : 'hover:border-brand-red border-transparent'
              }`}
            >
              <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag.label}
              className={`rounded-[3px] border px-2.5 py-[3px] text-[11px] font-medium ${
                tag.tone === 'blue'
                  ? 'text-brand-blue border-[#BBDEFB] bg-[#E3F2FD]'
                  : tag.tone === 'orange'
                    ? 'text-brand-orange border-[#FFE0B2] bg-[#FFF3E0]'
                    : 'text-brand-green border-[#C8E6C9] bg-[#E8F5EE]'
              }`}
            >
              {tag.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
