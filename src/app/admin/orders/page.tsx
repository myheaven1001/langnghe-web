import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, StatusPill } from '@/components/ui';
import { daysAgoIso, formatVnDate, formatVnd } from '@/lib/format';
import { buildAdminNavGroups } from '../_lib/nav';
import { AdminOrderFilterBar } from './_components/AdminOrderFilterBar';
import { OrderAdminActions } from './_components/OrderAdminActions';

export const metadata: Metadata = {
  title: 'Quản lý đơn hàng — LàngNghề.vn Admin',
};

const PAGE_SIZE = 10;

const TABS = [
  { key: 'all', label: 'Tất cả', statuses: null },
  { key: 'pending_payment', label: 'Chờ xác nhận TT', statuses: ['pending_payment'] },
  {
    key: 'processing',
    label: 'Đang xử lý',
    statuses: ['confirmed', 'producing', 'shipped', 'delivered'],
  },
  { key: 'disputed', label: 'Tranh chấp', statuses: null },
  { key: 'completed', label: 'Hoàn tất', statuses: ['completed'] },
] as const;

type StatusKey = (typeof TABS)[number]['key'];

const RANGE_DAYS: Record<string, number | null> = { '30': 30, '90': 90, all: null };

// Đơn có thể "Báo tranh chấp" khi đã có gì đó để tranh chấp (đã xác nhận
// thanh toán / đang giao / đã xong) — pending_payment (chưa có gì xảy ra)
// và cancelled (đã hủy) thì không cần.
const DISPUTABLE_STATUSES = ['confirmed', 'producing', 'shipped', 'delivered', 'completed'];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface OrderRow {
  id: string;
  total_amount: number;
  status: string;
  created_at: string;
  tracking_number: string | null;
  buyer_profiles: { company_name: string; user_id: string } | null;
  supplier_profiles: { shop_name: string; user_id: string } | null;
}

interface ActiveDispute {
  id: string;
  order_id: string;
  reason: string;
}

function buildOrdersUrl(params: { status: string; q: string; range: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.status !== 'all') search.set('status', params.status);
  if (params.q) search.set('q', params.q);
  if (params.range !== '30') search.set('range', params.range);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  const qs = search.toString();
  return qs ? `/admin/orders?${qs}` : '/admin/orders';
}

// UUID hợp lệ nhưng không khớp đơn nào thật — dùng khi tab "disputed"
// không có tranh chấp nào đang mở, để .in('id', [...]) không nhận mảng
// rỗng (Postgrest sẽ lỗi) mà vẫn ép ra 0 kết quả.
const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000';

