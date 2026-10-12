import Link from 'next/link';
import { Card, CardBody, CardHeader, Pill } from '@/components/ui';
import { formatVnd, formatVnDateTime } from '@/lib/format';
import {
  DISPUTABLE_ORDER_STATUSES,
  DISPUTE_BASE,
  DISPUTE_RESOLUTION_LABEL,
  DISPUTE_ROLE_LABEL,
  DISPUTE_STATUS,
  type DisputeMessageRow,
  type DisputeRow,
  type DisputeViewer,
  type RefundRow,
} from '@/lib/disputes';
import { OpenDisputeButton, RefundPaidButton } from './DisputeActions';
import { DisputeThread } from './DisputeThread';

const ORDER_BASE: Record<DisputeViewer, string> = {
  buyer: '/orders',
  supplier: '/supplier/orders',
  admin: '/admin/orders',
};

function orderCode(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

/** Tên bên kia của tranh chấp theo người xem. */
function counterparty(d: DisputeRow, viewer: DisputeViewer) {
  const buyer = d.orders?.buyer_profiles?.company_name ?? 'Buyer';
  const supplier = d.orders?.supplier_profiles?.shop_name ?? 'Xưởng';
  if (viewer === 'buyer') return supplier;
  if (viewer === 'supplier') return buyer;
  return `${buyer} ↔ ${supplier}`;
}

// Danh sách tranh chấp dùng chung cho /disputes, /supplier/disputes,
// /admin/disputes (kế hoạch 5.8). RLS đã lọc đúng phần mỗi vai trò được thấy.
export function DisputeListView({
  disputes,
  viewer,
  filter,
}: {
  disputes: DisputeRow[];
  viewer: DisputeViewer;
  filter: 'open' | 'resolved' | 'all';
}) {
  const base = DISPUTE_BASE[viewer];
  const tabs = [
    { key: 'open', label: 'Đang mở' },
    { key: 'resolved', label: 'Đã giải quyết' },
    { key: 'all', label: 'Tất cả' },
  ] as const;

  return (
    <>
      <div className="border-brand-border mb-4 flex gap-1 overflow-x-auto border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === 'open' ? base : `${base}?status=${tab.key}`}
            className={`border-b-2 px-3.5 py-2.5 text-[13px] font-semibold whitespace-nowrap ${
              tab.key === filter
                ? 'border-brand-red text-brand-red'
                : 'text-brand-sub hover:text-brand-red border-transparent'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {disputes.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-12 text-center">
          <div className="mb-2.5 text-[32px]">🤝</div>
          <div className="mb-1.5 text-sm font-bold">Không có tranh chấp nào ở mục này</div>
          {viewer !== 'admin' && (
            <div className="text-brand-sub text-xs">
              Khi đơn có vấn đề, mở tranh chấp từ trang chi tiết đơn hàng.
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {disputes.map((d) => (
            <Link
              key={d.id}
              href={`${base}/${d.id}`}
              className="border-brand-border hover:border-brand-clay block rounded-[10px] border bg-white p-3.5 px-4"
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-brand-light text-xs font-semibold">
                  Đơn {orderCode(d.order_id)}
                </span>
                <Pill tone={DISPUTE_STATUS[d.status]?.tone ?? 'gray'}>
                  {DISPUTE_STATUS[d.status]?.label ?? d.status}
                </Pill>
                <span className="text-brand-light ml-auto text-xs">
                  {formatVnDateTime(d.created_at)}
                </span>
              </div>
              <div className="text-[13.5px] font-bold break-words">{counterparty(d, viewer)}</div>
              <div className="text-brand-sub mt-0.5 line-clamp-2 text-xs break-words">
                {d.reporter_role ? `${DISPUTE_ROLE_LABEL[d.reporter_role]} báo: ` : ''}
                {d.reason}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

// Chi tiết một tranh chấp: tóm tắt, kết quả, khoản hoàn, trao đổi.
export function DisputeDetailView({
  dispute,
  messages,
  refunds,
  viewer,
}: {
  dispute: DisputeRow;
  messages: DisputeMessageRow[];
  refunds: RefundRow[];
  viewer: DisputeViewer;
}) {
  const resolved = dispute.status === 'resolved';
  const orderHref = `${ORDER_BASE[viewer]}/${dispute.order_id}`;

  return (
    <>
      <div className="text-brand-sub mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <Link href={DISPUTE_BASE[viewer]} className="hover:text-brand-red">
          Tranh chấp
        </Link>
        <span>/</span>
        <span className="text-brand-light">Đơn {orderCode(dispute.order_id)}</span>
      </div>

      <div className="mb-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <Pill tone={DISPUTE_STATUS[dispute.status]?.tone ?? 'gray'}>
            {DISPUTE_STATUS[dispute.status]?.label ?? dispute.status}
          </Pill>
          <span className="text-brand-sub text-xs">
            Mở lúc {formatVnDateTime(dispute.created_at)}
          </span>
        </div>
        <h1 className="text-xl font-bold break-words">
          Tranh chấp đơn {orderCode(dispute.order_id)}
        </h1>
        <div className="text-brand-sub mt-1 text-[13px] break-words">
          {counterparty(dispute, viewer)}
          {dispute.orders ? ` · ${formatVnd(Number(dispute.orders.total))}` : ''}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Card>
            <CardHeader title={<>💬 Trao đổi</>} />
            <CardBody padded>
              <DisputeThread
                disputeId={dispute.id}
                viewer={viewer}
                messages={messages}
                closed={resolved}
              />
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0">
          <Card>
            <CardHeader title={<>⚠️ Vấn đề</>} />
            <CardBody padded>
              <div className="text-brand-sub mb-1 text-xs">
                {dispute.reporter_role
                  ? `${DISPUTE_ROLE_LABEL[dispute.reporter_role]} báo`
                  : 'Lý do'}
              </div>
              <div className="text-[13px] leading-relaxed break-words whitespace-pre-line">
                {dispute.reason}
              </div>
              <Link
                href={orderHref}
                className="text-brand-blue mt-3 inline-flex min-h-10 items-center text-[13px] font-semibold"
              >
                📦 Mở đơn hàng{viewer === 'admin' && !resolved ? ' để ra quyết định' : ''} →
              </Link>
            </CardBody>
          </Card>

          {resolved && (
            <Card>
              <CardHeader title={<>⚖️ Kết quả</>} />
              <CardBody padded>
                <div className="text-[13px] font-bold">
                  {DISPUTE_RESOLUTION_LABEL[dispute.resolution ?? ''] ?? dispute.resolution}
                  {dispute.resolution === 'partial' && dispute.refund_ratio != null
                    ? ` (${Math.round(Number(dispute.refund_ratio) * 100)}%)`
                    : ''}
                </div>
                {dispute.resolution_note && (
                  <div className="text-brand-sub mt-1 text-[13px] leading-relaxed break-words whitespace-pre-line">
                    {dispute.resolution_note}
                  </div>
                )}
                {dispute.resolved_at && (
                  <div className="text-brand-light mt-2 text-xs">
                    {formatVnDateTime(dispute.resolved_at)}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {refunds.length > 0 && (
            <Card>
              <CardHeader title={<>💸 Hoàn tiền cho buyer</>} />
              <CardBody padded>
                {refunds.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-tight text-[15px] font-bold">
                        {formatVnd(Number(r.amount))}
                      </div>
                      <div className="text-brand-sub text-xs break-words">
                        {r.status === 'paid'
                          ? `Đã chuyển ${r.paid_at ? formatVnDateTime(r.paid_at) : ''} · Mã GD: ${r.bank_ref ?? '—'}`
                          : 'Sàn sẽ chuyển khoản trong 3 ngày làm việc.'}
                      </div>
                    </div>
                    {r.status === 'paid' ? (
                      <Pill tone="green">Đã hoàn</Pill>
                    ) : viewer === 'admin' ? (
                      <RefundPaidButton refundId={r.id} amount={Number(r.amount)} />
                    ) : (
                      <Pill tone="amber">Chờ chuyển</Pill>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

// Thẻ tranh chấp trên trang chi tiết đơn của buyer / xưởng: đang có tranh
// chấp thì dẫn sang trang tranh chấp, chưa có và đơn còn mở được thì hiện
// nút mở.
export function OrderDisputeCard({
  orderId,
  orderStatus,
  viewer,
  disputes,
}: {
  orderId: string;
  orderStatus: string;
  viewer: 'buyer' | 'supplier';
  disputes: { id: string; status: string; reason: string }[];
}) {
  const active = disputes.find((d) => d.status !== 'resolved');
  const latestResolved = disputes.find((d) => d.status === 'resolved');
  const canOpen = !active && DISPUTABLE_ORDER_STATUSES.includes(orderStatus);
  if (!active && !latestResolved && !canOpen) return null;

  return (
    <div
      className={`mb-4 rounded-[10px] border p-4 ${
        active ? 'border-status-red-soft bg-status-red-soft' : 'border-brand-border bg-white'
      }`}
    >
      {active ? (
        <>
          <div className="text-status-red text-[13px] font-bold">
            ⚠️ Đơn đang có tranh chấp — tạm dừng chuyển bước
          </div>
          <div className="text-brand-sub mt-1 line-clamp-3 text-xs break-words">
            {active.reason}
          </div>
          <Link
            href={`${DISPUTE_BASE[viewer]}/${active.id}`}
            className="text-brand-red mt-2 inline-flex min-h-10 items-center text-[13px] font-semibold"
          >
            Xem và trao đổi →
          </Link>
        </>
      ) : (
        <>
          {latestResolved && (
            <Link
              href={`${DISPUTE_BASE[viewer]}/${latestResolved.id}`}
              className="text-brand-blue flex min-h-10 items-center text-[13px] font-semibold"
            >
              ⚖️ Xem kết quả tranh chấp →
            </Link>
          )}
          {canOpen && <OpenDisputeButton orderId={orderId} viewer={viewer} />}
        </>
      )}
    </div>
  );
}
