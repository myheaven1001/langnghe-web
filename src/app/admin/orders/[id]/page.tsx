import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, Card, CardBody, CardHeader, StatusPill } from '@/components/ui';
import { OrderDocuments } from '@/components/orders/OrderDocuments';
import { OrderNoteForm } from '@/components/orders/OrderNoteForm';
import { OrderRealtime } from '@/components/orders/OrderRealtime';
import { OrderTimeline } from '@/components/orders/OrderTimeline';
import { formatVnd, formatVnDateTime } from '@/lib/format';
import {
  ORDER_ITEMS_DETAIL,
  orderCode,
  type OrderDocumentRow,
  type OrderEventRow,
  type OrderItemRow,
} from '@/lib/orders';
import { OrderItemsTable } from '@/components/orders/OrderItemsTable';
import { buildAdminNavGroups } from '../../_lib/nav';
import { OrderAdminActions } from '../_components/OrderAdminActions';
import { AdminConfirmPayment } from './_components/AdminConfirmPayment';

export const metadata: Metadata = {
  title: 'Chi tiết đơn hàng — LàngNghề.vn Admin',
};

const DISPUTABLE_STATUSES = ['confirmed', 'producing', 'shipped', 'delivered', 'completed'];

const AUDIT_LABEL: Record<string, string> = {
  'order.confirm_payment': 'Xác nhận thanh toán',
  'dispute.open': 'Ghi tranh chấp',
};

interface OrderDetail {
  id: string;
  total_amount: number;
  source: string;
  order_items: OrderItemRow[] | null;
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
  buyer_profiles: { id: string; company_name: string; city: string | null } | null;
  supplier_profiles: { id: string; shop_name: string; village_origin: string | null } | null;
  rfq_quotes: {
    rfq_requests: { id: string; title: string; unit: string | null } | null;
  } | null;
}

interface DisputeRow {
  id: string;
  reason: string;
  status: string;
  reporter_role: string | null;
  resolution: string | null;
  resolution_note: string | null;
  created_at: string;
}

interface AuditRow {
  id: string;
  action: string;
  created_at: string;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#F2F0EC] py-[7px] text-xs last:border-b-0">
      <span className="text-brand-sub shrink-0">{label}</span>
      <span className="text-brand-ink text-right font-semibold break-words">{value}</span>
    </div>
  );
}

