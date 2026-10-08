import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  AppShell,
  ButtonLink,
  Card,
  CardHeader,
  CardBody,
  StatTile,
  StatusPill,
  TodoTile,
} from '@/components/ui';
import { formatVnd } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Dashboard — LàngNghề.vn',
};

// Kết quả của RPC buyer_dashboard_stats() (20261005092800) — mọi số liệu
// dashboard trong 1 lần gọi. Thiếu hàm (chưa chạy migration) thì hiện 0.
interface DashboardStats {
  active_rfq_count: number;
  quotes_to_review: number;
  rfq_with_quotes: number;
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
  unpaid_amount: number;
}

const EMPTY_STATS: DashboardStats = {
  active_rfq_count: 0,
  quotes_to_review: 0,
  rfq_with_quotes: 0,
  orders: {
    pending_payment: 0,
    confirmed: 0,
    producing: 0,
    shipped: 0,
    delivered: 0,
    completed: 0,
    cancelled: 0,
  },
  unpaid_amount: 0,
};

// buyer_profiles has no membership_tier column yet (only supplier_profiles
// does) — real quota limits per plan land with rfq_quota_configs in Sprint 2
// (see PROJECT_ROADMAP.md 3.2/7). Every buyer is on the free plan until then.
const FREE_TIER_MONTHLY_QUOTA = 5;

interface RfqRow {
  id: string;
  title: string;
  quantity: number;
  unit: string | null;
  status: string;
  created_at: string;
  rfq_quotes: { count: number }[] | null;
}

interface OrderRow {
  id: string;
  quantity: number;
  total_amount: number;
  status: string;
  created_at: string;
  tracking_number: string | null;
  supplier_profiles: { shop_name: string } | null;
  rfq_quotes: { rfq_requests: { title: string } | null } | null;
}

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN');
}

function formatRelativeTime(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hôm qua';
  return formatDate(iso);
}

