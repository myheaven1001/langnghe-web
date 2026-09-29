'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatVnd } from '@/lib/format';
import {
  qtyRangeLabel,
  savingPercent,
  type ProductView,
  type SupplierView,
  type TierView,
} from './types';

const TABS = [
  { id: 'desc', label: 'Mô tả sản phẩm' },
  { id: 'price', label: 'Bảng giá chi tiết' },
  { id: 'supplier', label: 'Thông tin xưởng' },
] as const;

// Tab mô tả / bảng giá / xưởng — dữ liệu thật. Tab đánh giá bỏ tới khi có
// bảng reviews (bước sau).
export function ProductTabs({
  product,
  tiers,
  supplier,
}: {
  product: ProductView;
  tiers: TierView[];
  supplier: SupplierView;
}) {
  const [active, setActive] = useState<(typeof TABS)[number]['id']>('desc');

  return (
    <div className="border-brand-border overflow-hidden rounded border bg-white">
      <div className="border-brand-border flex overflow-x-auto border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`-mb-px shrink-0 border-b-2 px-5 py-3 text-[13px] font-medium whitespace-nowrap transition-colors ${
              active === tab.id
                ? 'border-brand-red text-brand-red font-semibold'
                : 'text-brand-sub hover:text-brand-ink border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="p-4 sm:p-5">
        {active === 'desc' && (
          <div className="text-brand-ink text-[13px] leading-[1.7] whitespace-pre-line">
            {product.description || (
              <span className="text-brand-sub">Xưởng chưa viết mô tả cho sản phẩm này.</span>
            )}
          </div>
        )}

        {active === 'price' &&
          (tiers.length === 0 ? (
            <div className="text-brand-sub text-[13px]">Xưởng chưa đăng bảng giá.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    {['Số lượng', 'Đơn giá/cái', 'Tổng (ví dụ)', 'Tiết kiệm'].map((h) => (
                      <th
                        key={h}
                        className="border-brand-border border bg-[#F5F5F5] px-3 py-2.5 text-left font-semibold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t, i) => {
                    const saving = savingPercent(tiers, i);
                    return (
                      <tr key={t.minQty} className={i % 2 === 1 ? 'bg-[#FAFAFA]' : ''}>
                        <td className="border-brand-border border px-3 py-2.5">
                          {qtyRangeLabel(t)}
                        </td>
                        <td className="border-brand-border border px-3 py-2.5 font-semibold">
                          {formatVnd(t.unitPrice)}
                        </td>
                        <td className="border-brand-border border px-3 py-2.5">
                          {formatVnd(t.minQty * t.unitPrice)} ({t.minQty.toLocaleString('vi-VN')}{' '}
                          cái)
                        </td>
                        <td className="border-brand-border text-brand-green border px-3 py-2.5">
                          {saving > 0 ? `${saving}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-brand-sub mt-3 text-xs leading-[1.7]">
                Giá chưa gồm phí vận chuyển. Giá cuối cùng do xưởng báo trong phản hồi yêu cầu báo
                giá.
              </p>
            </div>
          ))}

        {active === 'supplier' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
            <div>
              <div className="mb-1 text-[15px] font-bold">{supplier.shopName}</div>
              <div className="text-brand-sub mb-3 text-xs">
                {[supplier.villageOrigin, supplier.craftCategory].filter(Boolean).join(' · ')}
              </div>
              <ul className="text-brand-sub grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
                {[
                  supplier.verified && '✓ Hồ sơ đã được sàn xác minh',
                  supplier.foundingYear && `Thành lập năm ${supplier.foundingYear}`,
                  supplier.monthlyCapacity &&
                    `Công suất ~${supplier.monthlyCapacity.toLocaleString('vi-VN')} sản phẩm/tháng`,
                  supplier.totalOrders != null && `Đơn hàng trên sàn: ${supplier.totalOrders}`,
                  supplier.responseRate != null &&
                    `Tỷ lệ phản hồi RFQ: ${Math.round(supplier.responseRate)}%`,
                  supplier.onTimeRate != null &&
                    `Giao đúng hạn: ${Math.round(supplier.onTimeRate)}%`,
                ]
                  .filter(Boolean)
                  .map((line) => (
                    <li key={line as string} className="flex gap-2">
                      <span className="text-brand-red">•</span>
                      {line}
                    </li>
                  ))}
              </ul>
            </div>
            {supplier.slug && (
              <Link
                href={`/shops/${supplier.slug}`}
                className="bg-brand-red rounded px-4 py-2 text-center text-xs font-semibold text-white"
              >
                Xem gian hàng
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
