import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell, Card, CardBody, CardHeader, StatTile } from '@/components/ui';
import { PayoutPaidButton } from '@/components/finance/FinanceActions';
import { formatVnd, formatVnDateTime } from '@/lib/format';
import { requireAdmin } from '../_lib/guard';

export const metadata: Metadata = {
  title: 'Tài chính & đối soát — LàngNghề.vn',
};

// Kết quả của RPC admin_finance_summary() (20261005094600).
interface Summary {
  collected: number;
  refunded: number;
  refund_pending: number;
  paid_out: number;
  payout_pending: number;
  payout_pending_count: number;
  fees: number;
  held_in_progress: number;
  expected_balance: number;
}

interface Payout {
  id: string;
  order_id: string;
  supplier_id: string;
  gross_amount: number;
  refund_amount: number;
  fee_amount: number;
  net_amount: number;
  status: string;
  bank_ref: string | null;
  created_at: string;
  paid_at: string | null;
  supplier_profiles: { shop_name: string } | null;
}

interface Account {
  supplier_id: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  branch: string | null;
}

const PAYOUT_COLUMNS =
  'id, order_id, supplier_id, gross_amount, refund_amount, fee_amount, net_amount, status, bank_ref, created_at, paid_at, supplier_profiles(shop_name)';

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#F2F0EC] py-2 text-[13px] first:pt-0 last:border-b-0 last:pb-0">
      <span className={strong ? 'font-bold' : 'text-brand-sub'}>{label}</span>
      <span className={`font-tight shrink-0 ${strong ? 'text-[15px] font-bold' : 'font-semibold'}`}>
        {value}
      </span>
    </div>
  );
}

