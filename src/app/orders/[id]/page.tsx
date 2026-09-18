import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, Card, CardBody, CardHeader, StatusPill } from '@/components/ui';
import { formatVnDate, formatVnd } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Chi tiết đơn hàng — LàngNghề.vn',
};

// Cùng danh sách event_type với CHECK constraint của order_events (xem
// supabase/migrations/20260920090000_order_events.sql) — cũng là thứ tự
// vòng đời dùng để vẽ các bước "chưa diễn ra" (ghost) sau sự kiện thật cuối
// cùng, tới trước khi bị cắt bởi 'cancelled'.
const FORWARD_CHAIN = [
  'order_created',
  'payment_confirmed',
  'producing_started',
  'shipped',
  'delivered',
  'completed',
] as const;

const EVENT_LABEL: Record<string, { icon: string; label: string }> = {
  order_created: { icon: '🎉', label: 'Đơn hàng được tạo' },
  payment_confirmed: { icon: '💳', label: 'Đã xác nhận thanh toán' },
  producing_started: { icon: '🧵', label: 'Xưởng bắt đầu sản xuất' },
  shipped: { icon: '🚚', label: 'Đã bàn giao vận chuyển' },
  delivered: { icon: '📬', label: 'Đã giao hàng' },
  dispute_opened: { icon: '⚠️', label: 'Mở tranh chấp' },
  dispute_resolved: { icon: '✅', label: 'Đã giải quyết tranh chấp' },
  completed: { icon: '🏁', label: 'Hoàn tất đơn hàng' },
  cancelled: { icon: '✕', label: 'Đơn hàng bị hủy' },
};

const PAYMENT_STATUS: Record<string, { icon: string; text: string; tone: 'pending' | 'paid' }> = {
  pending_payment: { icon: '⏳', text: 'Chờ thanh toán', tone: 'pending' },
  confirmed: { icon: '✓', text: 'Đã thanh toán đủ', tone: 'paid' },
  producing: { icon: '✓', text: 'Đã thanh toán đủ', tone: 'paid' },
  shipped: { icon: '✓', text: 'Đã thanh toán đủ', tone: 'paid' },
  delivered: { icon: '✓', text: 'Đã thanh toán đủ', tone: 'paid' },
  completed: { icon: '✓', text: 'Đã thanh toán đủ', tone: 'paid' },
  cancelled: { icon: '✕', text: 'Đơn hàng đã hủy', tone: 'pending' },
};

interface OrderDetail {
  id: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  currency: string;
  status: string;
  payment_note: string | null;
  shipping_address: string | null;
  logistics_provider: string | null;
  tracking_number: string | null;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  created_at: string;
  supplier_profiles: {
    id: string;
    user_id: string;
    shop_name: string;
    village_origin: string | null;
    rating_avg: number | null;
    total_orders: number;
  } | null;
  rfq_quotes: {
    rfq_requests: { id: string; title: string; unit: string | null } | null;
  } | null;
}

