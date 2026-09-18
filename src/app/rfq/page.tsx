import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, StatusPill } from '@/components/ui';
import { effectiveDeadline, formatVnDate, daysUntil } from '@/lib/rfq';
import { RfqFilterBar } from './_components/RfqFilterBar';

export const metadata: Metadata = {
  title: 'RFQ của tôi — LàngNghề.vn',
};

const PAGE_SIZE = 10;

const STATUS_TABS = [
  { key: 'all', label: 'Tất cả', statuses: null },
  { key: 'published', label: 'Đang chờ báo giá', statuses: ['published'] },
  { key: 'quoted', label: 'Đã có báo giá', statuses: ['quoted'] },
  { key: 'negotiating', label: 'Đang đàm phán', statuses: ['negotiating'] },
  { key: 'awarded', label: 'Đã chốt', statuses: ['awarded'] },
  { key: 'closed', label: 'Đã đóng', statuses: ['closed', 'expired', 'cancelled'] },
] as const;

type StatusKey = (typeof STATUS_TABS)[number]['key'];

const RFQ_TYPE_LABEL: Record<string, string> = {
  single: 'RFQ đơn',
  multi: 'Multi-RFQ',
};

// Deadline sub-label for RFQs that are no longer waiting on a quote — the
// countdown only makes sense while status is published/quoted/negotiating.
const SETTLED_DEADLINE_LABEL: Record<string, string> = {
  awarded: 'Đã chốt',
  closed: 'Hoàn tất',
  expired: 'Hết hạn',
  cancelled: 'Đã hủy',
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface RfqRow {
  id: string;
  title: string;
  quantity: number;
  unit: string | null;
  rfq_type: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  deadline_days: number | null;
  categories: { name: string } | null;
  rfq_quotes: { count: number }[] | null;
  rfq_targets: { count: number }[] | null;
}

function buildRfqUrl(params: {
  status: string;
  q: string;
  category: string;
  sort: string;
  page?: number;
}) {
  const search = new URLSearchParams();
  if (params.status !== 'all') search.set('status', params.status);
  if (params.q) search.set('q', params.q);
  if (params.category) search.set('category', params.category);
  if (params.sort !== 'newest') search.set('sort', params.sort);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  const qs = search.toString();
  return qs ? `/rfq?${qs}` : '/rfq';
}

// Shared filter chain for both the row-count queries (one per tab) and the
// paginated list query — keeps status/category/q filtering identical
// between "8 kết quả" and what actually renders.
function countRfqs(
  supabase: SupabaseServerClient,
  buyerId: string,
  statuses: readonly string[] | null,
  category: string,
  q: string,
) {
  let query = supabase
    .from('rfq_requests')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_id', buyerId);
  if (statuses) query = query.in('status', [...statuses]);
  if (category) query = query.eq('category_id', category);
  if (q) query = query.ilike('title', `%${q}%`);
  return query;
}

export default async function RfqListPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    category?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const status: StatusKey = STATUS_TABS.some((t) => t.key === sp.status)
    ? (sp.status as StatusKey)
    : 'all';
  const q = (sp.q ?? '').trim();
  const category = sp.category ?? '';
  const sort = sp.sort === 'deadline' ? 'deadline' : 'newest';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const activeTab = STATUS_TABS.find((t) => t.key === status)!;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: buyer } = await supabase
    .from('buyer_profiles')
    .select('id, company_name')
    .eq('user_id', user.id)
    .single();

  // Trang này chỉ dành cho buyer — giống rfq/new.
  if (!buyer) redirect('/');

  const from = (page - 1) * PAGE_SIZE;

  let listQuery = supabase
    .from('rfq_requests')
    .select(
      'id, title, quantity, unit, rfq_type, status, created_at, expires_at, deadline_days, categories(name), rfq_quotes(count), rfq_targets(count)',
    )
    .eq('buyer_id', buyer.id);
  if (activeTab.statuses) listQuery = listQuery.in('status', [...activeTab.statuses]);
  if (category) listQuery = listQuery.eq('category_id', category);
  if (q) listQuery = listQuery.ilike('title', `%${q}%`);
  listQuery =
    sort === 'deadline'
      ? // expires_at is usually still NULL (see effectiveDeadline in lib/rfq.ts)
        // — deadline_days is the real signal for urgency in that case.
        listQuery
          .order('expires_at', { ascending: true, nullsFirst: false })
          .order('deadline_days', { ascending: true, nullsFirst: false })
      : listQuery.order('created_at', { ascending: false });
  listQuery = listQuery.range(from, from + PAGE_SIZE - 1);

  const [{ data: categories }, tabCounts, { data: unreadCount }, { data: rfqsData }] =
    await Promise.all([
      supabase.from('categories').select('id, name').order('sort_order'),
      Promise.all(
        STATUS_TABS.map((tab) => countRfqs(supabase, buyer.id, tab.statuses, category, q)),
      ),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .then((r) => ({ data: r.count ?? 0 })),
      listQuery,
    ]);

  const rfqs = (rfqsData ?? []) as unknown as RfqRow[];
  const activeTabIndex = STATUS_TABS.findIndex((t) => t.key === status);
  const totalCount = tabCounts[activeTabIndex]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  // "đang hoạt động" = published + quoted + negotiating (matches dashboard's
  // ACTIVE_RFQ_STATUSES grouping), read straight off the tab counts we
  // already fetched instead of a separate query.
  const activeRfqCount =
    (tabCounts[1]?.count ?? 0) + (tabCounts[2]?.count ?? 0) + (tabCounts[3]?.count ?? 0);

  return (
    <AppShell
      header={{
        icons: [
          { icon: '💬', title: 'Tin nhắn' },
          { icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined },
        ],
        userName: buyer.company_name,
        userRole: 'Buyer',
      }}
      navGroups={[
        { items: [{ icon: '🏠', label: 'Dashboard', href: '/dashboard' }] },
        {
          label: 'Mua hàng',
          items: [
            { icon: '📝', label: 'Gửi RFQ mới', href: '/rfq/new' },
            { icon: '📋', label: 'RFQ của tôi', href: '/rfq', count: activeRfqCount || undefined },
            { icon: '📦', label: 'Đơn hàng', href: '/orders' },
          ],
        },
        {
          label: 'Kết nối',
          items: [
            { icon: '💬', label: 'Nhắn tin', href: '/messages' },
            {
              icon: '🔔',
              label: 'Thông báo',
              href: '/notifications',
              count: unreadCount || undefined,
            },
          ],
        },
        {
          label: 'Tài khoản',
          items: [
            { icon: '🏢', label: 'Hồ sơ & xác minh', href: '/settings/profile' },
            { icon: '💳', label: 'Membership & credit', href: '/settings/membership' },
            { icon: '⚙️', label: 'Cài đặt thông báo', href: '/settings/notifications' },
          ],
        },
      ]}
    >
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>RFQ của tôi</span>
      </div>

      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-bold">RFQ của tôi</div>
          <div className="text-brand-sub mt-1 text-[12.5px]">
            Quản lý toàn bộ yêu cầu báo giá đã gửi — {tabCounts[0]?.count ?? 0} yêu cầu,{' '}
            {activeRfqCount} đang hoạt động.
          </div>
        </div>
        <Link
          href="/rfq/new"
          className="bg-brand-red hover:bg-brand-red-dark rounded-md px-[18px] py-2.5 text-sm font-semibold whitespace-nowrap text-white"
        >
          + Gửi RFQ mới
        </Link>
      </div>

      <div className="border-brand-border mb-4 flex gap-1 overflow-x-auto border-b">
        {STATUS_TABS.map((tab, i) => {
          const isActive = tab.key === status;
          return (
            <Link
              key={tab.key}
              href={buildRfqUrl({ status: tab.key, q, category, sort })}
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
        <RfqFilterBar
          categories={categories ?? []}
          status={status}
          q={q}
          category={category}
          sort={sort}
        />
        <span className="text-brand-sub mb-3.5 shrink-0 text-xs">{totalCount} kết quả</span>
      </div>

      {rfqs.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-[50px] text-center">
          <div className="mb-2.5 text-[32px]">📭</div>
          <div className="mb-1.5 text-sm font-bold">Không có RFQ nào ở mục này</div>
          <div className="text-brand-sub mb-[18px] text-xs">
            Thử chọn bộ lọc khác hoặc gửi một yêu cầu báo giá mới.
          </div>
          <Link
            href="/rfq/new"
            className="bg-brand-red hover:bg-brand-red-dark inline-block rounded-md px-[18px] py-2.5 text-sm font-semibold text-white"
          >
            + Gửi RFQ mới
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rfqs.map((rfq) => {
            const quoteCount = rfq.rfq_quotes?.[0]?.count ?? 0;
            const targetCount = rfq.rfq_targets?.[0]?.count ?? 0;
            const settledLabel = SETTLED_DEADLINE_LABEL[rfq.status];
            const deadline = effectiveDeadline(rfq);
            const remaining = deadline ? daysUntil(deadline) : null;

            return (
              <Link
                key={rfq.id}
                href={`/rfq/${rfq.id}`}
                className="border-brand-border hover:border-brand-clay flex items-center gap-3.5 rounded-[10px] border bg-white p-3.5 px-4 transition-shadow hover:shadow-[0_4px_14px_rgba(0,0,0,.06)]"
              >
                <div className="bg-brand-bg flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[9px] text-xl">
                  📋
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-brand-ink truncate text-[13.5px] font-bold">
                      {rfq.title}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        rfq.rfq_type === 'multi'
                          ? 'bg-[#F1EEFF] text-[#5B4CDB]'
                          : 'bg-brand-bg text-brand-sub'
                      }`}
                    >
                      {RFQ_TYPE_LABEL[rfq.rfq_type] ?? rfq.rfq_type}
                    </span>
                  </div>
                  <div className="text-brand-light flex flex-wrap gap-3 text-[11.5px]">
                    <span>
                      <b className="text-brand-sub font-semibold">
                        {rfq.quantity.toLocaleString('vi-VN')}
                      </b>{' '}
                      {rfq.unit ?? ''}
                    </span>
                    <span>{rfq.categories?.name ?? 'Chưa phân loại'}</span>
                    <span>Gửi {formatVnDate(rfq.created_at)}</span>
                    <span>{targetCount || 1} xưởng</span>
                  </div>
                </div>

                <div className="border-brand-border/60 min-w-[74px] shrink-0 border-r border-l px-3.5 text-center">
                  <div
                    className={`font-tight text-[17px] font-bold ${quoteCount === 0 ? 'text-brand-light' : 'text-brand-ink'}`}
                  >
                    {quoteCount}
                  </div>
                  <div className="text-brand-light mt-px text-[10px]">báo giá</div>
                </div>

                <div className="min-w-[88px] shrink-0 text-center">
                  {settledLabel ? (
                    <div className="text-brand-light text-xs font-semibold">{settledLabel}</div>
                  ) : (
                    <div
                      className={`text-xs font-semibold ${
                        remaining !== null && remaining <= 2 ? 'text-brand-red' : 'text-brand-sub'
                      }`}
                    >
                      {remaining === null
                        ? '—'
                        : remaining <= 0
                          ? 'Hết hạn'
                          : `Còn ${remaining} ngày`}
                    </div>
                  )}
                  <div className="text-brand-light mt-px text-[10px]">
                    {deadline ? `hạn ${formatVnDate(deadline)}` : ''}
                  </div>
                </div>

                <div className="min-w-[110px] shrink-0 text-right">
                  <StatusPill domain="rfq" status={rfq.status} />
                </div>

                <div className="text-brand-light shrink-0 text-sm">›</div>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-[22px] flex items-center justify-center gap-1.5">
          <Link
            href={buildRfqUrl({ status, q, category, sort, page: page - 1 })}
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
            href={buildRfqUrl({ status, q, category, sort, page: page + 1 })}
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
