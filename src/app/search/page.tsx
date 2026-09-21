import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { SearchPageClient } from './_components/SearchPageClient';

export const metadata: Metadata = {
  title: 'Kết quả tìm kiếm — LàngNghề.vn',
  description: 'Tìm sản phẩm thủ công mỹ nghệ từ hàng nghìn xưởng làng nghề Việt Nam.',
};

// Ghi 1 dòng search_logs cho mỗi lượt tìm kiếm (migration
// 20261002090000). log_search() tự đếm result_count bằng full-text search
// của products và lấy user_id từ JWT (NULL nếu chưa đăng nhập), nên ở đây
// chỉ cần truyền chuỗi tìm kiếm. Lỗi ghi log không được làm hỏng trang tìm
// kiếm → chỉ console.error.
async function logSearch(query: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('log_search', { p_query: query });
    if (error) console.error('log_search failed:', error.message);
  } catch (e) {
    console.error('log_search failed:', e);
  }
}

// Ported from search_results_page.html. Layout, content and interactions
// (filters, view toggle, related searches, pagination) are preserved; the
// product list is still hardcoded pending the real search API — but every
// search with a non-empty `q` is now recorded in search_logs.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  // Không có ?q= (mở /search trực tiếp) thì không phải một lượt tìm kiếm.
  const trimmed = q?.trim();
  if (trimmed) await logSearch(trimmed);

  return <SearchPageClient initialQuery={q ?? 'bình gốm bát tràng'} />;
}
