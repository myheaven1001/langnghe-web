import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, ButtonLink, Card, CardBody, CardHeader, StatusPill } from '@/components/ui';
import { daysUntil, formatVnDate, formatVnd, hoursUntil } from '@/lib/format';
import { effectiveDeadline } from '@/lib/rfq';
import { PLAN_LABEL } from '@/lib/constants';
import { orderCode } from '@/lib/orders';
import { buildSupplierNavGroups } from '../_lib/nav';
import { getQuotedRfqIds, getUnreadNotificationCount } from '../_lib/counts';

export const metadata: Metadata = {
  title: 'Dashboard — LàngNghề.vn',
};

// Kết quả của RPC supplier_dashboard_stats() (20261005092300).
interface DashboardStats {
  new_rfq_count: number;
  urgent_rfq_count: number;
  orders: Record<
    | 'pending_payment'
    | 'confirmed'
    | 'producing'
    | 'shipped'
    | 'delivered'
    | 'completed'
    | 'cancelled',
    number
  >;
  revenue_month: number;
  targeted_count: number;
  quotes_count: number;
  accepted_count: number;
}

const EMPTY_STATS: DashboardStats = {
  new_rfq_count: 0,
  urgent_rfq_count: 0,
  orders: {
    pending_payment: 0,
    confirmed: 0,
    producing: 0,
    shipped: 0,
    delivered: 0,
    completed: 0,
    cancelled: 0,
  },
  revenue_month: 0,
  targeted_count: 0,
  quotes_count: 0,
  accepted_count: 0,
};

interface NewRfqRow {
  id: string;
  title: string;
  quantity: number;
  unit: string | null;
  created_at: string;
  expires_at: string | null;
  deadline_days: number | null;
  buyer_profiles: { company_name: string } | null;
}

interface SupplierOrderRow {
  id: string;
  total_amount: number;
  status: string;
  tracking_number: string | null;
  created_at: string;
  buyer_profiles: { company_name: string } | null;
  rfq_quotes: { rfq_requests: { title: string; quantity: number } | null } | null;
}

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

function formatRelativeTime(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hôm qua';
  return formatVnDate(iso);
}

function formatCompactVnd(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace('.0', '')} tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')} tr`;
  return formatVnd(n);
}

// Một ô "việc cần làm": số lớn + việc + nơi bấm. Có việc thì nổi màu đỏ.
function TodoTile({
  href,
  icon,
  count,
  label,
  hint,
}: {
  href: string;
  icon: string;
  count: number;
  label: string;
  hint?: string;
}) {
  const active = count > 0;
  return (
    <Link
      href={href}
      className={`flex min-h-[72px] items-center gap-3 rounded-[10px] border bg-white px-4 py-3 ${
        active ? 'border-brand-red' : 'border-brand-border'
      }`}
    >
      <span className="text-2xl">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="text-brand-ink block text-sm font-semibold">{label}</span>
        {hint && <span className="text-brand-red block text-xs font-semibold">{hint}</span>}
      </span>
      <span
        className={`font-tight text-2xl font-bold ${active ? 'text-brand-red' : 'text-brand-light'}`}
      >
        {count}
      </span>
      <span className="text-brand-light text-sm">›</span>
    </Link>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-brand-border rounded-[10px] border bg-white px-4 py-3">
      <div className="font-tight text-xl font-bold">{value}</div>
      <div className="text-brand-sub mt-0.5 text-xs">{label}</div>
    </div>
  );
}