interface OrderEventRow {
  id: string;
  actor_id: string | null;
  event_type: string;
  note: string | null;
  created_at: string;
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: buyer } = await supabase
    .from('buyer_profiles')
    .select('id, company_name, address, city')
    .eq('user_id', user.id)
    .single();

  if (!buyer) redirect('/');

  const { data: orderData } = await supabase
    .from('orders')
    .select(
      'id, quantity, unit_price, total_amount, currency, status, payment_note, shipping_address, logistics_provider, tracking_number, confirmed_at, shipped_at, delivered_at, completed_at, created_at, supplier_profiles(id, user_id, shop_name, village_origin, rating_avg, total_orders), rfq_quotes(rfq_requests(id, title, unit))',
    )
    .eq('id', id)
    .eq('buyer_id', buyer.id)
    .maybeSingle();

  // Không tồn tại HOẶC không phải đơn của buyer này (RLS đã chặn từ tầng
  // DB) — cả 2 trường hợp trả về 404 như nhau.
  if (!orderData) notFound();
  const order = orderData as unknown as OrderDetail;

  const [{ data: eventsData }, { data: unreadCount }, { count: activeRfqCount }, { data: verifiedRow }] =
    await Promise.all([
      supabase
        .from('order_events')
        .select('id, actor_id, event_type, note, created_at')
        .eq('order_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .then((r) => ({ data: r.count ?? 0 })),
      supabase
        .from('rfq_requests')
        .select('id', { count: 'exact', head: true })
        .eq('buyer_id', buyer.id)
        .in('status', ['published', 'quoted', 'negotiating']),
      order.supplier_profiles
        ? supabase
            .from('verifications')
            .select('entity_id')
            .eq('entity_type', 'supplier')
            .eq('status', 'approved')
            .eq('entity_id', order.supplier_profiles.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const events = (eventsData ?? []) as OrderEventRow[];
  const isVerifiedSupplier = !!verifiedRow;

  const doneTypes = new Set(events.map((e) => e.event_type));
  const nextIndex =
    order.status === 'cancelled'
      ? -1
      : FORWARD_CHAIN.findIndex((t) => !doneTypes.has(t));
  const ghostSteps = nextIndex === -1 ? [] : FORWARD_CHAIN.slice(nextIndex);

  function actorLabel(actorId: string | null) {
    if (actorId === user!.id) return 'Bạn';
    if (actorId && order.supplier_profiles && actorId === order.supplier_profiles.user_id) {
      return order.supplier_profiles.shop_name;
    }
    if (actorId) return 'Đội ngũ LàngNghề.vn';
    return 'Hệ thống';
  }

  const rfq = order.rfq_quotes?.rfq_requests ?? null;
  const paymentStatus = PAYMENT_STATUS[order.status] ?? PAYMENT_STATUS.pending_payment;

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
      <div className="text-brand-light mb-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
        <Link href="/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/orders" className="text-brand-sub hover:text-brand-red">
          Đơn hàng
        </Link>
        <span>/</span>
        <span>#{order.id.slice(0, 8).toUpperCase()}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-[19px] font-bold">
              Đơn hàng #{order.id.slice(0, 8).toUpperCase()}
            </div>
            <StatusPill domain="order" status={order.status} />
          </div>
          <div className="text-brand-sub mt-1 text-xs">
            Đặt ngày {formatVnDate(order.created_at)} · {order.supplier_profiles?.shop_name ?? 'Xưởng'}
            {rfq && (
              <>
                {' '}
                · từ RFQ{' '}
                <Link href={`/rfq/${rfq.id}`} className="text-brand-blue">
                  #{rfq.id.slice(0, 8).toUpperCase()}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]">
        {/* LEFT */}
        <div>
          <Card>
            <CardHeader title={<>🕒 Lịch sử đơn hàng</>} />
            <CardBody padded>
              <div className="flex flex-col">
                {events.map((event, i) => {
                  const meta = EVENT_LABEL[event.event_type] ?? { icon: '•', label: event.event_type };
                  const isLast = i === events.length - 1 && ghostSteps.length === 0;
                  return (
                    <div key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                      {!isLast && (
                        <div className="bg-brand-border absolute top-6 left-[11px] bottom-0 w-[1.5px]" />
                      )}
                      <div className="bg-brand-green z-10 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full text-[11px] text-white">
                        {meta.icon}
                      </div>
                      <div className="flex-1 pb-0.5">
                        <div className="text-brand-ink text-[12.5px] font-bold">{meta.label}</div>
                        {event.note && (
                          <div className="text-brand-sub mt-0.5 text-[11.5px] leading-relaxed">
                            {event.note}
                          </div>
                        )}
                        <div className="text-brand-light mt-0.5 text-[10.5px]">
                          {formatVnDate(event.created_at)} —{' '}
                          {new Date(event.created_at).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          · {actorLabel(event.actor_id)}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {ghostSteps.map((type, i) => {
                  const meta = EVENT_LABEL[type] ?? { icon: '•', label: type };
                  const isLast = i === ghostSteps.length - 1;
                  return (
                    <div key={type} className="relative flex gap-3 pb-5 last:pb-0">
                      {!isLast && (
                        <div className="bg-brand-border absolute top-6 left-[11px] bottom-0 w-[1.5px]" />
                      )}
                      <div className="border-brand-border text-brand-light z-10 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border-2 bg-white text-[10px]">
                        {i + 1}
                      </div>
                      <div className="flex-1 pb-0.5">
                        <div className="text-brand-light text-[12.5px] font-bold">{meta.label}</div>
                        <div className="text-brand-light mt-0.5 text-[11.5px]">Chưa diễn ra</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<>📦 Sản phẩm đặt hàng</>} />
            <CardBody padded>
              <div className="mb-3.5 flex items-center gap-3 border-b border-[#F2F0EC] pb-3.5">
                <div className="bg-brand-bg flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[9px] text-[22px]">
                  📦
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold">{rfq?.title ?? 'Đơn hàng'}</div>
                  <div className="text-brand-light mt-0.5 text-[11.5px]">
                    {order.quantity.toLocaleString('vi-VN')} {rfq?.unit ?? ''}
                  </div>
                  {rfq && (
                    <Link href={`/rfq/${rfq.id}`} className="text-brand-blue mt-0.5 block text-[11px]">
                      Xem lại RFQ gốc →
                    </Link>
                  )}
                </div>
              </div>
              <div className="text-brand-sub flex justify-between py-1.5 text-[12.5px]">
                <span>Đơn giá</span>
                <span>
                  {formatVnd(order.unit_price)} / {rfq?.unit ?? 'đơn vị'}
                </span>
              </div>
              <div className="text-brand-sub flex justify-between py-1.5 text-[12.5px]">
                <span>Số lượng</span>
                <span>
                  {order.quantity.toLocaleString('vi-VN')} {rfq?.unit ?? ''}
                </span>
              </div>
              <div className="text-brand-ink border-brand-border mt-1.5 flex justify-between border-t-[1.5px] pt-3 text-sm font-bold">
                <span>Tổng cộng</span>
                <span>{formatVnd(order.total_amount)}</span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<>📍 Địa chỉ giao hàng</>} />
            <CardBody padded>
              <div className="text-brand-sub text-[12.5px] leading-relaxed">
                <strong className="text-brand-ink mb-0.5 block">{buyer.company_name}</strong>
                {order.shipping_address ||
                  [buyer.address, buyer.city].filter(Boolean).join(', ') ||
                  'Chưa cập nhật địa chỉ giao hàng.'}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* RIGHT RAIL */}
        <div>
          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Trạng thái thanh toán
            </div>
            <div
              className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2.5 ${
                paymentStatus.tone === 'paid' ? 'bg-status-green-soft' : 'bg-status-amber-soft'
              }`}
            >
              <span className="text-base">{paymentStatus.icon}</span>
              <span
                className={`text-xs font-semibold ${
                  paymentStatus.tone === 'paid' ? 'text-status-green' : 'text-status-amber'
                }`}
              >
                {paymentStatus.text}
              </span>
            </div>
            {order.payment_note && (
              <div className="flex justify-between border-b border-[#F2F0EC] py-[7px] text-xs last:border-b-0">
                <span className="text-brand-sub">Ghi chú</span>
                <span className="text-brand-ink text-right font-semibold">{order.payment_note}</span>
              </div>
            )}
            {order.confirmed_at && (
              <div className="flex justify-between border-b border-[#F2F0EC] py-[7px] text-xs last:border-b-0">
                <span className="text-brand-sub">Ngày thanh toán</span>
                <span className="text-brand-ink text-right font-semibold">
                  {formatVnDate(order.confirmed_at)}
                </span>
              </div>
            )}
          </div>

          {order.supplier_profiles && (
            <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
              <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
                Nhà cung cấp
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-brand-bg flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px] text-xl">
                  🏭
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-bold">
                    {order.supplier_profiles.shop_name}
                    {isVerifiedSupplier && (
                      <span className="bg-status-green-soft text-status-green rounded-full px-1.5 py-px text-[9px] font-bold">
                        ✓ Đã xác minh
                      </span>
                    )}
                  </div>
                  <div className="text-brand-light mt-0.5 text-[11.5px]">
                    {order.supplier_profiles.village_origin ?? 'Chưa rõ làng nghề'}
                    {order.supplier_profiles.rating_avg
                      ? ` · ${order.supplier_profiles.rating_avg.toFixed(1)}★`
                      : ''}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/shops/${order.supplier_profiles.id}`}
                  className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink flex-1 rounded-md border-[1.5px] py-2 text-center text-[11.5px] font-semibold"
                >
                  🏪 Xem gian hàng
                </Link>
                <Link
                  href="/messages"
                  className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink flex-1 rounded-md border-[1.5px] py-2 text-center text-[11.5px] font-semibold"
                >
                  💬 Nhắn tin
                </Link>
              </div>
            </div>
          )}

          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Thông tin đơn hàng
            </div>
            {[
              ['Mã đơn hàng', `#${order.id.slice(0, 8).toUpperCase()}`],
              ['Ngày đặt', formatVnDate(order.created_at)],
              rfq ? ['Nguồn', `#${rfq.id.slice(0, 8).toUpperCase()}`] : null,
              order.logistics_provider ? ['Đơn vị vận chuyển', order.logistics_provider] : null,
              order.tracking_number ? ['Mã vận đơn', order.tracking_number] : null,
            ]
              .filter((row): row is [string, string] => row !== null)
              .map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between border-b border-[#F2F0EC] py-[7px] text-xs last:border-b-0"
                >
                  <span className="text-brand-sub">{label}</span>
                  <span className="text-brand-ink text-right font-semibold">{value}</span>
                </div>
              ))}
          </div>

          <div className="border-brand-border rounded-[10px] border bg-white p-4 text-center">
            <div className="mb-2 text-2xl">🙋</div>
            <div className="text-brand-sub mb-2.5 text-[11.5px] leading-relaxed">
              Có vấn đề với đơn hàng này?
            </div>
            <button
              type="button"
              className="border-brand-border text-brand-sub w-full rounded-lg border-[1.5px] py-2.5 text-xs font-semibold"
            >
              💬 Liên hệ đội hỗ trợ
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
