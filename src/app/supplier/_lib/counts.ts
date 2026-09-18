import type { createClient } from '@/lib/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getUnreadNotificationCount(supabase: SupabaseServerClient, userId: string) {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  return count ?? 0;
}

// RFQ id supplier này đã báo giá rồi — dùng để loại khỏi "RFQ cần báo giá"
// (RLS rfq_requests_supplier_view đã tự giới hạn những RFQ supplier này
// được thấy — xem giải thích trong /supplier/dashboard).
export async function getQuotedRfqIds(supabase: SupabaseServerClient, supplierId: string) {
  const { data } = await supabase.from('rfq_quotes').select('rfq_id').eq('supplier_id', supplierId);
  return (data ?? []).map((r) => r.rfq_id as string);
}

export async function getNewRfqCount(supabase: SupabaseServerClient, supplierId: string) {
  const quotedIds = await getQuotedRfqIds(supabase, supplierId);
  let query = supabase
    .from('rfq_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published');
  if (quotedIds.length > 0) {
    query = query.not('id', 'in', `(${quotedIds.join(',')})`);
  }
  const { count } = await query;
  return count ?? 0;
}
