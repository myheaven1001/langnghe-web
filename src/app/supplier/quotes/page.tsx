import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, Pill } from '@/components/ui';
import { formatVnDate, formatVnd } from '@/lib/format';
import { SUPPLIER_QUOTE_STATUS } from '@/lib/quotes';
import { buildSupplierNavGroups } from '../_lib/nav';
import { getNewRfqCount, getUnreadNotificationCount } from '../_lib/counts';

export const metadata: Metadata = {
  title: 'Báo giá đã gửi — LàngNghề.vn',
};

const PAGE_SIZE = 20;

const TABS = [
  { key: 'all', label: 'Tất cả', statuses: null },
  { key: 'pending', label: 'Đang chờ', statuses: ['pending', 'counter_offered'] },
  { key: 'accepted', label: 'Được chấp nhận', statuses: ['accepted'] },
  { key: 'rejected', label: 'Không được chọn', statuses: ['rejected'] },
  { key: 'withdrawn', label: 'Đã rút', statuses: ['withdrawn'] },
] as const;
type TabKey = (typeof TABS)[number]['key'];

interface QuoteRow {
  id: string;
  rfq_id: string;
  unit_price: number;
  lead_time_days: number | null;
  status: string;
  created_at: string;
  rfq_requests: {
    title: string;
    quantity: number;
    unit: string | null;
    buyer_profiles: { company_name: string } | null;
  } | null;
}

function buildUrl(tab: TabKey, page = 1) {
  const search = new URLSearchParams();
  if (tab !== 'all') search.set('status', tab);
  if (page > 1) search.set('page', String(page));
  const qs = search.toString();
  return qs ? `/supplier/quotes?${qs}` : '/supplier/quotes';
}

// Mọi báo giá xưởng đã gửi (kế hoạch 4.6), kể cả đã rút — mỗi dòng dẫn về
// trang RFQ để sửa / rút / xem đơn.
export default async function SupplierQuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === sp.status) ? (sp.status as TabKey) : 'all';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const activeTab = TABS.find((t) => t.key === tab)!;

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

  const from = (page - 1) * PAGE_SIZE;
  let listQuery = supabase
    .from('rfq_quotes')
    .select(
      'id, rfq_id, unit_price, lead_time_days, status, created_at, rfq_requests(title, quantity, unit, buyer_profiles(company_name))',
      { count: 'exact' },
    )
    .eq('supplier_id', supplier.id)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (activeTab.statuses) listQuery = listQuery.in('status', [...activeTab.statuses]);

  const [newRfqCount, unreadCount, { data: quotesData, count }] = await Promise.all([
    getNewRfqCount(supabase, supplier.id),
    getUnreadNotificationCount(supabase, user.id),
    listQuery,
  ]);

  const quotes = (quotesData ?? []) as unknown as QuoteRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

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
      <div className="mb-4">
        <h1 className="text-xl font-bold">Báo giá đã gửi</h1>
        <div className="text-brand-sub mt-1 text-[13px]">{count ?? 0} báo giá ở mục này.</div>
      </div>

      <div className="border-brand-border mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={buildUrl(t.key)}
            className={`flex min-h-10 items-center border-b-2 px-3.5 text-[13px] font-semibold whitespace-nowrap ${
              t.key === tab
                ? 'border-brand-red text-brand-red'
                : 'text-brand-sub hover:text-brand-red border-transparent'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {quotes.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-12 text-center">
          <div className="mb-2.5 text-[32px]">📭</div>
          <div className="mb-1.5 text-sm font-bold">Chưa có báo giá nào ở mục này</div>
          <Link href="/supplier/rfq" className="text-brand-red text-[13px] font-semibold">
            Xem RFQ đang chờ báo giá →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {quotes.map((q) => {
            const rfq = q.rfq_requests;
            const status = SUPPLIER_QUOTE_STATUS[q.status];
            return (
              <Link
                key={q.id}
                href={`/supplier/rfq/${q.rfq_id}`}
                className="border-brand-border hover:border-brand-clay flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border bg-white px-4 py-3"
              >
                <div className="min-w-0 flex-1 basis-[220px]">
                  <div className="text-brand-ink line-clamp-2 text-sm font-bold">
                    {rfq?.title ?? 'RFQ'}
                  </div>
                  <div className="text-brand-sub mt-0.5 text-xs">
                    {rfq?.buyer_profiles?.company_name ?? 'Buyer'}
                    {rfq ? ` · ${rfq.quantity.toLocaleString('vi-VN')} ${rfq.unit ?? ''}` : ''} ·
                    gửi {formatVnDate(q.created_at)}
                  </div>
                </div>
                <div className="shrink-0">
                  <div className="font-tight text-[15px] font-bold">{formatVnd(q.unit_price)}</div>
                  <div className="text-brand-sub text-xs">
                    {q.lead_time_days != null ? `${q.lead_time_days} ngày sản xuất` : 'đơn giá'}
                  </div>
                </div>
                <div className="ml-auto shrink-0">
                  <Pill tone={status?.tone ?? 'gray'}>{status?.label ?? q.status}</Pill>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3 text-[13px]">
          {page > 1 ? (
            <Link
              href={buildUrl(tab, page - 1)}
              className="text-brand-red min-h-10 px-2 font-semibold"
            >
              ‹ Trước
            </Link>
          ) : (
            <span className="text-brand-light px-2">‹ Trước</span>
          )}
          <span className="text-brand-sub">
            Trang {page}/{totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={buildUrl(tab, page + 1)}
              className="text-brand-red min-h-10 px-2 font-semibold"
            >
              Sau ›
            </Link>
          ) : (
            <span className="text-brand-light px-2">Sau ›</span>
          )}
        </div>
      )}
    </AppShell>
  );
}
