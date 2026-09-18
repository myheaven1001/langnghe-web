import type { Metadata } from 'next';
import { CategoryPageClient } from './_components/CategoryPageClient';
import { CATEGORY } from './_components/data';

export const metadata: Metadata = {
  title: `${CATEGORY.name} — LàngNghề.vn`,
  description: CATEGORY.sub,
};

// Ported from category_listing_page.html. Layout, content and interactions
// (sub-category tabs, filters, sub-category cards, view toggle, pagination)
// are preserved; data is still hardcoded pending the real catalog API, so
// every [slug] currently renders the same "Gốm sứ" sample category.
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await params;

  return <CategoryPageClient />;
}