// Trang đơn phía admin (kế hoạch 3.6): biên lai của buyer nằm ngay cạnh form
// xác nhận thanh toán; tranh chấp; dòng thời gian + ghi chú; nhật ký thao tác
// admin trên đơn này.
export default async function AdminOrderDetailPage({
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

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/');

  const { data: orderData } = await supabase
    .from('orders')
    .select(
      `id, total_amount:total, source, ${ORDER_ITEMS_DETAIL}, status, payment_note, paid_amount, paid_at, cancel_reason, shipping_address, logistics_provider, tracking_number, confirmed_at, created_at, buyer_profiles(id, company_name, city), supplier_profiles(id, shop_name, village_origin), rfq_quotes(rfq_requests(id, title, unit))`,
    )
    .eq('id', id)
    .maybeSingle();

  if (!orderData) notFound();
  const order = orderData as unknown as OrderDetail;

  const [
    { data: eventsData },
    { data: documentsData },
    { data: disputesData },
    { data: auditData },
    { count: unreadCount },
    { count: pendingVerificationCount },
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
      .from('disputes')
      .select('id, reason, status, reporter_role, resolution, resolution_note, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('admin_audit_log')
      .select('id, action, created_at')
      .eq('entity_type', 'order')
      .eq('entity_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false),
    supabase
      .from('verifications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  const events = (eventsData ?? []) as OrderEventRow[];
  const documents = (documentsData ?? []) as OrderDocumentRow[];
  const disputes = (disputesData ?? []) as DisputeRow[];
  const audit = (auditData ?? []) as AuditRow[];
  const receipts = documents.filter((d) => d.doc_type === 'payment_receipt');
  const otherDocuments = documents.filter((d) => d.doc_type !== 'payment_receipt');
  const activeDispute = disputes.find((d) => d.status !== 'resolved') ?? null;
  const code = orderCode(order.id);

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
      <OrderRealtime orderId={order.id} />

      <div className="text-brand-light mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <Link href="/admin" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/admin/orders" className="text-brand-sub hover:text-brand-red">
          Quản lý đơn hàng
        </Link>
        <span>/</span>
        <span>{code}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-[19px] font-bold">Đơn hàng {code}</div>
            <StatusPill domain="order" status={activeDispute ? 'disputed' : order.status} />
          </div>
          <div className="text-brand-sub mt-1 text-xs">
            Tạo lúc {formatVnDateTime(order.created_at)} ·{' '}
            {order.buyer_profiles?.company_name ?? 'Buyer'} →{' '}
            {order.supplier_profiles?.shop_name ?? 'Xưởng'}
          </div>
        </div>
        <OrderAdminActions
          orderId={order.id}
          status={order.status}
          adminUserId={user.id}
          activeDispute={
            activeDispute ? { id: activeDispute.id, reason: activeDispute.reason } : null
          }
          canFlagDispute={!activeDispute && DISPUTABLE_STATUSES.includes(order.status)}
          showDetailLink={false}
        />
      </div>

      {order.status === 'cancelled' && (
        <div className="border-status-red-soft bg-status-red-soft text-status-red mb-4 rounded-[10px] border px-4 py-3 text-[13px]">
          <strong>Đơn đã bị hủy.</strong>
          {order.cancel_reason ? ` Lý do: ${order.cancel_reason}` : ''}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* LEFT */}
        <div className="min-w-0">
          <Card>
            <CardHeader title={<>💳 Thanh toán</>} />
            <CardBody padded>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="min-w-0">
                  <div className="text-brand-sub mb-2 text-xs font-bold tracking-[.04em] uppercase">
                    Biên lai của buyer
                  </div>
                  <OrderDocuments
                    orderId={order.id}
                    role="admin"
                    documents={receipts}
                    canUpload={false}
                  />
                </div>
                <div className="min-w-0">
                  {order.status === 'pending_payment' ? (
                    <>
                      <div className="text-brand-sub mb-2 text-xs font-bold tracking-[.04em] uppercase">
                        Xác nhận đã nhận tiền
                      </div>
                      <AdminConfirmPayment
                        orderId={order.id}
                        totalAmount={order.total_amount}
                        hasReceipt={receipts.length > 0}
                      />
                    </>
                  ) : (
                    <>
                      <div className="text-brand-sub mb-2 text-xs font-bold tracking-[.04em] uppercase">
                        Đã ghi nhận
                      </div>
                      <InfoRow label="Tổng đơn" value={formatVnd(order.total_amount)} />
                      <InfoRow
                        label="Đã nhận"
                        value={order.paid_amount != null ? formatVnd(order.paid_amount) : '—'}
                      />
                      {(order.paid_at || order.confirmed_at) && (
                        <InfoRow
                          label="Thời điểm"
                          value={formatVnDateTime((order.paid_at ?? order.confirmed_at) as string)}
                        />
                      )}
                      {order.payment_note && <InfoRow label="Ghi chú" value={order.payment_note} />}
                    </>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          {disputes.length > 0 && (
            <Card>
              <CardHeader title={<>⚠️ Tranh chấp</>} />
              <CardBody padded>
                {disputes.map((d) => (
                  <div
                    key={d.id}
                    className="border-b border-[#F2F0EC] py-2.5 text-xs first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <div className="font-semibold">
                      {d.status === 'resolved' ? 'Đã giải quyết' : 'Đang mở'} ·{' '}
                      {d.reporter_role === 'supplier' ? 'Xưởng báo' : 'Buyer báo'} ·{' '}
                      <span className="text-brand-light font-normal">
                        {formatVnDateTime(d.created_at)}
                      </span>
                    </div>
                    <div className="text-brand-sub mt-0.5 whitespace-pre-line">{d.reason}</div>
                    {d.resolution_note && (
                      <div className="text-brand-sub mt-0.5">Quyết định: {d.resolution_note}</div>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title={<>🕒 Lịch sử đơn hàng</>} />
            <CardBody padded>
              <OrderTimeline events={events} status={order.status} viewerId={user.id} />
              <OrderNoteForm orderId={order.id} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<>📎 Chứng từ khác</>} />
            <CardBody padded>
              <OrderDocuments
                orderId={order.id}
                role="admin"
                documents={otherDocuments}
                defaultDocType="other"
              />
            </CardBody>
          </Card>
        </div>

        {/* RIGHT RAIL */}
        <div className="min-w-0">
          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Đơn hàng
            </div>
            <OrderItemsTable
              items={order.order_items ?? []}
              total={order.total_amount}
              linkProducts
            />
            <div className="mt-2" />
            <InfoRow
              label="Nguồn đơn"
              value={order.source === 'direct' ? 'Đặt thẳng (giỏ hàng)' : 'Từ báo giá'}
            />
            {order.logistics_provider && (
              <InfoRow label="Vận chuyển" value={order.logistics_provider} />
            )}
            {order.tracking_number && <InfoRow label="Mã vận đơn" value={order.tracking_number} />}
          </div>

          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Hai bên
            </div>
            <InfoRow label="Buyer" value={order.buyer_profiles?.company_name ?? '—'} />
            {order.buyer_profiles?.city && (
              <InfoRow label="Khu vực" value={order.buyer_profiles.city} />
            )}
            <InfoRow
              label="Xưởng"
              value={
                order.supplier_profiles ? (
                  <Link href={`/shops/${order.supplier_profiles.id}`} className="text-brand-blue">
                    {order.supplier_profiles.shop_name}
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            {order.supplier_profiles?.village_origin && (
              <InfoRow label="Làng nghề" value={order.supplier_profiles.village_origin} />
            )}
          </div>

          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              📍 Giao hàng đến
            </div>
            <div className="text-brand-ink text-[13px] leading-relaxed whitespace-pre-line">
              {order.shipping_address || 'Chưa có địa chỉ giao hàng.'}
            </div>
          </div>

          <div className="border-brand-border rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Nhật ký admin
            </div>
            {audit.length === 0 ? (
              <div className="text-brand-light text-xs">
                Chưa có thao tác admin nào trên đơn này.
              </div>
            ) : (
              audit.map((a) => (
                <InfoRow
                  key={a.id}
                  label={AUDIT_LABEL[a.action] ?? a.action}
                  value={formatVnDateTime(a.created_at)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
