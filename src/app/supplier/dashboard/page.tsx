import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, Card, CardBody, CardHeader, StatCard, StatusPill } from '@/components/ui';
import { daysUntil, formatVnDate, formatVnd, hoursUntil, monthStartIso } from '@/lib/format';
import { effectiveDeadline } from '@/lib/rfq';
import { PLAN_LABEL } from '@/lib/constants';
import { buildSupplierNavGroups } from '../_lib/nav';
import { getQuotedRfqIds, getUnreadNotificationCount } from '../_lib/counts';

export const metadata: Metadata = {
  title: 'Dashboard — LàngNghề.vn',
};

const PROCESSING_ORDER_STATUSES = ['confirmed', 'producing', 'shipped'];

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

export default async function SupplierDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: supplier } = await supabase
    .from('supplier_profiles')
    .select('id, shop_name, village_origin, craft_category, trust_score, created_at')
    .eq('user_id', user.id)
    .single();

  // Dashboard này chỉ dành cho supplier — tài khoản buyer thuần không có
  // gì để hiển thị ở đây (mirrors dashboard buyer's guard).
  if (!supplier) redirect('/');

  const [
    quotedRfqIds,
    unreadCount,
    { data: membership },
    { count: targetedCount },
    { count: totalQuotesCount },
    { count: acceptedQuotesCount },
    { count: totalOrdersCount },
    { data: verifiedRow },
    { data: recentNotificationsData },
  ] = await Promise.all([
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
      .from('rfq_targets')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', supplier.id),
    supabase
      .from('rfq_quotes')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', supplier.id),
    supabase
      .from('rfq_quotes')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', supplier.id)
      .eq('status', 'accepted'),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', supplier.id),
    supabase
      .from('verifications')
      .select('id')
      .eq('entity_type', 'supplier')
      .eq('entity_id', supplier.id)
      .eq('status', 'approved')
      .maybeSingle(),
    supabase
      .from('notifications')
      .select('id, title, body, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(4),
  ]);

  // RLS (rfq_requests_supplier_view) đã tự lọc chỉ những RFQ supplier này
  // được mời (rfq_targets) hoặc multi-RFQ đúng ngành hàng — chỉ cần loại
  // những RFQ đã báo giá rồi ra khỏi "cần báo giá".
  let newRfqQuery = supabase
    .from('rfq_requests')
    .select(
      'id, title, quantity, unit, created_at, expires_at, deadline_days, buyer_profiles(company_name)',
    )
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  if (quotedRfqIds.length > 0) {
    newRfqQuery = newRfqQuery.not('id', 'in', `(${quotedRfqIds.join(',')})`);
  }
  const { data: newRfqsData } = await newRfqQuery;
  const newRfqs = (newRfqsData ?? []) as unknown as NewRfqRow[];
  const urgentCount = newRfqs.filter((r) => {
    const d = effectiveDeadline(r);
    return d && hoursUntil(d) <= 24;
  }).length;

  const [{ count: processingCount }, { count: shippedCount }, { data: monthOrdersData }, { data: recentOrdersData }] =
    await Promise.all([
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', supplier.id)
        .in('status', PROCESSING_ORDER_STATUSES),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', supplier.id)
        .eq('status', 'shipped'),
      supabase
        .from('orders')
        .select('total_amount')
        .eq('supplier_id', supplier.id)
        .neq('status', 'cancelled')
        .gte('created_at', monthStartIso()),
      supabase
        .from('orders')
        .select(
          'id, total_amount, status, tracking_number, created_at, buyer_profiles(company_name), rfq_quotes(rfq_requests(title, quantity))',
        )
        .eq('supplier_id', supplier.id)
        .order('created_at', { ascending: false })
        .limit(4),
    ]);

  const revenueThisMonth = (monthOrdersData ?? []).reduce((sum, o) => sum + (o.total_amount ?? 0), 0);
  const recentOrders = (recentOrdersData ?? []) as unknown as SupplierOrderRow[];
  const recentNotifications = (recentNotificationsData ?? []) as NotificationRow[];

  const responseRate = targetedCount ? Math.round(((totalQuotesCount ?? 0) / targetedCount) * 100) : null;
  const winRate = totalQuotesCount ? Math.round(((acceptedQuotesCount ?? 0) / totalQuotesCount) * 100) : null;
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
      navGroups={buildSupplierNavGroups({ newRfqCount: newRfqs.length, unreadCount })}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xl font-bold">
            Chào {supplier.shop_name} 👋
            {isVerified && (
              <span className="bg-status-green-soft text-status-green inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                ✓ Đã xác minh
              </span>
            )}
          </div>
          <div className="text-brand-sub mt-1 text-[12.5px]">
            Tổng quan hoạt động gian hàng của bạn.
          </div>
        </div>
        <Link
          href="/supplier/products/new"
          className="bg-brand-red hover:bg-brand-red-dark rounded-md px-[18px] py-2.5 text-sm font-semibold whitespace-nowrap text-white"
        >
          + Thêm sản phẩm
        </Link>
      </div>

      <div className="mb-[18px] grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon="📥"
          iconTone="red"
          value={newRfqs.length}
          label="RFQ mới cần báo giá"
          delta={urgentCount > 0 ? `${urgentCount} gấp` : undefined}
          deltaTone="new"
        />
        <StatCard
          icon="📦"
          iconTone="purple"
          value={processingCount ?? 0}
          label="Đơn hàng đang xử lý"
          delta={shippedCount ? `${shippedCount} sắp giao` : undefined}
        />
        <StatCard
          icon="💰"
          iconTone="green"
          value={
            revenueThisMonth >= 1_000_000
              ? `${(revenueThisMonth / 1_000_000).toFixed(0)}tr`
              : formatVnd(revenueThisMonth)
          }
          label="Doanh thu tháng này"
        />
        <StatCard
          icon="⚡"
          iconTone="amber"
          value={responseRate === null ? '—' : `${responseRate}%`}
          label="Tỷ lệ phản hồi RFQ"
          delta={responseRate !== null ? (responseRate >= 80 ? 'Tốt' : undefined) : undefined}
        />
      </div>

      <div className="grid grid-cols-[1fr_300px] items-start gap-4">
        {/* LEFT */}
        <div>
          <Card>
            <CardHeader
              title={<>📥 RFQ mới cần báo giá</>}
              action={
                <Link href="/supplier/rfq" className="text-brand-red text-xs font-semibold hover:underline">
                  Xem tất cả →
                </Link>
              }
            />
            <CardBody>
              {newRfqs.length === 0 ? (
                <div className="text-brand-light px-[18px] py-8 text-center text-xs">
                  Chưa có RFQ nào cần báo giá.
                </div>
              ) : (
                newRfqs.slice(0, 5).map((rfq) => {
                  const deadline = effectiveDeadline(rfq);
                  const hrs = deadline ? hoursUntil(deadline) : null;
                  const urgent = hrs !== null && hrs <= 24;
                  return (
                    <Link
                      key={rfq.id}
                      href={`/supplier/rfq?rfq=${rfq.id}`}
                      className="flex items-center gap-3 border-b border-[#F2F0EC] px-[18px] py-[11px] last:border-b-0 hover:bg-[#FAFAF8]"
                    >
                      <div className="bg-brand-bg flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[7px] text-base">
                        📥
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-brand-ink truncate text-[12.5px] font-semibold">
                          {rfq.buyer_profiles?.company_name ?? 'Buyer'} — {rfq.title},{' '}
                          {rfq.quantity.toLocaleString('vi-VN')} {rfq.unit ?? ''}
                        </div>
                        <div className="text-brand-light mt-0.5 text-[11px]">
                          {hrs === null ? (
                            'Chưa rõ hạn'
                          ) : hrs <= 0 ? (
                            'Đã hết hạn báo giá'
                          ) : (
                            <>
                              Còn{' '}
                              <b className={urgent ? 'text-brand-red' : undefined}>
                                {hrs <= 24 ? `${hrs} giờ` : `${daysUntil(deadline!)} ngày`}
                              </b>{' '}
                              để báo giá
                            </>
                          )}{' '}
                          · gửi {formatVnDate(rfq.created_at)}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {urgent && (
                          <span className="bg-status-red-soft text-status-red mr-2 rounded-full px-2 py-0.5 text-[10.5px] font-semibold">
                            Gấp
                          </span>
                        )}
                        <span className="bg-brand-red rounded-md px-3 py-1.5 text-[11.5px] font-semibold whitespace-nowrap text-white">
                          Báo giá ngay
                        </span>
                      </div>
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
                <div className="text-brand-light px-[18px] py-8 text-center text-xs">
                  Chưa có đơn hàng nào.
                </div>
              ) : (
                recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/supplier/orders?order=${order.id}`}
                    className="flex items-center gap-3 border-b border-[#F2F0EC] px-[18px] py-[11px] last:border-b-0 hover:bg-[#FAFAF8]"
                  >
                    <div className="bg-brand-bg flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[7px] text-base">
                      📦
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-brand-ink truncate text-[12.5px] font-semibold">
                        {order.buyer_profiles?.company_name ?? 'Buyer'} — #
                        {order.id.slice(0, 8).toUpperCase()} —{' '}
                        {order.rfq_quotes?.rfq_requests?.title ?? 'Đơn hàng'}
                      </div>
                      <div className="text-brand-light mt-0.5 text-[11px]">
                        {order.tracking_number ? `Mã vận đơn ${order.tracking_number}` : formatVnDate(order.created_at)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-brand-ink text-[12.5px] font-bold">
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

        {/* RIGHT RAIL */}
        <div>
          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Gian hàng của bạn
            </div>
            <div className="mb-3.5 flex items-center gap-3">
              <div className="bg-brand-bg flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[9px] text-xl">
                🏭
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-bold">
                  {supplier.shop_name}
                  {isVerified && (
                    <span className="bg-status-green-soft text-status-green rounded-full px-1.5 py-px text-[9px] font-bold">
                      ✓ Đã xác minh
                    </span>
                  )}
                </div>
                <div className="text-brand-light mt-0.5 text-[11.5px]">
                  {supplier.village_origin ?? 'Chưa rõ làng nghề'}
                </div>
              </div>
            </div>
            <div className="mb-3.5 grid grid-cols-2 gap-2.5">
              <div className="bg-brand-bg rounded-lg px-2.5 py-2">
                <div className="font-tight text-[15px] font-bold">
                  {responseRate === null ? '—' : `${responseRate}%`}
                </div>
                <div className="text-brand-sub mt-0.5 text-[10px]">Tỷ lệ phản hồi</div>
              </div>
              <div className="bg-brand-bg rounded-lg px-2.5 py-2">
                <div className="font-tight text-[15px] font-bold">
                  {winRate === null ? '—' : `${winRate}%`}
                </div>
                <div className="text-brand-sub mt-0.5 text-[10px]">Tỷ lệ chốt báo giá</div>
              </div>
              <div className="bg-brand-bg col-span-2 rounded-lg px-2.5 py-2">
                <div className="font-tight text-[15px] font-bold">{totalOrdersCount ?? 0}</div>
                <div className="text-brand-sub mt-0.5 text-[10px]">Tổng đơn hàng</div>
              </div>
            </div>
            <span className="bg-brand-bg inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold">
              {PLAN_LABEL[planName] ?? planName}
            </span>
          </div>

          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Điểm uy tín
            </div>
            <div className="flex items-center gap-3.5">
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
              <div className="text-brand-sub text-[11.5px] leading-relaxed">
                <strong className="text-brand-ink">
                  {supplier.trust_score >= 80 ? 'Rất tốt' : supplier.trust_score >= 50 ? 'Tốt' : 'Cần cải thiện'}
                </strong>{' '}
                — phản hồi nhanh và giao đúng hạn giúp gian hàng được ưu tiên hiển thị.
              </div>
            </div>
          </div>

          <div className="border-brand-border rounded-[10px] border bg-white p-4">
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
                    <div className="text-brand-ink text-[11.5px] leading-relaxed">
                      <strong className="font-semibold">{notif.title}</strong>
                      {notif.body ? ` — ${notif.body}` : ''}
                    </div>
                    <div className="text-brand-light mt-0.5 text-[10px]">
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
