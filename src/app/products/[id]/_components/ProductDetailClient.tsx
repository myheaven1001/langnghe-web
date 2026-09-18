'use client';

import { useState } from 'react';
import { PublicHeader, Breadcrumb } from '@/components/ui';
import { ImageGallery } from './ImageGallery';
import { InfoPanel } from './InfoPanel';
import { OrderPanel } from './OrderPanel';
import { TabSection } from './TabSection';
import { RelatedProducts } from './RelatedProducts';
import { RFQModal } from './RFQModal';
import { IMAGE_THUMBS, IMAGE_TAGS, PRICE_TIERS, DEFAULT_TIER_INDEX, PRODUCT, SUPPLIER } from './data';

// tierIndex is lifted here because the price tier table (InfoPanel) and the
// live price (OrderPanel) must stay in sync — same coupling the prototype's
// imperative script had, just as React state instead. `qty` stays local to
// OrderPanel (the only consumer), so typing/clicking the stepper doesn't
// re-render the rest of this tree.
export function ProductDetailClient() {
  const [tierIndex, setTierIndex] = useState(DEFAULT_TIER_INDEX);
  const [rfqOpen, setRfqOpen] = useState(false);

  return (
    <div className="text-brand-ink min-h-screen bg-[#F5F5F5] text-[13px]">
      <PublicHeader searchDefaultValue={PRODUCT.name} primaryButtonLabel="Đăng ký mua sỉ" />
      <Breadcrumb items={PRODUCT.breadcrumb} />

      <div className="mx-auto flex max-w-[1200px] flex-col gap-2.5 px-4 pb-5">
        <div className="border-brand-border grid grid-cols-1 rounded border bg-white lg:grid-cols-[420px_1fr_280px]">
          <ImageGallery thumbs={IMAGE_THUMBS} tags={IMAGE_TAGS} />
          <InfoPanel tierIndex={tierIndex} onSelectTier={setTierIndex} />
          <OrderPanel tier={PRICE_TIERS[tierIndex]} onOpenRFQ={() => setRfqOpen(true)} />
        </div>

        <TabSection />
        <RelatedProducts />
      </div>

      <RFQModal
        open={rfqOpen}
        onClose={() => setRfqOpen(false)}
        productName={PRODUCT.name}
        supplierName={SUPPLIER.name}
      />
    </div>
  );
}
