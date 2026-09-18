import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui';
import { buildSupplierNavGroups } from '../_lib/nav';
import { getNewRfqCount, getUnreadNotificationCount } from '../_lib/counts';
import { RfqInboxClient, type InboxRfqRow, type MyQuoteRow } from './_components/RfqInboxClient';

export const metadata: Metadata = {
  title: 'RFQ nhận được — LàngNghề.vn',
};

interface RfqRequestRow {
  id: string;
  title: string;
  quantity: number;
  unit: string | null;
  budget_min: number | null;
  budget_max: number | null;
  rfq_type: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  deadline_days: number | null;
  buyer_profiles: { id: string; company_name: string } | null;
}

export default async function SupplierRfqInboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: supplier } = await supabase
    .from('supplier_profiles')
    .select('id, shop_name')
    .eq('user_id', user.id)
    .single();

  if (!supplier) redirect('/');

  // RLS (rfq_requests_supplier_view) đã tự giới hạn danh sách này đúng
  // những RFQ supplier này được mời (rfq_targets), đã báo giá, hoặc
  // multi-RFQ đúng ngành hàng còn 'published' — không cần lọc thêm.
  // Không phân trang ở tầng SQL vì "tab" (mới/đã báo giá/thắng/đóng) tính
  // từ việc so khớp rfq với báo giá CỦA CHÍNH supplier này trong JS (không
  // biểu diễn gọn bằng 1 WHERE); quy mô "RFQ 1 supplier từng thấy" trong
  // MVP đủ nhỏ để tải hết 1 lần rồi lọc/phân trang ở dưới, khác hẳn danh
  // sách công khai (sản phẩm, buyer...) vốn cần phân trang tại DB.
  const [unreadCount, newRfqCount, { data: rfqsData }, { data: myQuotesData }] = await Promise.all([
    getUnreadNotificationCount(supabase, user.id),
    getNewRfqCount(supabase, supplier.id),
    supabase
      .from('rfq_requests')
      .select(
        'id, title, quantity, unit, budget_min, budget_max, rfq_type, status, created_at, expires_at, deadline_days, buyer_profiles(id, company_name)',
      )
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('rfq_quotes')
      .select('id, rfq_id, unit_price, min_qty, lead_time_days, valid_until, status, created_at')
      .eq('supplier_id', supplier.id),
  ]);

  const rfqs = (rfqsData ?? []) as unknown as RfqRequestRow[];
  const myQuotes = (myQuotesData ?? []) as MyQuoteRow[];

  const buyerIds = [...new Set(rfqs.map((r) => r.buyer_profiles?.id).filter((id): id is string => !!id))];
  const { data: verifiedRows } = buyerIds.length
    ? await supabase
        .from('verifications')
        .select('entity_id')
        .eq('entity_type', 'buyer')
        .eq('status', 'approved')
        .in('entity_id', buyerIds)
    : { data: [] as { entity_id: string }[] };
  const verifiedBuyerIds = new Set((verifiedRows ?? []).map((v) => v.entity_id));

  const inboxRows: InboxRfqRow[] = rfqs.map((r) => ({
    id: r.id,
    title: r.title,
    quantity: r.quantity,
    unit: r.unit,
    budgetMin: r.budget_min,
    budgetMax: r.budget_max,
    rfqType: r.rfq_type,
    status: r.status,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    deadlineDays: r.deadline_days,
    buyerName: r.buyer_profiles?.company_name ?? 'Buyer',
    buyerVerified: r.buyer_profiles ? verifiedBuyerIds.has(r.buyer_profiles.id) : false,
  }));

  return (
    <AppShell
      header={{
        icons: [
          { icon: '💬', title: 'Tin nhắn' },
          { icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined },
        ],
        userName: supplier.shop_name,
        userRole: 'Supplier',
      }}
      navGroups={buildSupplierNavGroups({ newRfqCount, unreadCount })}
    >
      <RfqInboxClient rfqs={inboxRows} myQuotes={myQuotes} />
    </AppShell>
  );
}
