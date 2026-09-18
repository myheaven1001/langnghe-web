import type { Metadata } from 'next';
import { ProductDetailClient } from './_components/ProductDetailClient';
import { PRODUCT } from './_components/data';

export const metadata: Metadata = {
  title: `${PRODUCT.name} — LàngNghề.vn`,
  description: PRODUCT.name,
};

// Ported from product_detail_page.html. Layout, content and interactions
// (image thumbnails, price-tier selection, quantity/total, tabs, variant
// pickers, RFQ modal) are preserved; data is still hardcoded pending the
// real product API, so every [id] currently renders the same sample item.
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;

  return <ProductDetailClient />;
}
