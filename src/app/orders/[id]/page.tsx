import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, Card, CardBody, CardHeader, StatusPill } from '@/components/ui';
import { OrderDocuments } from '@/components/orders/OrderDocuments';
import { OrderNoteForm } from '@/components/orders/OrderNoteForm';
import { OrderRealtime } from '@/components/orders/OrderRealtime';
import { OrderTimeline } from '@/components/orders/OrderTimeline';
import { formatVnDate, formatVnd, formatVnDateTime } from '@/lib/format';
import {
  ORDER_ITEMS_DETAIL,
  orderCode,
  type OrderDocumentRow,
  type OrderEventRow,
  type OrderItemRow,
} from '@/lib/orders';
import { OrderItemsTable } from '@/components/orders/OrderItemsTable';
import { BuyerOrderActions } from './_components/BuyerOrderActions';

export const metadata: Metadata = {
  title: 'Chi tiết đơn hàng — LàngNghề.vn',
};

const PAYMENT_STATUS: Record<string, { icon: string; text: string; tone: 'pending' | 'paid' }> = {
  pending_payment: { icon: '⏳', text: 'Chờ thanh toán', tone: 'pending' },
  confirmed: { icon: '✓', text: 'Sàn đã xác nhận thanh toán', tone: 'paid' },
  producing: { icon: '✓', text: 'Sàn đã xác nhận thanh toán', tone: 'paid' },
  shipped: { icon: '✓', text: 'Sàn đã xác nhận thanh toán', tone: 'paid' },
  delivered: { icon: '✓', text: 'Sàn đã xác nhận thanh toán', tone: 'paid' },
  completed: { icon: '✓', text: 'Sàn đã xác nhận thanh toán', tone: 'paid' },
  cancelled: { icon: '✕', text: 'Đơn hàng đã hủy', tone: 'pending' },
};

interface OrderDetail {
  id: string;
  total_amount: number;
  order_items: OrderItemRow[] | null;
  currency: string;
  status: string;
  payment_note: string | null;
  paid_amount: number | null;
  paid_at: string | null;
  cancel_reason: string | null;
  shipping_address: string | null;
  logistics_provider: string | null;
  tracking_number: string | null;
  confirmed_at: string | null;
  created_at: string;
  supplier_profiles: {
    id: string;
    shop_name: string;
    village_origin: string | null;
    rating_avg: number | null;
  } | null;
  rfq_quotes: {
    rfq_requests: { id: string; title: string; unit: string | null } | null;
  } | null;
}

interface PaymentAccount {
  bank_name?: string;
  account_number?: string;
  account_holder?: string;
  branch?: string;
  note?: string;
}

interface SupportContact {
  phone?: string;
  zalo?: string;
  email?: string;
  hours?: string;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#F2F0EC] py-[7px] text-xs last:border-b-0">
      <span className="text-brand-sub shrink-0">{label}</span>
      <span className="text-brand-ink text-right font-semibold break-words">{value}</span>
    </div>
  );
}

