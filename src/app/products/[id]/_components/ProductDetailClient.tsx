'use client';

import { useState } from 'react';
import { PublicHeader, Breadcrumb } from '@/components/ui';
import { ImageGallery } from './ImageGallery';
import { InfoPanel } from './InfoPanel';
import { OrderPanel, MobileBuyBar } from './OrderPanel';
import { ProductTabs } from './ProductTabs';
import { RelatedProducts } from './RelatedProducts';
import { RFQModal } from './RFQModal';
import {
  tierIndexForQty,
  type MediaView,
  type ProductView,
  type RelatedView,
  type SupplierView,
  type TierView,
  type VariantView,
  type Viewer,
} from './types';

// Số lượng và biến thể đang chọn nằm ở đây vì bảng giá (InfoPanel), khối
// đặt hàng (OrderPanel), thanh mua trên mobile và form RFQ cùng dùng: chọn
// bậc giá → đổi số lượng; đổi số lượng → tự nhảy bậc giá; biến thể cộng
// price_adjustment vào đơn giá.
export function ProductDetailClient({
  product,
  tiers,
  variants,
  media,
  supplier,
  viewer,
  related,
  openRfqOnLoad,
}: {
  product: ProductView;
  tiers: TierView[];
  variants: VariantView[];
  media: MediaView[];
  supplier: SupplierView;
  viewer: Viewer;
  related: RelatedView[];
  openRfqOnLoad: boolean;
}) {
  const [qty, setQty] = useState(Math.max(product.moq, tiers[0]?.minQty ?? 1));
  const [variantId, setVariantId] = useState<string | null>(variants[0]?.id ?? null);
  const [rfqOpen, setRfqOpen] = useState(openRfqOnLoad);

  const tierIndex = tierIndexForQty(tiers, qty);
  const variant = variants.find((v) => v.id === variantId) ?? null;
  const unitPrice =
    tiers.length > 0 ? tiers[tierIndex].unitPrice + (variant?.priceAdjustment ?? 0) : null;

  const breadcrumb = [
    { label: 'Trang chủ', href: '/' },
    ...(product.category
      ? [{ label: product.category.name, href: `/categories/${product.category.slug}` }]
      : []),
    { label: product.name },
  ];

  const orderProps = {
    product,
    supplier,
    viewer,
    tiers,
    tierIndex,
    unitPrice,
    qty,
    onQtyChange: (next: number) => setQty(Math.max(product.moq, next)),
    onOpenRfq: () => setRfqOpen(true),
  };

  return (
    <div className="text-brand-ink min-h-screen bg-[#F5F5F5] pb-20 text-[13px] lg:pb-0">
      <PublicHeader primaryButtonLabel="Gửi yêu cầu báo giá" primaryButtonHref="/rfq/new" />
      <Breadcrumb items={breadcrumb} />

      <div className="mx-auto flex max-w-[1200px] flex-col gap-2.5 px-4 pb-5">
        {product.status !== 'active' && (
          <div className="rounded border border-[#FFE0B2] bg-[#FFF3E0] px-4 py-2.5 text-xs text-[#E65100]">
            Sản phẩm đang ở trạng thái{' '}
            <strong>{product.status === 'draft' ? 'nháp' : 'tạm dừng'}</strong> — chỉ bạn thấy trang
            này. Người mua chưa xem được.
          </div>
        )}

        <div className="border-brand-border grid grid-cols-1 rounded border bg-white lg:grid-cols-2 xl:grid-cols-[400px_1fr_280px]">
          <ImageGallery media={media} product={product} supplier={supplier} />
          <InfoPanel
            product={product}
            supplier={supplier}
            tiers={tiers}
            tierIndex={tierIndex}
            onSelectTier={(i) => setQty(Math.max(product.moq, tiers[i].minQty))}
            variants={variants}
            variantId={variantId}
            onSelectVariant={setVariantId}
          />
          <div className="border-brand-border border-t lg:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-l">
            <OrderPanel {...orderProps} />
          </div>
        </div>

        <ProductTabs product={product} tiers={tiers} supplier={supplier} />
        <RelatedProducts products={related} categoryName={product.category?.name ?? null} />
      </div>

      <MobileBuyBar {...orderProps} />

      {viewer.kind === 'buyer' && (
        <RFQModal
          open={rfqOpen}
          onClose={() => setRfqOpen(false)}
          product={product}
          supplier={supplier}
          qty={qty}
          variantLabel={variant?.label ?? null}
          unitPrice={unitPrice}
        />
      )}
    </div>
  );
}
