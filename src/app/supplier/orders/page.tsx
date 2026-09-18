import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, StatusPill } from '@/components/ui';
import { daysAgoIso, formatVnDate, formatVnd } from '@/lib/format';
import { buildSupplierNavGroups } from '../_lib/nav';
import { getNewRfqCount, getUnreadNotificationCount } from '../_lib/counts';
import { SupplierOrderFilterBar } from './_components/SupplierOrderFilterBar';
import { OrderActions } from './_components/OrderActions';

export const metadata: Metadata = {
  title: 'Quản lý đơn hàng — LàngNghề.vn',
};

const PAGE_SIZE = 10;

const STATUS_TABS = [
  { key: 'all', label: 'Tất cả', statuses: null },
  { key: 'pending_payment', label: 'Chờ thanh toán', statuses: ['pending_payment'] },
  { key: 'confirmed', label: 'Đã xác nhận', statuses: ['confirmed'] },
  { key: 'producing', label: 'Đang sản xuất', statuses: ['producing'] },
  { key: 'shipped', label: 'Đang giao', statuses: ['shipped'] },
  { key: 'delivered', label: 'Đã giao', statuses: ['delivered'] },
  { key: 'completed', label: 'Hoàn tất', statuses: ['completed'] },
  { key: 'cancelled', label: 'Đã hủy', statuses: ['cancelled'] },
] as const;

type StatusKey = (typeof STATUS_TABS)[number]['key'];

const PROGRESS_STATUSES = ['pending_payment', 'confirmed', 'producing', 'shipped', 'delivered'];

const STATUS_NOTE: Record<string, string> = {
  pending_payment: '⏳ Đang chờ buyer thanh toán',
  confirmed: '✓ Đã thanh toán — sẵn sàng bắt đầu sản xuất',
  producing: '🧵 Đang sản xuất',
  delivered: '📬 Đã giao hàng',
  completed: '✅ Đơn hàng đã hoàn tất',
  cancelled: '✕ Đơn hàng đã bị hủy',
};

const RANGE_DAYS: Record<string, number | null> = { '30': 30, '90': 90, all: null };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface OrderRow {
  id: string;
  quantity: number;
  total_amount: number;
  status: string;
  tracking_number: string | null;
  logistics_provider: string | null;
  created_at: string;
  buyer_profiles: { company_name: string } | null;
  rfq_quotes: { rfq_requests: { title: string; unit: string | null } | null } | null;
}

function buildOrdersUrl(params: { status: string; q: string; range: string; sort: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.status !== 'all') search.set('status', params.status);
  if (params.q) search.set('q', params.q);
  if (params.range !== '30') search.set('range', params.range);
  if (params.sort !== 'newest') search.set('sort', params.sort);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  const qs = search.toString();
  return qs ? `/supplier/orders?${qs}` : '/supplier/orders';
}

function countOrders(
  supabase: SupabaseServerClient,
  supplierId: string,
  statuses: readonly string[] | null,
  sinceIso: string | null,
  buyerIds: string[] | null,
  q: string,
) {
  let query = supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', supplierId);
  if (statuses) query = query.in('status', [...statuses]);
  if (sinceIso) query = query.gte('created_at', sinceIso);
  if (q) {
    query =
      buyerIds && buyerIds.length > 0
        ? query.or(`tracking_number.ilike.%${q}%,buyer_id.in.(${buyerIds.join(',')})`)
        : query.ilike('tracking_number', `%${q}%`);
  }
  return query;
}