// Trang đơn phía buyer (kế hoạch 3.4): thông tin chuyển khoản lấy từ
// platform_settings, tải biên lai (order_documents), "Đã nhận hàng" / "Hoàn
// tất đơn", ghi chú; tự cập nhật qua Realtime (OrderRealtime).
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  if (!buyer) redirect('/');

  const { data: orderData } = await supabase
    .from('orders')
    .select(
      `id, total_amount:total, ${ORDER_ITEMS_DETAIL}, currency, status, payment_note, paid_amount, paid_at, cancel_reason, shipping_address, logistics_provider, tracking_number, confirmed_at, created_at, supplier_profiles(id, shop_name, village_origin, rating_avg), rfq_quotes(rfq_requests(id, title, unit))`,
    )
    .eq('id', id)
    .eq('buyer_id', buyer.id)
    .maybeSingle();

  // Không tồn tại HOẶC không phải đơn của buyer này (RLS đã chặn từ tầng
  // DB) — cả 2 trường hợp trả về 404 như nhau.
  if (!orderData) notFound();
  const order = orderData as unknown as OrderDetail;

  const [
    { data: eventsData },
    { data: documentsData },
    { data: settingsData },
    { data: unreadCount },
    { count: activeRfqCount },
    { data: verifiedRow },
  ] = await Promise.all([
    supabase
      .from('order_events')
      .select('id, actor_id, event_type, note, metadata, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('order_documents')
      .select('id, uploader_role, doc_type, storage_path, file_name, note, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['payment_account', 'order_auto_complete_days', 'support_contact']),
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
          .from('public_supplier_profiles')
          .select('verified')
          .eq('id', order.supplier_profiles.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const events = (eventsData ?? []) as OrderEventRow[];
  const documents = (documentsData ?? []) as OrderDocumentRow[];
  const settings = new Map((settingsData ?? []).map((s) => [s.key as string, s.value]));
  const account = (settings.get('payment_account') ?? {}) as PaymentAccount;
  const support = (settings.get('support_contact') ?? {}) as SupportContact;
  const autoCompleteDays = Number(settings.get('order_auto_complete_days') ?? 7);
  const hasAccount = !!account.account_number;
  const hasReceipt = documents.some((d) => d.doc_type === 'payment_receipt');
  const isVerifiedSupplier = !!(verifiedRow as { verified?: boolean } | null)?.verified;

  const rfq = order.rfq_quotes?.rfq_requests ?? null;
  const paymentStatus = PAYMENT_STATUS[order.status] ?? PAYMENT_STATUS.pending_payment;
  const code = orderCode(order.id);
  const transferContent = `LN ${code.slice(1)}`;
  const supportRows = [
    support.phone && ['Điện thoại', support.phone],
    support.zalo && ['Zalo', support.zalo],
    support.email && ['Email', support.email],
    support.hours && ['Giờ hỗ trợ', support.hours],
  ].filter((row): row is [string, string] => !!row);

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
            { icon: '📍', label: 'Sổ địa chỉ', href: '/settings/addresses' },
            { icon: '💳', label: 'Membership & credit', href: '/settings/membership' },
            { icon: '⚙️', label: 'Cài đặt thông báo', href: '/settings/notifications' },
            { icon: '🔑', label: 'Tài khoản & bảo mật', href: '/settings/account' },
          ],
        },
      ]}
    >
      <OrderRealtime orderId={order.id} />

      <div className="text-brand-light mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <Link href="/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/orders" className="text-brand-sub hover:text-brand-red">
          Đơn hàng
        </Link>
        <span>/</span>
        <span>{code}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-[19px] font-bold">Đơn hàng {code}</div>
            <StatusPill domain="order" status={order.status} />
          </div>
          <div className="text-brand-sub mt-1 text-xs">
            Đặt ngày {formatVnDate(order.created_at)} ·{' '}
            {order.supplier_profiles?.shop_name ?? 'Xưởng'}
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

      {order.status === 'cancelled' && order.cancel_reason && (
        <div className="border-status-red-soft bg-status-red-soft text-status-red mb-4 rounded-[10px] border px-4 py-3 text-[13px]">
          <strong>Đơn đã bị hủy.</strong> Lý do: {order.cancel_reason}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* LEFT */}
        <div className="min-w-0">
          <Card>
            <CardHeader title={<>🕒 Lịch sử đơn hàng</>} />
            <CardBody padded>
              <OrderTimeline events={events} status={order.status} viewerId={user.id} />
              <OrderNoteForm orderId={order.id} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<>📦 Sản phẩm đặt hàng</>} />
            <CardBody padded>
              <OrderItemsTable
                items={order.order_items ?? []}
                total={order.total_amount}
                linkProducts
              />
              {rfq && (
                <Link href={`/rfq/${rfq.id}`} className="text-brand-blue mt-2 block text-xs">
                  Xem lại RFQ gốc →
                </Link>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<>📎 Chứng từ</>} />
            <CardBody padded>
              <OrderDocuments
                orderId={order.id}
                role="buyer"
                documents={documents}
                defaultDocType={order.status === 'pending_payment' ? 'payment_receipt' : 'other'}
                canUpload={order.status !== 'cancelled'}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<>📍 Địa chỉ giao hàng</>} />
            <CardBody padded>
              <div className="text-brand-sub text-[13px] leading-relaxed whitespace-pre-line">
                {order.shipping_address ||
                  'Đơn này chưa có địa chỉ giao hàng — liên hệ sàn để bổ sung.'}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* RIGHT RAIL */}
        <div className="min-w-0">
          <BuyerOrderActions
            orderId={order.id}
            status={order.status}
            autoCompleteDays={autoCompleteDays}
          />

          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Thanh toán
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

            {order.status === 'pending_payment' &&
              (hasAccount ? (
                <>
                  <div className="text-brand-sub mb-1.5 text-xs leading-relaxed">
                    Chuyển khoản đúng số tiền và nội dung dưới đây, rồi tải biên lai ở mục{' '}
                    <strong>Chứng từ</strong>. Sàn sẽ xác nhận và báo xưởng bắt đầu sản xuất.
                  </div>
                  <InfoRow label="Ngân hàng" value={account.bank_name} />
                  {account.branch && <InfoRow label="Chi nhánh" value={account.branch} />}
                  <InfoRow label="Số tài khoản" value={account.account_number} />
                  <InfoRow label="Chủ tài khoản" value={account.account_holder} />
                  <InfoRow label="Số tiền" value={formatVnd(order.total_amount)} />
                  <InfoRow label="Nội dung CK" value={transferContent} />
                  {account.note && (
                    <div className="text-brand-sub mt-2 text-xs leading-relaxed">
                      {account.note}
                    </div>
                  )}
                  <div
                    className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
                      hasReceipt
                        ? 'bg-status-green-soft text-status-green'
                        : 'bg-brand-bg text-brand-sub'
                    }`}
                  >
                    {hasReceipt
                      ? '✓ Đã tải biên lai — đang chờ sàn xác nhận.'
                      : 'Chưa có biên lai chuyển khoản.'}
                  </div>
                </>
              ) : (
                <div className="text-brand-sub text-xs leading-relaxed">
                  Sàn chưa cập nhật tài khoản nhận tiền. Vui lòng liên hệ đội hỗ trợ để được hướng
                  dẫn thanh toán.
                </div>
              ))}

            {order.paid_amount != null && (
              <InfoRow label="Đã nhận" value={formatVnd(order.paid_amount)} />
            )}
            {(order.paid_at || order.confirmed_at) && (
              <InfoRow
                label="Thời điểm"
                value={formatVnDateTime((order.paid_at ?? order.confirmed_at) as string)}
              />
            )}
            {order.payment_note && <InfoRow label="Ghi chú" value={order.payment_note} />}
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
                      <span className="bg-status-green-soft text-status-green rounded-full px-1.5 py-px text-xs font-bold">
                        ✓ Đã xác minh
                      </span>
                    )}
                  </div>
                  <div className="text-brand-light mt-0.5 text-xs">
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
                  className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink flex-1 rounded-md border-[1.5px] py-2 text-center text-xs font-semibold"
                >
                  🏪 Xem gian hàng
                </Link>
                <Link
                  href={rfq ? `/messages/${rfq.id}` : '/messages'}
                  className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink flex-1 rounded-md border-[1.5px] py-2 text-center text-xs font-semibold"
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
            <InfoRow label="Mã đơn hàng" value={code} />
            <InfoRow label="Ngày đặt" value={formatVnDate(order.created_at)} />
            {order.logistics_provider && (
              <InfoRow label="Đơn vị vận chuyển" value={order.logistics_provider} />
            )}
            {order.tracking_number && <InfoRow label="Mã vận đơn" value={order.tracking_number} />}
          </div>

          <div className="border-brand-border rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Cần hỗ trợ?
            </div>
            {supportRows.length > 0 ? (
              supportRows.map(([label, value]) => (
                <InfoRow key={label} label={label} value={value} />
              ))
            ) : (
              <div className="text-brand-sub text-xs leading-relaxed">
                Có vấn đề với đơn hàng này? Ghi chú vào lịch sử đơn hàng — đội ngũ sàn sẽ thấy và
                phản hồi.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
