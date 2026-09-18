import type { Metadata } from 'next';
import { SearchPageClient } from './_components/SearchPageClient';

export const metadata: Metadata = {
  title: 'Kết quả tìm kiếm — LàngNghề.vn',
  description: 'Tìm sản phẩm thủ công mỹ nghệ từ hàng nghìn xưởng làng nghề Việt Nam.',
};

// Ported from search_results_page.html. Layout, content and interactions
// (filters, view toggle, related searches, pagination) are preserved; data
// is still hardcoded pending the real search API.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return <SearchPageClient initialQuery={q ?? 'bình gốm bát tràng'} />;
}
