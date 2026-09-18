import type { Metadata } from 'next';
import { ShopPageClient } from './_components/ShopPageClient';
import { SHOP } from './_components/data';

export const metadata: Metadata = {
  title: `${SHOP.name} — LàngNghề.vn`,
  description: SHOP.village,
};

// Ported from supplier_shop_page.html. Layout, content and interactions
// (follow toggle, shop-nav tabs, category chips, filters, view toggle,
// pagination) are preserved; data is still hardcoded pending the real
// supplier/catalog API, so every [id] currently renders the same sample shop.
export default async function ShopPage({ params }: { params: Promise<{ id: string }> }) {
  await params;

  return <ShopPageClient />;
}
