import type { Metadata } from 'next';
import { AppShell, Card, CardBody, CardHeader } from '@/components/ui';
import Link from 'next/link';
import { RefundPaidButton } from '@/components/disputes/DisputeActions';
import { DisputeListView } from '@/components/disputes/DisputeViews';
import { loadDisputes, loadPendingRefunds } from '@/lib/disputes';
import { formatVnd, formatVnDateTime } from '@/lib/format';
import { requireAdmin } from '../_lib/guard';

export const metadata: Metadata = {
  title: 'Tranh chấp — LàngNghề.vn',
};

// Danh sách tranh chấp (kế hoạch 5.8). Kèm các khoản hoàn tiền đang chờ sàn chuyển.
export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.status === 'resolved' || sp.status === 'all' ? sp.status : 'open';

  const { supabase, shell } = await requireAdmin();
  const [disputes, pendingRefunds] = await Promise.all([
    loadDisputes(supabase, filter),
    loadPendingRefunds(supabase),
  ]);

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Tranh chấp</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          Trả lời trong từng tranh chấp; ra quyết định ở trang đơn hàng.
        </div>
      </div>

      {pendingRefunds.length > 0 && (
        <Card>
          <CardHeader title={<>💸 Hoàn tiền chờ chuyển ({pendingRefunds.length})</>} />
          <CardBody padded>
            {pendingRefunds.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F2F0EC] py-2.5 first:pt-0 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="font-tight text-[15px] font-bold">
                    {formatVnd(Number(r.amount))}
                  </div>
                  <div className="text-brand-sub text-xs">
                    <Link href={`/admin/orders/${r.order_id}`} className="hover:text-brand-red">
                      Đơn #{r.order_id.slice(0, 8).toUpperCase()}
                    </Link>{' '}
                    · ghi lúc {formatVnDateTime(r.created_at)}
                  </div>
                </div>
                <RefundPaidButton refundId={r.id} amount={Number(r.amount)} />
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <DisputeListView disputes={disputes} viewer="admin" filter={filter} />
    </AppShell>
  );
}