// Dashboard nhà bán (kế hoạch 4.4). Mobile trước: đầu trang là "việc cần làm
// hôm nay" (báo giá, bắt đầu sản xuất, giao hàng) — đúng thứ xưởng mở điện
// thoại ra để xem — rồi mới tới số liệu và danh sách. Số liệu lấy bằng 1 RPC
// supplier_dashboard_stats() thay cho ~12 câu đếm riêng lẻ trước đây.
export default async function SupplierDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: supplier } = await supabase
    .from('supplier_profiles')
    .select('id, shop_name, village_origin, trust_score')
    .eq('user_id', user.id)
    .single();

  if (!supplier) redirect('/');

  const [
    { data: statsData },
    quotedRfqIds,
    unreadCount,
    { data: membership },
    { data: verifiedRow },
    { data: recentOrdersData },
    { data: recentNotificationsData },
  ] = await Promise.all([
    supabase.rpc('supplier_dashboard_stats'),
    getQuotedRfqIds(supabase, supplier.id),
    getUnreadNotificationCount(supabase, user.id),
    supabase
      .from('user_memberships')
      .select('membership_plans(name)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('verifications')
      .select('id')
      .eq('entity_type', 'supplier')
      .eq('entity_id', supplier.id)
      .eq('status', 'approved')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('orders')
      .select(
        'id, total_amount, status, tracking_number, created_at, buyer_profiles(company_name), rfq_quotes(rfq_requests(title, quantity))',
      )
      .eq('supplier_id', supplier.id)
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('notifications')
      .select('id, title, body, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(4),
  ]);

  // RLS (rfq_requests_supplier_view) đã tự lọc chỉ những RFQ xưởng này được
  // thấy — chỉ cần loại những RFQ đã báo giá rồi.
  let newRfqQuery = supabase
    .from('rfq_requests')
    .select(
      'id, title, quantity, unit, created_at, expires_at, deadline_days, buyer_profiles(company_name)',
    )
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(5);
  if (quotedRfqIds.length > 0) {
    newRfqQuery = newRfqQuery.not('id', 'in', `(${quotedRfqIds.join(',')})`);
  }
  const { data: newRfqsData } = await newRfqQuery;

  const stats = { ...EMPTY_STATS, ...((statsData ?? {}) as Partial<DashboardStats>) };
  const newRfqs = (newRfqsData ?? []) as unknown as NewRfqRow[];
  const recentOrders = (recentOrdersData ?? []) as unknown as SupplierOrderRow[];
  const recentNotifications = (recentNotificationsData ?? []) as NotificationRow[];

  const responseRate = stats.targeted_count
    ? Math.min(100, Math.round((stats.quotes_count / stats.targeted_count) * 100))
    : null;
  const winRate = stats.quotes_count
    ? Math.round((stats.accepted_count / stats.quotes_count) * 100)
    : null;
  const isVerified = !!verifiedRow;
  const planName =
    (membership?.membership_plans as unknown as { name: string } | null)?.name ?? 'free';

  const ringCircumference = 2 * Math.PI * 23;
  const ringOffset = ringCircumference * (1 - supplier.trust_score / 100);

  return (
    <AppShell
      header={{
        icons: [
          { icon: '💬', title: 'Tin nhắn' },
          { icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined },
        ],
        userName: supplier.shop_name,
        userRole: `Supplier${supplier.village_origin ? ` · ${supplier.village_origin}` : ''}`,
      }}
      navGroups={buildSupplierNavGroups({ newRfqCount: stats.new_rfq_count, unreadCount })}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold">
            <span className="break-words">Chào {supplier.shop_name} 👋</span>
            {isVerified && (
              <span className="bg-status-green-soft text-status-green inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                ✓ Đã xác minh
              </span>
            )}
          </h1>
          <div className="text-brand-sub mt-1 text-[13px]">
            Việc cần làm và tình hình gian hàng.
          </div>
        </div>
        <ButtonLink href="/supplier/products/new">+ Thêm sản phẩm</ButtonLink>
      </div>

      {/* VIỆC CẦN LÀM */}
      <div className="mb-4 grid grid-cols-1 gap-2.5 md:grid-cols-3">
        <TodoTile
          href="/supplier/rfq"
          icon="📥"
          count={stats.new_rfq_count}
          label="RFQ cần báo giá"
          hint={stats.urgent_rfq_count > 0 ? `${stats.urgent_rfq_count} sắp hết hạn` : undefined}
        />
        <TodoTile
          href="/supplier/orders?status=confirmed&range=all"
          icon="🧵"
          count={stats.orders.confirmed}
          label="Đơn chờ bắt đầu sản xuất"
        />
        <TodoTile
          href="/supplier/orders?status=producing&range=all"
          icon="🚚"
          count={stats.orders.producing}
          label="Đơn đang làm, chờ giao"
        />
      </div>

      {/* SỐ LIỆU */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile value={formatCompactVnd(stats.revenue_month)} label="Đã thanh toán tháng này" />
        <StatTile
          value={String(stats.orders.shipped + stats.orders.delivered)}
          label="Đơn đang giao / chờ hoàn tất"
        />
        <StatTile
          value={responseRate === null ? '—' : `${responseRate}%`}
          label="Tỷ lệ phản hồi RFQ"
        />
        <StatTile value={winRate === null ? '—' : `${winRate}%`} label="Tỷ lệ chốt báo giá" />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* LEFT */}
        <div className="min-w-0">
          <Card>
            <CardHeader
              title={<>📥 RFQ mới cần báo giá</>}
              action={
                <Link
                  href="/supplier/rfq"
                  className="text-brand-red text-xs font-semibold hover:underline"
                >
                  Xem tất cả →
                </Link>
              }
            />
            <CardBody>
              {newRfqs.length === 0 ? (
                <div className="text-brand-light px-[18px] py-8 text-center text-[13px]">
                  Chưa có RFQ nào cần báo giá.
                </div>
              ) : (
                newRfqs.map((rfq) => {
                  const deadline = effectiveDeadline(rfq);
                  const hrs = deadline ? hoursUntil(deadline) : null;
                  const urgent = hrs !== null && hrs > 0 && hrs <= 24;
                  return (
                    <Link
                      key={rfq.id}
                      href={`/supplier/rfq?rfq=${rfq.id}`}
                      className="flex min-h-[60px] items-center gap-3 border-b border-[#F2F0EC] px-4 py-3 last:border-b-0 hover:bg-[#FAFAF8]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-brand-ink line-clamp-2 text-[13px] font-semibold">
                          {rfq.title} — {rfq.quantity.toLocaleString('vi-VN')} {rfq.unit ?? ''}
                        </div>
                        <div className="text-brand-sub mt-0.5 text-xs">
                          {rfq.buyer_profiles?.company_name ?? 'Buyer'} ·{' '}
                          {hrs === null ? (
                            'chưa rõ hạn'
                          ) : hrs <= 0 ? (
                            'đã hết hạn báo giá'
                          ) : (
                            <>
                              còn{' '}
                              <b className={urgent ? 'text-brand-red' : undefined}>
                                {hrs <= 24 ? `${hrs} giờ` : `${daysUntil(deadline!)} ngày`}
                              </b>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="bg-brand-red shrink-0 rounded-md px-3 py-2 text-xs font-semibold whitespace-nowrap text-white">
                        Báo giá
                      </span>
                    </Link>
                  );
                })
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={<>📦 Đơn hàng gần đây</>}
              action={
                <Link
                  href="/supplier/orders"
                  className="text-brand-red text-xs font-semibold hover:underline"
                >
                  Xem tất cả →
                </Link>
              }
            />
            <CardBody>
              {recentOrders.length === 0 ? (
                <div className="text-brand-light px-[18px] py-8 text-center text-[13px]">
                  Chưa có đơn hàng nào.
                </div>
              ) : (
                recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/supplier/orders/${order.id}`}
                    className="flex min-h-[60px] items-center gap-3 border-b border-[#F2F0EC] px-4 py-3 last:border-b-0 hover:bg-[#FAFAF8]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-brand-ink line-clamp-2 text-[13px] font-semibold">
                        {order.rfq_quotes?.rfq_requests?.title ?? 'Đơn hàng'}
                      </div>
                      <div className="text-brand-sub mt-0.5 truncate text-xs">
                        {orderCode(order.id)} · {order.buyer_profiles?.company_name ?? 'Buyer'} ·{' '}
                        {formatVnDate(order.created_at)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-brand-ink mb-1 text-[13px] font-bold">
                        {formatVnd(order.total_amount)}
                      </div>
                      <StatusPill domain="order" status={order.status} />
                    </div>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        {/* RIGHT RAIL (xuống dưới trên điện thoại) */}
        <div className="min-w-0">
          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Gian hàng của bạn
            </div>
            <div className="mb-3 flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0">
                <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
                  <circle cx="28" cy="28" r="23" fill="none" stroke="#F0EFEC" strokeWidth="6" />
                  <circle
                    cx="28"
                    cy="28"
                    r="23"
                    fill="none"
                    stroke="#00A650"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringOffset}
                  />
                </svg>
                <div className="font-tight absolute inset-0 flex items-center justify-center text-sm font-bold">
                  {supplier.trust_score}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold break-words">{supplier.shop_name}</div>
                <div className="text-brand-sub mt-0.5 text-xs">
                  Điểm uy tín:{' '}
                  <strong className="text-brand-ink">
                    {supplier.trust_score >= 80
                      ? 'Rất tốt'
                      : supplier.trust_score >= 50
                        ? 'Tốt'
                        : 'Cần cải thiện'}
                  </strong>
                </div>
              </div>
            </div>
            <div className="text-brand-sub mb-3 text-xs leading-relaxed">
              Phản hồi nhanh và giao đúng hạn giúp gian hàng được ưu tiên hiển thị.
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="bg-brand-bg rounded-md px-2.5 py-1 font-bold">
                Gói {PLAN_LABEL[planName] ?? planName}
              </span>
              <span className="text-brand-sub">{stats.orders.completed} đơn đã hoàn tất</span>
            </div>
            <div className="mt-3 flex gap-2">
              <ButtonLink href="/supplier/shop" variant="secondary" className="flex-1">
                Xem gian hàng
              </ButtonLink>
              <ButtonLink href="/supplier/analytics" variant="secondary" className="flex-1">
                Phân tích
              </ButtonLink>
            </div>
          </div>

          <div className="border-brand-border rounded-[10px] border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-brand-sub text-xs font-bold tracking-[.04em] uppercase">
                Thông báo gần đây
              </span>
              <Link href="/notifications" className="text-brand-red text-xs font-semibold">
                Tất cả →
              </Link>
            </div>
            {recentNotifications.length === 0 ? (
              <div className="text-brand-light text-[13px]">Chưa có thông báo nào.</div>
            ) : (
              recentNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className="flex gap-2.5 border-b border-[#F2F0EC] py-2.5 last:border-b-0 last:pb-0"
                >
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      notif.is_read ? 'bg-transparent' : 'bg-brand-red'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-brand-ink text-[13px] leading-relaxed break-words">
                      <strong className="font-semibold">{notif.title}</strong>
                      {notif.body ? ` — ${notif.body}` : ''}
                    </div>
                    <div className="text-brand-light mt-0.5 text-xs">
                      {formatRelativeTime(notif.created_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