function countOrders(
  supabase: SupabaseServerClient,
  tab: (typeof TABS)[number],
  disputedOrderIds: string[],
  sinceIso: string | null,
  buyerIds: string[],
  supplierIds: string[],
  q: string,
) {
  let query = supabase.from('orders').select('id', { count: 'exact', head: true });
  if (tab.key === 'disputed') {
    query = query.in('id', disputedOrderIds.length > 0 ? disputedOrderIds : [NO_MATCH_ID]);
  } else {
    if (tab.statuses) query = query.in('status', [...tab.statuses]);
    if (disputedOrderIds.length > 0)
      query = query.not('id', 'in', `(${disputedOrderIds.join(',')})`);
  }
  if (sinceIso) query = query.gte('created_at', sinceIso);
  if (q) {
    const orParts = [`tracking_number.ilike.%${q}%`];
    if (buyerIds.length > 0) orParts.push(`buyer_id.in.(${buyerIds.join(',')})`);
    if (supplierIds.length > 0) orParts.push(`supplier_id.in.(${supplierIds.join(',')})`);
    query = query.or(orParts.join(','));
  }
  return query;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; range?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status: StatusKey = TABS.some((t) => t.key === sp.status)
    ? (sp.status as StatusKey)
    : 'all';
  const q = (sp.q ?? '').trim();
  const range = sp.range && sp.range in RANGE_DAYS ? sp.range : '30';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const activeTab = TABS.find((t) => t.key === status)!;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Route is already gated to role = 'admin' in middleware — re-checked
  // here same as the other /admin/* pages.
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/');

  const rangeDays = RANGE_DAYS[range];
  const sinceIso = rangeDays ? daysAgoIso(rangeDays) : null;

  let buyerIdsMatchingSearch: string[] = [];
  let supplierIdsMatchingSearch: string[] = [];
  if (q) {
    const [{ data: matchedBuyers }, { data: matchedSuppliers }] = await Promise.all([
      supabase.from('buyer_profiles').select('id').ilike('company_name', `%${q}%`),
      supabase.from('supplier_profiles').select('id').ilike('shop_name', `%${q}%`),
    ]);
    buyerIdsMatchingSearch = (matchedBuyers ?? []).map((b) => b.id);
    supplierIdsMatchingSearch = (matchedSuppliers ?? []).map((s) => s.id);
  }

  // Tranh chấp đang mở/đang xem xét — dùng để: (a) tách hẳn ra tab "Tranh
  // chấp" khỏi tab theo status của nó, (b) hiện nút "Xử lý" đúng đơn.
  const { data: activeDisputesData } = await supabase
    .from('disputes')
    .select('id, order_id, reason')
    .in('status', ['open', 'investigating']);
  const activeDisputes = (activeDisputesData ?? []) as ActiveDispute[];
  const disputedOrderIds = activeDisputes.map((d) => d.order_id);
  const disputeByOrderId = new Map(activeDisputes.map((d) => [d.order_id, d]));

  const from = (page - 1) * PAGE_SIZE;

  let listQuery = supabase
    .from('orders')
    .select(
      'id, total_amount, status, created_at, tracking_number, buyer_profiles(company_name, user_id), supplier_profiles(shop_name, user_id)',
    );
  if (activeTab.key === 'disputed') {
    listQuery = listQuery.in('id', disputedOrderIds.length > 0 ? disputedOrderIds : [NO_MATCH_ID]);
  } else {
    if (activeTab.statuses) listQuery = listQuery.in('status', [...activeTab.statuses]);
    if (disputedOrderIds.length > 0) {
      listQuery = listQuery.not('id', 'in', `(${disputedOrderIds.join(',')})`);
    }
  }
  if (sinceIso) listQuery = listQuery.gte('created_at', sinceIso);
  if (q) {
    const orParts = [`tracking_number.ilike.%${q}%`];
    if (buyerIdsMatchingSearch.length > 0) {
      orParts.push(`buyer_id.in.(${buyerIdsMatchingSearch.join(',')})`);
    }
    if (supplierIdsMatchingSearch.length > 0) {
      orParts.push(`supplier_id.in.(${supplierIdsMatchingSearch.join(',')})`);
    }
    listQuery = listQuery.or(orParts.join(','));
  }
  listQuery = listQuery.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);

  const [
    { count: unreadCount },
    { count: pendingVerificationCount },
    tabCounts,
    { data: ordersData },
  ] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false),
    supabase
      .from('verifications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    Promise.all(
      TABS.map((tab) =>
        countOrders(
          supabase,
          tab,
          disputedOrderIds,
          sinceIso,
          buyerIdsMatchingSearch,
          supplierIdsMatchingSearch,
          q,
        ),
      ),
    ),
    listQuery,
  ]);

  const orders = (ordersData ?? []) as unknown as OrderRow[];
  const activeTabIndex = TABS.findIndex((t) => t.key === status);
  const totalCount = tabCounts[activeTabIndex]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const allCount = tabCounts[0]?.count ?? 0;
  const pendingPaymentCount = tabCounts[1]?.count ?? 0;
  const disputedCount = tabCounts[3]?.count ?? 0;

  return (
    <AppShell
      header={{
        icons: [{ icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined }],
        userName: user.email ?? 'Admin',
        userRole: 'Quản trị viên',
        userInitial: 'A',
      }}
      navGroups={buildAdminNavGroups({ pendingVerificationCount: pendingVerificationCount ?? 0 })}
    >
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/admin" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Quản lý đơn hàng</span>
      </div>

      <div className="mb-[18px]">
        <div className="text-xl font-bold">Quản lý đơn hàng</div>
        <div className="text-brand-sub mt-1 text-[12.5px]">
          {allCount} đơn hàng · {pendingPaymentCount} chờ xác nhận thanh toán · {disputedCount}{' '}
          tranh chấp
        </div>
      </div>

      <div className="border-brand-border mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((tab, i) => {
          const isActive = tab.key === status;
          return (
            <Link
              key={tab.key}
              href={buildOrdersUrl({ status: tab.key, q, range })}
              className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[12.5px] font-semibold whitespace-nowrap ${
                isActive
                  ? 'border-brand-forest text-brand-forest'
                  : 'text-brand-sub hover:text-brand-forest border-transparent'
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${
                  isActive ? 'bg-status-green-soft text-brand-forest' : 'bg-brand-bg text-brand-sub'
                }`}
              >
                {tabCounts[i]?.count ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <AdminOrderFilterBar status={status} q={q} range={range} />
        <span className="text-brand-sub mb-3.5 shrink-0 text-xs">{totalCount} kết quả</span>
      </div>

      {orders.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-[50px] text-center">
          <div className="mb-2.5 text-[32px]">📭</div>
          <div className="mb-1.5 text-sm font-bold">Không có đơn hàng nào ở mục này</div>
        </div>
      ) : (
        <div className="border-brand-border overflow-hidden rounded-[10px] border bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-brand-bg border-brand-border border-b">
                {['Mã đơn', 'Buyer → Supplier', 'Giá trị', 'Ngày đặt', 'Trạng thái', ''].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-brand-light px-3.5 py-2.5 text-left text-[10.5px] font-bold tracking-[.05em] uppercase"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const dispute = disputeByOrderId.get(order.id) ?? null;
                const canFlagDispute = !dispute && DISPUTABLE_STATUSES.includes(order.status);
                return (
                  <tr
                    key={order.id}
                    className="border-b border-[#F2F0EC] last:border-b-0 hover:bg-[#FAFAF8]"
                  >
                    <td className="px-3.5 py-3 text-[12.5px] font-bold">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="flex flex-col gap-0.5 text-[12px]">
                        <span className="font-semibold">
                          {order.buyer_profiles?.company_name ?? 'Buyer'}
                        </span>
                        <span className="text-brand-light text-[10px]">↓</span>
                        <span className="text-brand-sub">
                          {order.supplier_profiles?.shop_name ?? 'Xưởng'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-[12.5px] font-bold">
                      {formatVnd(order.total_amount)}
                    </td>
                    <td className="px-3.5 py-3 text-[12px]">{formatVnDate(order.created_at)}</td>
                    <td className="px-3.5 py-3">
                      <StatusPill domain="order" status={dispute ? 'disputed' : order.status} />
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <OrderAdminActions
                        orderId={order.id}
                        status={order.status}
                        adminUserId={user.id}
                        buyerUserId={order.buyer_profiles?.user_id ?? null}
                        activeDispute={dispute}
                        canFlagDispute={canFlagDispute}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-[22px] flex items-center justify-center gap-1.5">
          <Link
            href={buildOrdersUrl({ status, q, range, page: page - 1 })}
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
            href={buildOrdersUrl({ status, q, range, page: page + 1 })}
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
