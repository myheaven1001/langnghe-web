import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell, Card, CardBody, CardHeader, Pill, StatTile } from '@/components/ui';
import { PayoutAccountForm, type PayoutAccount } from '@/components/finance/FinanceActions';
import { formatVnd, formatVnDateTime } from '@/lib/format';
import { requireSupplier } from '../_lib/guard';

export const metadata: Metadata = {
  title: 'Tài chính — LàngNghề.vn',
};

interface Payout {
  id: string;
  order_id: string;
  gross_amount: number;
  refund_amount: number;
  fee_percent: number;
  fee_amount: number;
  net_amount: number;
  status: string;
  bank_ref: string | null;
  created_at: string;
  paid_at: string | null;
}

interface Summary {
  held_in_progress: number;
  payout_pending: number;
  paid_out: number;
  fees: number;
  commission_percent: number;
}

// Tài chính của xưởng (bước 6): tiền sàn đang giữ cho đơn chưa xong, khoản
// chờ sàn trả, khoản đã nhận; tài khoản ngân hàng nhận tiền. Số liệu từ RPC
// supplier_finance_summary() và bảng supplier_payouts (mỗi đơn hoàn tất một dòng).
export default async function SupplierFinancePage() {
  const { supabase, supplier, shell } = await requireSupplier();

  const [{ data: summaryData }, { data: payoutsData }, { data: accountData }] = await Promise.all([
    supabase.rpc('supplier_finance_summary'),
    supabase
      .from('supplier_payouts')
      .select(
        'id, order_id, gross_amount, refund_amount, fee_percent, fee_amount, net_amount, status, bank_ref, created_at, paid_at',
      )
      .eq('supplier_id', supplier.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('supplier_payout_accounts')
      .select('bank_name, account_number, account_holder, branch')
      .eq('supplier_id', supplier.id)
      .maybeSingle(),
  ]);

  const summary = (summaryData ?? null) as Summary | null;
  const payouts = (payoutsData ?? []) as Payout[];
  const account = (accountData ?? null) as PayoutAccount | null;
  const rate = Number(summary?.commission_percent ?? 0);

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Tài chính</h1>
        <div className="text-brand-sub mt-1 text-[13px] leading-relaxed">
          Buyer chuyển khoản cho sàn; khi đơn hoàn tất, sàn chuyển tiền cho xưởng
          {rate > 0 ? ` sau khi trừ phí sàn ${rate}%` : ' (hiện sàn chưa thu phí)'}.
        </div>
      </div>

      {!account && (
        <div className="bg-status-amber-soft text-status-amber mb-4 rounded-[10px] px-4 py-3 text-[13px] font-semibold">
          Bạn chưa khai tài khoản nhận tiền. Điền ở cuối trang để sàn chuyển khoản được cho xưởng.
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Sàn đang giữ (đơn chưa hoàn tất)"
          value={formatVnd(Number(summary?.held_in_progress ?? 0))}
        />
        <StatTile label="Chờ sàn chuyển" value={formatVnd(Number(summary?.payout_pending ?? 0))} />
        <StatTile label="Đã nhận" value={formatVnd(Number(summary?.paid_out ?? 0))} />
      </div>

      <Card>
        <CardHeader title={<>💵 Tiền theo từng đơn đã hoàn tất</>} />
        <CardBody padded>
          {payouts.length === 0 ? (
            <div className="text-brand-sub text-[13px]">
              Chưa có đơn nào hoàn tất. Khi buyer xác nhận hoàn tất đơn, khoản sàn phải trả sẽ hiện
              ở đây.
            </div>
          ) : (
            payouts.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#F2F0EC] py-3 first:pt-0 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                    <Link href={`/supplier/orders/${p.order_id}`} className="text-brand-blue">
                      Đơn #{p.order_id.slice(0, 8).toUpperCase()}
                    </Link>
                    {p.status === 'paid' ? (
                      <Pill tone="green">Đã nhận</Pill>
                    ) : (
                      <Pill tone="amber">Chờ sàn chuyển</Pill>
                    )}
                  </div>
                  <div className="text-brand-sub text-xs break-words">
                    Buyer trả {formatVnd(Number(p.gross_amount))}
                    {Number(p.refund_amount) > 0
                      ? ` − hoàn buyer ${formatVnd(Number(p.refund_amount))}`
                      : ''}
                    {Number(p.fee_amount) > 0
                      ? ` − phí sàn ${Number(p.fee_percent)}% (${formatVnd(Number(p.fee_amount))})`
                      : ''}
                  </div>
                  <div className="text-brand-light text-xs break-words">
                    {p.status === 'paid' && p.paid_at
                      ? `Chuyển lúc ${formatVnDateTime(p.paid_at)} · Mã GD: ${p.bank_ref ?? '—'}`
                      : `Hoàn tất lúc ${formatVnDateTime(p.created_at)}`}
                  </div>
                </div>
                <div className="font-tight shrink-0 text-[15px] font-bold">
                  {formatVnd(Number(p.net_amount))}
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={<>🏦 Tài khoản nhận tiền</>} />
        <CardBody padded>
          <p className="text-brand-sub mb-3 text-[13px]">
            Chỉ bạn và quản trị viên của sàn thấy thông tin này. Kiểm tra kỹ số tài khoản trước khi
            lưu.
          </p>
          <PayoutAccountForm account={account} />
        </CardBody>
      </Card>
    </AppShell>
  );
}
