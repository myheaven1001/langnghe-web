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
import { orderCode, type OrderDocumentRow, type OrderEventRow } from '@/lib/orders';
import { buildSupplierNavGroups } from '../../_lib/nav';
import { getNewRfqCount, getUnreadNotificationCount } from '../../_lib/counts';
import { OrderActions } from '../_components/OrderActions';

export const metadata: Metadata = {
  title: 'Chi tiết đơn hàng — LàngNghề.vn',
};

// Việc xưởng cần làm ở từng trạng thái.
const NEXT_STEP: Record<string, { title: string; body: string }> = {
  pending_payment: {
    title: '⏳ Chờ buyer thanh toán',
    body: 'Buyer chuyển khoản cho sàn; sàn xác nhận xong bạn sẽ nhận thông báo. Chưa cần sản xuất.',
  },
  confirmed: {
    title: '💳 Sàn đã xác nhận thanh toán',
    body: 'Bấm "Bắt đầu sản xuất" khi xưởng nhận làm đơn này.',
  },
  producing: {
    title: '🧵 Đang sản xuất',
    body: 'Khi giao cho đơn vị vận chuyển, nhập thông tin giao hàng và tải vận đơn ở mục Chứng từ.',
  },
  shipped: {
    title: '🚚 Đã giao cho vận chuyển',
    body: 'Chờ buyer xác nhận đã nhận hàng.',
  },
  delivered: {
    title: '📬 Buyer đã nhận hàng',
    body: 'Đơn sẽ hoàn tất khi buyer xác nhận, hoặc tự hoàn tất sau vài ngày.',
  },
  completed: { title: '🏁 Đơn đã hoàn tất', body: 'Cảm ơn xưởng đã hoàn thành đơn hàng.' },
};

interface OrderDetail {
  id: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  status: string;
  cancel_reason: string | null;
  shipping_address: string | null;
  logistics_provider: string | null;
  tracking_number: string | null;
  confirmed_at: string | null;
  shipped_at: string | null;
  created_at: string;
  buyer_profiles: { company_name: string; city: string | null } | null;
  rfq_quotes: {
    lead_time_days: number | null;
    rfq_requests: {
      id: string;
      title: string;
      unit: string | null;
      requirements: string | null;
    } | null;
  } | null;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#F2F0EC] py-[7px] text-xs last:border-b-0">
      <span className="text-brand-sub shrink-0">{label}</span>
      <span className="text-brand-ink text-right font-semibold break-words">{value}</span>
    </div>
  );
}