export default async function SupplierOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; range?: string; sort?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status: StatusKey = STATUS_TABS.some((t) => t.key === sp.status) ? (sp.status as StatusKey) : 'all';
  const q = (sp.q ?? '').trim();
  const range = sp.range && sp.range in RANGE_DAYS ? sp.range : '30';
  const sort = sp.sort === 'value' ? 'value' : 'newest';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const activeTab = STATUS_TABS.find((t) => t.key === status)!;

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

  const rangeDays = RANGE_DAYS[range];
  const sinceIso = rangeDays ? daysAgoIso(rangeDays) : null;

  let buyerIdsMatchingSearch: string[] | null = null;
  if (q) {
    const { data: matchedBuyers } = await supabase
      .from('buyer_profiles')
      .select('id')
      .ilike('company_name', `%${q}%`);
    buyerIdsMatchingSearch = (matchedBuyers ?? []).map((b) => b.id);
  }

  const from = (page - 1) * PAGE_SIZE;

  let listQuery = supabase
    .from('orders')
    .select(
      'id, quantity, total_amount, status, tracking_number, logistics_provider, created_at, buyer_profiles(company_name), rfq_quotes(rfq_requests(title, unit))',
    )
    .eq('supplier_id', supplier.id);
  if (activeTab.statuses) listQuery = listQuery.in('status', [...activeTab.statuses]);
  if (sinceIso) listQuery = listQuery.gte('created_at', sinceIso);
  if (q) {
    listQuery =
      buyerIdsMatchingSearch && buyerIdsMatchingSearch.length > 0
        ? listQuery.or(`tracking_number.ilike.%${q}%,buyer_id.in.(${buyerIdsMatchingSearch.join(',')})`)
        : listQuery.ilike('tracking_number', `%${q}%`);
  }
  listQuery =
    sort === 'value'
      ? listQuery.order('total_amount', { ascending: false })
      : listQuery.order('created_at', { ascending: false });
  listQuery = listQuery.range(from, from + PAGE_SIZE - 1);

  const [newRfqCount, unreadCount, tabCounts, { data: ordersData }] = await Promise.all([
    getNewRfqCount(supabase, supplier.id),
    getUnreadNotificationCount(supabase, user.id),
    Promise.all(
      STATUS_TABS.map((tab) => countOrders(supabase, supplier.id, tab.statuses, sinceIso, buyerIdsMatchingSearch, q)),
    ),
    listQuery,
  ]);

  const orders = (ordersData ?? []) as unknown as OrderRow[];
  const activeTabIndex = STATUS_TABS.findIndex((t) => t.key === status);
  const totalCount = tabCounts[activeTabIndex]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const allCount = tabCounts[0]?.count ?? 0;
  const pendingPaymentCount = tabCounts[1]?.count ?? 0;
  const processingCount =
    (tabCounts[2]?.count ?? 0) + (tabCounts[3]?.count ?? 0) + (tabCounts[4]?.count ?? 0) + (tabCounts[5]?.count ?? 0);

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
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/supplier/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Quản lý đơn hàng</span>
      </div>

      <div className="mb-[18px]">
        <div className="text-xl font-bold">Quản lý đơn hàng</div>
        <div className="text-brand-sub mt-1 text-[12.5px]">
          {allCount} đơn hàng · {pendingPaymentCount} chờ thanh toán · {processingCount} đang xử lý
        </div>
      </div>

      <div className="border-brand-border mb-4 flex gap-1 overflow-x-auto border-b">
        {STATUS_TABS.map((tab, i) => {
          const isActive = tab.key === status;
          return (
            <Link
              key={tab.key}
              href={buildOrdersUrl({ status: tab.key, q, range, sort })}
              className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[12.5px] font-semibold whitespace-nowrap ${
                isActive
                  ? 'border-brand-red text-brand-red'
                  : 'text-brand-sub hover:text-brand-red border-transparent'
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${
                  isActive ? 'bg-status-red-soft text-brand-red' : 'bg-brand-bg text-brand-sub'
                }`}
              >
                {tabCounts[i]?.count ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <SupplierOrderFilterBar status={status} q={q} range={range} sort={sort} />
        <span className="text-brand-sub mb-3.5 shrink-0 text-xs">{totalCount} kết quả</span>
      </div>

      {orders.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-[50px] text-center">
          <div className="mb-2.5 text-[32px]">📭</div>
          <div className="mb-1.5 text-sm font-bold">Không có đơn hàng nào ở mục này</div>
          <div className="text-brand-sub text-xs">Đơn hàng sẽ xuất hiện ở đây khi buyer chốt báo giá của bạn.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {orders.map((order) => {
            const progressIndex = PROGRESS_STATUSES.indexOf(order.status);
            const isCancelled = order.status === 'cancelled';
            const isCompleted = order.status === 'completed';
            const note =
              order.status === 'shipped'
                ? order.tracking_number
                  ? `🚚 ${order.logistics_provider ?? 'Đang giao'} · ${order.tracking_number}`
                  : '🚚 Đơn hàng đang được giao'
                : STATUS_NOTE[order.status];

            return (
              <div
                key={order.id}
                className={`border-brand-border rounded-[10px] border bg-white p-3.5 px-4 ${isCancelled ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="bg-brand-bg flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[9px] text-xl">
                    📦
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <span className="text-brand-light shrink-0 text-[11.5px] font-semibold">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="text-brand-ink truncate text-[13.5px] font-bold">
                        {order.buyer_profiles?.company_name ?? 'Buyer'} —{' '}
                        {order.rfq_quotes?.rfq_requests?.title ?? 'Đơn hàng'}
                      </span>
                    </div>
                    <div className="text-brand-light flex flex-wrap gap-3 text-[11.5px]">
                      <span>
                        <b className="text-brand-sub font-semibold">{order.quantity.toLocaleString('vi-VN')}</b>{' '}
                        {order.rfq_quotes?.rfq_requests?.unit ?? ''}
                      </span>
                      <span>Đặt ngày {formatVnDate(order.created_at)}</span>
                    </div>
                  </div>
                  <div className="min-w-[120px] shrink-0 text-right">
                    <div className="font-tight text-[15px] font-bold">{formatVnd(order.total_amount)}</div>
                    <div className="text-brand-light mt-px text-[10px]">tổng giá trị</div>
                  </div>
                  <div className="min-w-[118px] shrink-0 text-right">
                    <StatusPill domain="order" status={order.status} />
                  </div>
                </div>

                {!isCancelled && (
                  <div className="mt-3 flex items-center gap-1.5 border-t border-[#F2F0EC] pt-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full ${
                          isCompleted || i < progressIndex
                            ? 'bg-brand-green'
                            : i === progressIndex
                              ? 'bg-brand-orange'
                              : 'bg-brand-bg'
                        }`}
                      />
                    ))}
                  </div>
                )}

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#F2F0EC] pt-2.5">
                  {note && <div className="text-brand-sub text-[11.5px]">{note}</div>}
                  <OrderActions orderId={order.id} status={order.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-[22px] flex items-center justify-center gap-1.5">
          <Link
            href={buildOrdersUrl({ status, q, range, sort, page: page - 1 })}
            aria-disabled={page <= 1}
            className={`border-brand-border flex h-8 w-8 items-center justify-center rounded-md border text-[13px] ${
              page <= 1
                ? 'text-brand-light pointer-events-none opacity-40'
                : 'text-brand-sub hover:border-brand-clay hover:text-brand-ink bg-white'
            }`}
          >
            ‹
          </Link>
          <span className="text-brand-sub px-2 text-xs">
            Trang {page}/{totalPages}
          </span>
          <Link
            href={buildOrdersUrl({ status, q, range, sort, page: page + 1 })}
            aria-disabled={page >= totalPages}
            className={`border-brand-border flex h-8 w-8 items-center justify-center rounded-md border text-[13px] ${
              page >= totalPages
                ? 'text-brand-light pointer-events-none opacity-40'
                : 'text-brand-sub hover:border-brand-clay hover:text-brand-ink bg-white'
            }`}
          >
            ›
          </Link>
        </div>
      )}
    </AppShell>
  );
}
