import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell, Card, CardBody, CardHeader, Pill, StatTile } from '@/components/ui';
import { requireBuyer } from '@/lib/buyer-shell';
import { formatVnd, formatVnDateTime } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Lịch sử thanh toán — LàngNghề.vn',
};

interface PaidOrder {
  id: string;
  total: number;
  paid_amount: number | null;
  paid_at: string | null;
  status: string;
  supplier_profiles: { shop_name: string } | null;
}

interface Refund {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  bank_ref: string | null;
  created_at: string;
  paid_at: string | null;
}

interface Entry {
  key: string;
  kind: 'payment' | 'refund';
  at: string;
  orderId: string;
  amount: number;
  note: string;
  pending: boolean;
}

// Lịch sử thanh toán của buyer (bước 6): các lần sàn xác nhận đã nhận tiền
// (orders.paid_at / paid_amount do admin_confirm_payment ghi) và các khoản
// hoàn tiền (bảng refunds). Chỉ đọc; RLS giới hạn đúng đơn của buyer.
export default async function BuyerPaymentsPage() {
  const { supabase, buyer, shell } = await requireBuyer();

  const [{ data: ordersData }, { data: refundsData }, { count: awaitingCount }] = await Promise.all(
    [
      supabase
        .from('orders')
        .select('id, total, paid_amount, paid_at, status, supplier_profiles(shop_name)')
        .eq('buyer_id', buyer.id)
        .not('paid_at', 'is', null)
        .order('paid_at', { ascending: false })
        .limit(200),
      supabase
        .from('refunds')
        .select(
          'id, order_id, amount, status, bank_ref, created_at, paid_at, orders!inner(buyer_id)',
        )
        .eq('orders.buyer_id', buyer.id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('buyer_id', buyer.id)
        .eq('status', 'pending_payment'),
    ],
  );

  const orders = (ordersData ?? []) as unknown as PaidOrder[];
  const refunds = (refundsData ?? []) as unknown as Refund[];
  const shopOf = new Map(orders.map((o) => [o.id, o.supplier_profiles?.shop_name ?? 'Xưởng']));

  const entries: Entry[] = [
    ...orders.map((o) => ({
      key: `p-${o.id}`,
      kind: 'payment' as const,
      at: o.paid_at!,
      orderId: o.id,
      amount: Number(o.paid_amount ?? o.total),
      note: o.supplier_profiles?.shop_name ?? 'Xưởng',
      pending: false,
    })),
    ...refunds.map((r) => ({
      key: `r-${r.id}`,
      kind: 'refund' as const,
      at: r.paid_at ?? r.created_at,
      orderId: r.order_id,
      amount: Number(r.amount),
      note:
        r.status === 'paid'
          ? `Mã giao dịch: ${r.bank_ref ?? '—'}`
          : `Sàn đang xử lý · ${shopOf.get(r.order_id) ?? ''}`.replace(/ · $/, ''),
      pending: r.status !== 'paid',
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const totalPaid = orders.reduce((sum, o) => sum + Number(o.paid_amount ?? o.total), 0);
  const refunded = refunds
    .filter((r) => r.status === 'paid')
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const refundPending = refunds
    .filter((r) => r.status !== 'paid')
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Lịch sử thanh toán</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          Các khoản sàn đã xác nhận nhận từ bạn và các khoản hoàn lại.
          {awaitingCount ? (
            <>
              {' '}
              <Link href="/orders?status=pending_payment&range=all" className="text-brand-red">
                {awaitingCount} đơn đang chờ bạn chuyển khoản →
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Đã thanh toán" value={formatVnd(totalPaid)} />
        <StatTile label="Đã được hoàn" value={formatVnd(refunded)} />
        <StatTile label="Hoàn tiền đang chờ" value={formatVnd(refundPending)} />
      </div>

      <Card>
        <CardHeader title={<>🧾 Giao dịch</>} />
        <CardBody padded>
          {entries.length === 0 ? (
            <div className="text-brand-sub text-[13px]">
              Chưa có giao dịch nào. Sau khi bạn chuyển khoản và sàn xác nhận, khoản thanh toán sẽ
              hiện ở đây.
            </div>
          ) : (
            entries.map((e) => (
              <div
                key={e.key}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#F2F0EC] py-3 first:pt-0 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                    {e.kind === 'payment' ? 'Thanh toán đơn' : 'Hoàn tiền đơn'}
                    <Link href={`/orders/${e.orderId}`} className="text-brand-blue">
                      #{e.orderId.slice(0, 8).toUpperCase()}
                    </Link>
                    {e.pending && <Pill tone="amber">Chờ chuyển</Pill>}
                  </div>
                  <div className="text-brand-sub text-xs break-words">
                    {formatVnDateTime(e.at)} · {e.note}
                  </div>
                </div>
                <div
                  className={`font-tight shrink-0 text-[15px] font-bold ${
                    e.kind === 'refund' ? 'text-brand-green' : ''
                  }`}
                >
                  {e.kind === 'refund' ? '+' : '−'}
                  {formatVnd(e.amount)}
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </AppShell>
  );
}