// Tài chính & đối soát (bước 6): tiền sàn đã thu, đã hoàn buyer, đã trả xưởng
// và các khoản còn phải trả. Chuyển khoản thực hiện ngoài hệ thống; trang này
// là sổ để đối chiếu với sao kê ngân hàng.
export default async function AdminFinancePage() {
  const { supabase, shell } = await requireAdmin();

  const [{ data: summaryData, error }, { data: pendingData }, { data: paidData }] =
    await Promise.all([
      supabase.rpc('admin_finance_summary'),
      supabase
        .from('supplier_payouts')
        .select(PAYOUT_COLUMNS)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(100),
      supabase
        .from('supplier_payouts')
        .select(PAYOUT_COLUMNS)
        .eq('status', 'paid')
        .order('paid_at', { ascending: false })
        .limit(20),
    ]);

  const summary = (summaryData ?? null) as Summary | null;
  const pending = (pendingData ?? []) as unknown as Payout[];
  const paid = (paidData ?? []) as unknown as Payout[];

  const supplierIds = [...new Set(pending.map((p) => p.supplier_id))];
  const { data: accountsData } = supplierIds.length
    ? await supabase
        .from('supplier_payout_accounts')
        .select('supplier_id, bank_name, account_number, account_holder, branch')
        .in('supplier_id', supplierIds)
    : { data: [] as Account[] };
  const accountOf = new Map(((accountsData ?? []) as Account[]).map((a) => [a.supplier_id, a]));

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-lg font-bold">Tài chính & đối soát</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          Sổ tiền qua tài khoản của sàn. Đối chiếu &quot;Số dư phải có&quot; với sao kê ngân hàng.
          Phí sàn chỉnh ở{' '}
          <Link href="/admin/settings" className="text-brand-blue">
            Cài đặt sàn
          </Link>
          .
        </div>
      </div>

      {!summary ? (
        <div className="border-status-red-soft bg-status-red-soft text-status-red mb-4 rounded-[10px] border px-4 py-3 text-[13px]">
          Không tải được số liệu{error ? ' (database chưa có hàm admin_finance_summary)' : ''}.
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Số dư phải có trong tài khoản sàn"
              value={formatVnd(Number(summary.expected_balance))}
            />
            <StatTile
              label={`Chờ trả xưởng (${summary.payout_pending_count} khoản)`}
              value={formatVnd(Number(summary.payout_pending))}
            />
            <StatTile label="Chờ hoàn buyer" value={formatVnd(Number(summary.refund_pending))} />
            <StatTile label="Phí sàn đã ghi nhận" value={formatVnd(Number(summary.fees))} />
          </div>

          <Card>
            <CardHeader title={<>🧮 Đối soát</>} />
            <CardBody padded>
              <Line
                label="Tổng tiền buyer đã chuyển (sàn đã xác nhận)"
                value={formatVnd(Number(summary.collected))}
              />
              <Line label="− Đã hoàn cho buyer" value={formatVnd(Number(summary.refunded))} />
              <Line label="− Đã chuyển cho xưởng" value={formatVnd(Number(summary.paid_out))} />
              <Line
                label="= Số dư phải có trong tài khoản sàn"
                value={formatVnd(Number(summary.expected_balance))}
                strong
              />
              <div className="text-brand-sub mt-3 text-xs leading-relaxed">
                Trong số dư đó: {formatVnd(Number(summary.held_in_progress))} là tiền của các đơn
                chưa hoàn tất (sàn đang giữ), {formatVnd(Number(summary.payout_pending))} chờ trả
                xưởng, {formatVnd(Number(summary.refund_pending))} chờ hoàn buyer. Phần còn lại là
                phí sàn và chênh lệch cần kiểm tra.
              </div>
            </CardBody>
          </Card>
        </>
      )}

      <Card>
        <CardHeader title={<>💵 Chờ chuyển cho xưởng ({pending.length})</>} />
        <CardBody padded>
          {pending.length === 0 ? (
            <div className="text-brand-sub text-[13px]">Không có khoản nào chờ chuyển.</div>
          ) : (
            pending.map((p) => {
              const account = accountOf.get(p.supplier_id);
              const name = p.supplier_profiles?.shop_name ?? 'Xưởng';
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[#F2F0EC] py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1 basis-[240px]">
                    <div className="text-[13px] font-bold break-words">
                      {name}{' '}
                      <Link
                        href={`/admin/orders/${p.order_id}`}
                        className="text-brand-blue font-normal"
                      >
                        · Đơn #{p.order_id.slice(0, 8).toUpperCase()}
                      </Link>
                    </div>
                    <div className="text-brand-sub text-xs break-words">
                      Thu {formatVnd(Number(p.gross_amount))}
                      {Number(p.refund_amount) > 0
                        ? ` − hoàn ${formatVnd(Number(p.refund_amount))}`
                        : ''}
                      {Number(p.fee_amount) > 0 ? ` − phí ${formatVnd(Number(p.fee_amount))}` : ''}{' '}
                      · hoàn tất {formatVnDateTime(p.created_at)}
                    </div>
                    <div
                      className={`text-xs break-words ${account ? 'text-brand-ink' : 'text-status-red'}`}
                    >
                      {account
                        ? `${account.bank_name} · ${account.account_number} · ${account.account_holder}${account.branch ? ` · ${account.branch}` : ''}`
                        : 'Xưởng chưa khai tài khoản nhận tiền — liên hệ xưởng trước khi chuyển.'}
                    </div>
                  </div>
                  <div className="font-tight shrink-0 text-[15px] font-bold">
                    {formatVnd(Number(p.net_amount))}
                  </div>
                  <PayoutPaidButton
                    payoutId={p.id}
                    amount={Number(p.net_amount)}
                    supplierName={name}
                    hasAccount={!!account}
                  />
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={<>✅ Đã chuyển gần đây</>} />
        <CardBody padded>
          {paid.length === 0 ? (
            <div className="text-brand-sub text-[13px]">
              Chưa có khoản nào được đánh dấu đã chuyển.
            </div>
          ) : (
            paid.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-[#F2F0EC] py-2.5 text-[13px] first:pt-0 last:border-b-0 last:pb-0"
              >
                <span className="min-w-0 break-words">
                  {p.supplier_profiles?.shop_name ?? 'Xưởng'}{' '}
                  <span className="text-brand-sub text-xs">
                    · Đơn #{p.order_id.slice(0, 8).toUpperCase()} ·{' '}
                    {p.paid_at ? formatVnDateTime(p.paid_at) : ''} · Mã GD: {p.bank_ref ?? '—'}
                  </span>
                </span>
                <span className="font-tight shrink-0 font-bold">
                  {formatVnd(Number(p.net_amount))}
                </span>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <div className="text-brand-sub text-xs">
        Hoàn tiền cho buyer xử lý ở{' '}
        <Link href="/admin/disputes" className="text-brand-blue">
          Tranh chấp & hoàn tiền
        </Link>
        .
      </div>
    </AppShell>
  );
}