function trustLabel(score: number) {
  if (score >= 80) return 'Tốt';
  if (score >= 50) return 'Trung bình';
  return 'Cần cải thiện';
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: buyer } = await supabase
    .from('buyer_profiles')
    .select('id, company_name, quota_used_this_month, credit_balance, trust_score, verified_at')
    .eq('user_id', user.id)
    .single();

  // Dashboard này chỉ dành cho buyer — tài khoản chưa có buyer_profiles
  // (vd. supplier thuần) không có gì để hiển thị ở đây.
  if (!buyer) redirect('/');

  const [
    { data: statsData },
    { count: unreadNotificationCount },
    { data: recentRfqsData },
    { data: recentOrdersData },
    { data: recentNotificationsData },
  ] = await Promise.all([
    supabase.rpc('buyer_dashboard_stats'),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false),
    supabase
      .from('rfq_requests')
      .select('id, title, quantity, unit, status, created_at, rfq_quotes(count)')
      .eq('buyer_id', buyer.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('orders')
      .select(
        'id, quantity, total_amount, status, created_at, tracking_number, supplier_profiles(shop_name), rfq_quotes(rfq_requests(title))',
      )
      .eq('buyer_id', buyer.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('notifications')
      .select('id, title, body, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(4),
  ]);

  const stats = { ...EMPTY_STATS, ...((statsData ?? {}) as Partial<DashboardStats>) };
  const activeRfqCount = stats.active_rfq_count;
  const recentRfqs = (recentRfqsData ?? []) as RfqRow[];
  // Without a generated Database type, postgrest-js's select-string inference
  // can't see the FK metadata that makes Supabase return these as single
  // objects at runtime (not arrays) — cast through `unknown` to bridge that.
  const recentOrders = (recentOrdersData ?? []) as unknown as OrderRow[];
  const recentNotifications = (recentNotificationsData ?? []) as NotificationRow[];

  const quotaUsed = Math.min(buyer.quota_used_this_month, FREE_TIER_MONTHLY_QUOTA);
  const quotaPct = Math.round((quotaUsed / FREE_TIER_MONTHLY_QUOTA) * 100);

  const ringCircumference = 2 * Math.PI * 27;
  const ringOffset = ringCircumference * (1 - buyer.trust_score / 100);

  return (
    <AppShell
      header={{
        icons: [
          { icon: '💬', title: 'Tin nhắn' },
          { icon: '🔔', title: 'Thông báo', badge: unreadNotificationCount || undefined },
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
            {
              icon: '📋',
              label: 'RFQ của tôi',
              href: '/rfq',
              count: activeRfqCount || undefined,
            },
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
              count: unreadNotificationCount || undefined,
            },
          ],
        },
        {
          label: 'Tài khoản',
          items: [
            { icon: '🏢', label: 'Hồ sơ & xác minh', href: '/settings/profile' },
            { icon: '📍', label: 'Sổ địa chỉ', href: '/settings/addresses' },
            { icon: '💳', label: 'Membership & credit', href: '/settings/membership' },
            { icon: '⚙️', label: 'Cài đặt thông báo', href: '/settings/notifications' },
            { icon: '🔑', label: 'Tài khoản & bảo mật', href: '/settings/account' },
          ],
        },
      ]}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xl font-bold">
            Chào {buyer.company_name} 👋
            {buyer.verified_at && (
              <span className="bg-status-green-soft text-status-green inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                ✓ Đã xác minh
              </span>
            )}
          </div>
          <div className="text-brand-sub mt-1 text-[13px]">
            Đây là tổng quan hoạt động mua sỉ của bạn.
          </div>
        </div>
        <ButtonLink href="/rfq/new">+ Gửi RFQ mới</ButtonLink>
      </div>

      {/* VIỆC CẦN LÀM (kế hoạch 4.8) */}
      <div className="mb-4 grid grid-cols-1 gap-2.5 md:grid-cols-3">
        <TodoTile
          href="/rfq?status=quoted"
          icon="💰"
          count={stats.quotes_to_review}
          label="Báo giá chờ bạn xem"
          hint={stats.rfq_with_quotes > 0 ? `trên ${stats.rfq_with_quotes} yêu cầu` : undefined}
        />
        <TodoTile
          href="/orders?status=pending_payment&range=all"
          icon="💳"
          count={stats.orders.pending_payment}
          label="Đơn chờ thanh toán"
          hint={stats.unpaid_amount > 0 ? formatVnd(stats.unpaid_amount) : undefined}
        />
        <TodoTile
          href="/orders?status=shipped&range=all"
          icon="🚚"
          count={stats.orders.shipped}
          label="Đơn đang giao — xác nhận khi nhận"
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile value={String(stats.active_rfq_count)} label="RFQ đang mở" />
        <StatTile
          value={String(stats.orders.confirmed + stats.orders.producing)}
          label="Đơn đang sản xuất"
        />
        <StatTile value={String(stats.orders.delivered)} label="Đơn đã nhận, chờ hoàn tất" />
        <StatTile value={String(stats.orders.completed)} label="Đơn đã hoàn tất" />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* LEFT: RFQ + Orders */}
        <div className="min-w-0">
          <Card>
            <CardHeader
              title={<>📋 RFQ gần đây</>}
              action={
                <Link href="/rfq" className="text-brand-red text-xs font-semibold hover:underline">
                  Xem tất cả →
                </Link>
              }
            />
            <CardBody>
              {recentRfqs.length === 0 ? (
                <div className="text-brand-light px-[18px] py-8 text-center text-xs">
                  Chưa có RFQ nào — hãy gửi yêu cầu báo giá đầu tiên.
                </div>
              ) : (
                recentRfqs.map((rfq) => {
                  const quoteCount = rfq.rfq_quotes?.[0]?.count ?? 0;
                  return (
                    <Link
                      key={rfq.id}
                      href={`/rfq/${rfq.id}`}
                      className="flex min-h-[60px] items-center gap-3 border-b border-[#F2F0EC] px-4 py-3 last:border-b-0 hover:bg-[#FAFAF8]"
                    >
                      <div className="bg-brand-bg hidden h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[7px] text-base sm:flex">
                        📋
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-brand-ink line-clamp-2 text-[13px] font-semibold">
                          {rfq.title}
                        </div>
                        <div className="text-brand-light mt-0.5 text-xs">
                          {rfq.quantity.toLocaleString('vi-VN')} {rfq.unit ?? ''} ·{' '}
                          {quoteCount > 0 ? `${quoteCount} báo giá` : 'Chưa có báo giá'} · gửi{' '}
                          {formatDate(rfq.created_at)}
                        </div>
                      </div>
                      <StatusPill domain="rfq" status={rfq.status} />
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
                  href="/orders"
                  className="text-brand-red text-xs font-semibold hover:underline"
                >
                  Xem tất cả →
                </Link>
              }
            />
            <CardBody>
              {recentOrders.length === 0 ? (
                <div className="text-brand-light px-[18px] py-8 text-center text-xs">
                  Chưa có đơn hàng nào.
                </div>
              ) : (
                recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="flex min-h-[60px] items-center gap-3 border-b border-[#F2F0EC] px-4 py-3 last:border-b-0 hover:bg-[#FAFAF8]"
                  >
                    <div className="bg-brand-bg hidden h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[7px] text-base sm:flex">
                      📦
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-brand-ink truncate text-[13px] font-semibold">
                        {order.supplier_profiles?.shop_name ?? 'Xưởng'} — #
                        {order.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div className="text-brand-light mt-0.5 text-xs">
                        {order.quantity.toLocaleString('vi-VN')} ·{' '}
                        {order.rfq_quotes?.rfq_requests?.title ?? 'Đơn hàng'}
                        {order.tracking_number ? ` · ${order.tracking_number}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-brand-ink text-[13px] font-bold">
                        {order.total_amount.toLocaleString('vi-VN')}đ
                      </div>
                      <StatusPill domain="order" status={order.status} />
                    </div>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        {/* RIGHT RAIL */}
        <div className="min-w-0">
          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Membership & Credit
            </div>
            <div className="bg-brand-bg text-brand-ink mb-2.5 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold">
              🆓 Gói Miễn phí
            </div>
            <div className="text-brand-sub mb-1.5 flex justify-between text-xs">
              <span>RFQ dùng trong tháng</span>
              <span>
                <strong className="text-brand-ink">{quotaUsed}</strong>/{FREE_TIER_MONTHLY_QUOTA}
              </span>
            </div>
            <div className="bg-brand-bg mb-3.5 h-1.5 overflow-hidden rounded">
              <div className="bg-brand-orange h-full rounded" style={{ width: `${quotaPct}%` }} />
            </div>
            <div className="bg-brand-bg mb-3 flex items-center justify-between rounded-lg px-3 py-2.5">
              <div>
                <div className="font-tight text-base font-bold">{buyer.credit_balance}</div>
                <div className="text-brand-sub text-xs">Credit RFQ còn lại</div>
              </div>
              <div className="text-xl">🎟️</div>
            </div>
            <Link
              href="/settings/membership"
              className="bg-brand-forest hover:bg-brand-forest-dark block w-full rounded-md py-2.5 text-center text-xs font-semibold text-white"
            >
              Nâng cấp gói →
            </Link>
          </div>

          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Điểm uy tín
            </div>
            <div className="flex items-center gap-3.5">
              <div className="relative h-16 w-16 shrink-0">
                <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
                  <circle cx="32" cy="32" r="27" fill="none" stroke="#F0EFEC" strokeWidth="7" />
                  <circle
                    cx="32"
                    cy="32"
                    r="27"
                    fill="none"
                    stroke="#00A650"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringOffset}
                  />
                </svg>
                <div className="font-tight absolute inset-0 flex items-center justify-center text-base font-bold">
                  {buyer.trust_score}
                </div>
              </div>
              <div className="text-brand-sub text-xs leading-relaxed">
                <strong className="text-brand-ink">{trustLabel(buyer.trust_score)}</strong> — thanh
                toán đúng hạn, phản hồi nhanh giúp bạn được xưởng ưu tiên báo giá.
              </div>
            </div>
          </div>

          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Thông báo gần đây
            </div>
            {recentNotifications.length === 0 ? (
              <div className="text-brand-light text-xs">Chưa có thông báo nào.</div>
            ) : (
              recentNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className="flex gap-2.5 border-b border-[#F2F0EC] py-2.5 last:border-b-0 last:pb-0"
                >
                  {!notif.is_read && (
                    <span className="bg-brand-red mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" />
                  )}
                  <div className={notif.is_read ? 'pl-[14px]' : ''}>
                    <div className="text-brand-ink text-xs leading-relaxed">
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
