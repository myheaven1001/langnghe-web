'use client';

import { useState } from 'react';
import { DescriptionTab } from './DescriptionTab';
import { PriceDetailTab } from './PriceDetailTab';
import { SupplierTab } from './SupplierTab';
import { ReviewsTab } from './ReviewsTab';

const TABS = [
  { id: 'desc', label: 'Mô tả sản phẩm' },
  { id: 'price', label: 'Bảng giá chi tiết' },
  { id: 'supplier', label: 'Thông tin xưởng' },
  { id: 'reviews', label: 'Đánh giá (142)' },
] as const;

// Matches .tab-section from the prototype.
export function TabSection() {
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
      <div className="p-5">
        {active === 'desc' && <DescriptionTab />}
        {active === 'price' && <PriceDetailTab />}
        {active === 'supplier' && <SupplierTab />}
        {active === 'reviews' && <ReviewsTab />}
      </div>
    </div>
  );
}