// Trang đơn phía xưởng (kế hoạch 3.5): dòng thời gian, chuyển trạng thái
// (bắt đầu sản xuất, giao hàng + mã vận đơn), chứng từ, ghi chú.
export default async function SupplierOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  const { data: orderData } = await supabase
    .from('orders')
    .select(
      'id, quantity, unit_price, total_amount, status, cancel_reason, shipping_address, logistics_provider, tracking_number, confirmed_at, shipped_at, created_at, buyer_profiles(company_name, city), rfq_quotes(lead_time_days, rfq_requests(id, title, unit, requirements))',
    )
    .eq('id', id)
    .eq('supplier_id', supplier.id)
    .maybeSingle();

  // Không tồn tại HOẶC không phải đơn của xưởng này → 404 như nhau.
  if (!orderData) notFound();
  const order = orderData as unknown as OrderDetail;

  const [newRfqCount, unreadCount, { data: eventsData }, { data: documentsData }] =
    await Promise.all([
      getNewRfqCount(supabase, supplier.id),
      getUnreadNotificationCount(supabase, user.id),
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
    ]);

  const events = (eventsData ?? []) as OrderEventRow[];
  const documents = (documentsData ?? []) as OrderDocumentRow[];
  const rfq = order.rfq_quotes?.rfq_requests ?? null;
  const code = orderCode(order.id);
  const nextStep = NEXT_STEP[order.status];
  const isPaid = order.status !== 'pending_payment' && order.status !== 'cancelled';

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
      <OrderRealtime orderId={order.id} />

      <div className="text-brand-light mb-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
        <Link href="/supplier/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/supplier/orders" className="text-brand-sub hover:text-brand-red">
          Quản lý đơn hàng
        </Link>
        <span>/</span>
        <span>{code}</span>
      </div>

      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="text-[19px] font-bold">Đơn hàng {code}</div>
          <StatusPill domain="order" status={order.status} />
        </div>
        <div className="text-brand-sub mt-1 text-xs">
          Đặt ngày {formatVnDate(order.created_at)} ·{' '}
          {order.buyer_profiles?.company_name ?? 'Buyer'}
        </div>
      </div>

      {order.status === 'cancelled' && (
        <div className="border-status-red-soft bg-status-red-soft text-status-red mb-4 rounded-[10px] border px-4 py-3 text-[12.5px]">
          <strong>Đơn đã bị hủy.</strong>
          {order.cancel_reason ? ` Lý do: ${order.cancel_reason}` : ''}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_320px]">
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
            <CardHeader title={<>📦 Hàng cần làm</>} />
            <CardBody padded>
              <div className="text-[13px] font-bold">{rfq?.title ?? 'Đơn hàng'}</div>
              {rfq?.requirements && (
                <div className="text-brand-sub mt-1 text-xs leading-relaxed whitespace-pre-line">
                  {rfq.requirements}
                </div>
              )}
              <div className="mt-3">
                <InfoRow
                  label="Số lượng"
                  value={`${order.quantity.toLocaleString('vi-VN')} ${rfq?.unit ?? ''}`}
                />
                <InfoRow
                  label="Đơn giá"
                  value={`${formatVnd(order.unit_price)} / ${rfq?.unit ?? 'đơn vị'}`}
                />
                {order.rfq_quotes?.lead_time_days != null && (
                  <InfoRow
                    label="Thời gian sản xuất đã báo"
                    value={`${order.rfq_quotes.lead_time_days} ngày`}
                  />
                )}
                <InfoRow label="Tổng giá trị" value={formatVnd(order.total_amount)} />
              </div>
              {rfq && (
                <Link
                  href={`/messages/${rfq.id}`}
                  className="text-brand-blue mt-2.5 block text-[11.5px]"
                >
                  💬 Nhắn tin với buyer về đơn này →
                </Link>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<>📎 Chứng từ</>} />
            <CardBody padded>
              <OrderDocuments
                orderId={order.id}
                role="supplier"
                documents={documents}
                defaultDocType="shipping_document"
                canUpload={order.status !== 'cancelled'}
              />
            </CardBody>
          </Card>
        </div>

        {/* RIGHT RAIL */}
        <div className="min-w-0">
          {nextStep && (
            <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
              <div className="text-[13px] font-bold">{nextStep.title}</div>
              <div className="text-brand-sub mt-1 mb-3 text-xs leading-relaxed">
                {nextStep.body}
              </div>
              <OrderActions orderId={order.id} status={order.status} />
            </div>
          )}

          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              📍 Giao hàng đến
            </div>
            <div className="text-brand-ink text-[12.5px] leading-relaxed whitespace-pre-line">
              {order.shipping_address ||
                'Đơn này chưa có địa chỉ giao hàng — nhắn buyer hoặc liên hệ sàn.'}
            </div>
            {(order.logistics_provider || order.tracking_number) && (
              <div className="mt-3">
                {order.logistics_provider && (
                  <InfoRow label="Đơn vị vận chuyển" value={order.logistics_provider} />
                )}
                {order.tracking_number && (
                  <InfoRow label="Mã vận đơn" value={order.tracking_number} />
                )}
                {order.shipped_at && (
                  <InfoRow label="Gửi lúc" value={formatVnDateTime(order.shipped_at)} />
                )}
              </div>
            )}
          </div>

          <div className="border-brand-border rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Thông tin đơn
            </div>
            <InfoRow label="Mã đơn hàng" value={code} />
            <InfoRow label="Buyer" value={order.buyer_profiles?.company_name ?? 'Buyer'} />
            {order.buyer_profiles?.city && (
              <InfoRow label="Khu vực" value={order.buyer_profiles.city} />
            )}
            <InfoRow label="Thanh toán" value={isPaid ? 'Sàn đã xác nhận' : 'Chưa xác nhận'} />
            {order.confirmed_at && (
              <InfoRow label="Xác nhận lúc" value={formatVnDateTime(order.confirmed_at)} />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
