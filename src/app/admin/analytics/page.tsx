import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell, Card, CardBody, CardHeader, StatTile } from '@/components/ui';
import { formatVnd } from '@/lib/format';
import { requireAdmin } from '../_lib/guard';

export const metadata: Metadata = {
  title: 'Báo cáo toàn sàn — LàngNghề.vn',
};

// Kết quả của RPC admin_platform_report() (20261005094300).
interface PlatformReport {
  days: number;
  from: string;
  to: string;
  orders: {
    created: number;
    from_rfq: number;
    direct: number;
    completed: number;
    cancelled: number;
    value: number;
  };
  paid: { orders: number; amount: number };
  users: {
    new_buyers: number;
    new_suppliers: number;
    selling_suppliers: number;
    active_products: number;
  };
  rfq: {
    created: number;
    with_quotes: number;
    awarded: number;
    expired: number;
    cancelled: number;
    avg_quotes: number;
    median_hours_to_first_quote: number | null;
  };
  trust: {
    disputes_opened: number;
    refund_amount: number;
    reviews: number;
    avg_rating: number;
    reports_open: number;
  };
  daily: { date: string; orders: number; paid: number }[];
  top_suppliers: { id: string; name: string; orders: number; amount: number }[];
}

const RANGES = [7, 30, 90, 365] as const;

function percent(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#F2F0EC] py-2 text-[13px] first:pt-0 last:border-b-0 last:pb-0">
      <span className="text-brand-sub min-w-0">{label}</span>
      <span className="shrink-0 text-right font-semibold">
        {value}
        {hint && <span className="text-brand-light font-normal"> · {hint}</span>}
      </span>
    </div>
  );
}

// Báo cáo toàn sàn (bước 6 — Vận hành): số liệu N ngày gần nhất từ một lần
// gọi admin_platform_report(). Chỉ đọc.
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const days = RANGES.find((r) => String(r) === sp.days) ?? 30;

  const { supabase, shell } = await requireAdmin();
  const { data, error } = await supabase.rpc('admin_platform_report', { p_days: days });
  const report = (data ?? null) as PlatformReport | null;

  const maxPaid = Math.max(1, ...(report?.daily ?? []).map((d) => Number(d.paid)));
  const maxOrders = Math.max(1, ...(report?.daily ?? []).map((d) => d.orders));

  return (
    <AppShell {...shell}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Báo cáo toàn sàn</h1>
          {report && (
            <div className="text-brand-sub mt-1 text-[13px]">
              {new Date(report.from).toLocaleDateString('vi-VN')} –{' '}
              {new Date(report.to).toLocaleDateString('vi-VN')} (giờ Việt Nam)
            </div>
          )}
        </div>
        <div className="border-brand-border flex overflow-hidden rounded-lg border bg-white text-[13px]">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={r === 30 ? '/admin/analytics' : `/admin/analytics?days=${r}`}
              className={`min-h-10 px-3.5 py-2 font-semibold ${
                r === days ? 'bg-brand-forest text-white' : 'text-brand-sub hover:text-brand-ink'
              }`}
            >
              {r === 365 ? '1 năm' : `${r} ngày`}
            </Link>
          ))}
        </div>
      </div>

      {!report ? (
        <div className="border-status-red-soft bg-status-red-soft text-status-red rounded-[10px] border px-4 py-3 text-[13px]">
          Không tải được báo cáo{error ? ' (database chưa có hàm admin_platform_report)' : ''}. Vui
          lòng thử lại.
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Tiền sàn đã xác nhận thu"
              value={formatVnd(Number(report.paid.amount))}
            />
            <StatTile label="Đơn mới" value={String(report.orders.created)} />
            <StatTile label="RFQ mới" value={String(report.rfq.created)} />
            <StatTile
              label="Người dùng mới"
              value={String(report.users.new_buyers + report.users.new_suppliers)}
            />
          </div>

          <Card>
            <CardHeader title={<>📈 Theo ngày</>} />
            <CardBody padded>
              <div className="text-brand-sub mb-2 flex flex-wrap gap-x-4 text-xs">
                <span>
                  <span className="bg-brand-forest mr-1 inline-block h-2 w-2 rounded-sm" />
                  Tiền đã xác nhận thu
                </span>
                <span>
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#FFB800]" />
                  Số đơn mới
                </span>
              </div>
              <div className="overflow-x-auto">
                <div
                  className="flex h-[140px] items-end gap-px"
                  style={{ minWidth: Math.min(report.daily.length, 120) * 6 }}
                  role="img"
                  aria-label="Biểu đồ tiền đã thu và số đơn theo ngày"
                >
                  {report.daily.map((d) => (
                    <div
                      key={d.date}
                      className="flex h-full min-w-[3px] flex-1 items-end gap-px"
                      title={`${new Date(d.date).toLocaleDateString('vi-VN')}: ${formatVnd(Number(d.paid))} · ${d.orders} đơn`}
                    >
                      <div
                        className="bg-brand-forest flex-1 rounded-t-sm"
                        style={{ height: `${(Number(d.paid) / maxPaid) * 100}%` }}
                      />
                      <div
                        className="flex-1 rounded-t-sm bg-[#FFB800]"
                        style={{ height: `${(d.orders / maxOrders) * 100}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-brand-light mt-1.5 flex justify-between text-xs">
                <span>{new Date(report.from).toLocaleDateString('vi-VN')}</span>
                <span>{new Date(report.to).toLocaleDateString('vi-VN')}</span>
              </div>
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={<>📦 Đơn hàng</>} />
              <CardBody padded>
                <Row label="Đơn tạo trong kỳ" value={String(report.orders.created)} />
                <Row
                  label="Từ báo giá (RFQ) / đặt thẳng"
                  value={`${report.orders.from_rfq} / ${report.orders.direct}`}
                />
                <Row
                  label="Đã hoàn tất"
                  value={String(report.orders.completed)}
                  hint={percent(report.orders.completed, report.orders.created)}
                />
                <Row
                  label="Đã huỷ"
                  value={String(report.orders.cancelled)}
                  hint={percent(report.orders.cancelled, report.orders.created)}
                />
                <Row
                  label="Giá trị đơn (không tính đơn huỷ)"
                  value={formatVnd(Number(report.orders.value))}
                />
                <Row
                  label="Đơn được xác nhận thanh toán"
                  value={String(report.paid.orders)}
                  hint={formatVnd(Number(report.paid.amount))}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={<>📋 Yêu cầu báo giá</>}
                action={
                  <Link href="/admin/rfq" className="text-brand-blue text-xs font-semibold">
                    Giám sát RFQ →
                  </Link>
                }
              />
              <CardBody padded>
                <Row label="RFQ gửi trong kỳ" value={String(report.rfq.created)} />
                <Row
                  label="Có ít nhất 1 báo giá"
                  value={String(report.rfq.with_quotes)}
                  hint={percent(report.rfq.with_quotes, report.rfq.created)}
                />
                <Row
                  label="Đã chốt xưởng"
                  value={String(report.rfq.awarded)}
                  hint={percent(report.rfq.awarded, report.rfq.created)}
                />
                <Row
                  label="Hết hạn / buyer huỷ"
                  value={`${report.rfq.expired} / ${report.rfq.cancelled}`}
                />
                <Row
                  label="Số báo giá trung bình mỗi RFQ có báo giá"
                  value={String(report.rfq.avg_quotes)}
                />
                <Row
                  label="Thời gian tới báo giá đầu tiên (trung vị)"
                  value={
                    report.rfq.median_hours_to_first_quote == null
                      ? '—'
                      : `${report.rfq.median_hours_to_first_quote} giờ`
                  }
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={<>👥 Người dùng & hàng hoá</>} />
              <CardBody padded>
                <Row label="Buyer mới" value={String(report.users.new_buyers)} />
                <Row label="Xưởng mới" value={String(report.users.new_suppliers)} />
                <Row
                  label="Xưởng đang có hàng bán (hiện tại)"
                  value={String(report.users.selling_suppliers)}
                />
                <Row
                  label="Sản phẩm đang bán (hiện tại)"
                  value={String(report.users.active_products)}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={<>🛡️ Uy tín</>} />
              <CardBody padded>
                <Row label="Tranh chấp mở trong kỳ" value={String(report.trust.disputes_opened)} />
                <Row
                  label="Tiền hoàn ghi nhận trong kỳ"
                  value={formatVnd(Number(report.trust.refund_amount))}
                />
                <Row
                  label="Đánh giá mới"
                  value={String(report.trust.reviews)}
                  hint={
                    report.trust.reviews > 0
                      ? `${Number(report.trust.avg_rating).toFixed(1)}★ trung bình`
                      : undefined
                  }
                />
                <Row
                  label="Báo cáo vi phạm đang chờ (hiện tại)"
                  value={String(report.trust.reports_open)}
                />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title={<>🏆 Xưởng có doanh thu cao nhất trong kỳ</>} />
            <CardBody padded>
              {report.top_suppliers.length === 0 ? (
                <div className="text-brand-sub text-[13px]">
                  Chưa có đơn nào được xác nhận thanh toán.
                </div>
              ) : (
                report.top_suppliers.map((s, i) => (
                  <Row
                    key={s.id}
                    label={`${i + 1}. ${s.name}`}
                    value={formatVnd(Number(s.amount))}
                    hint={`${s.orders} đơn`}
                  />
                ))
              )}
            </CardBody>
          </Card>
        </>
      )}
    </AppShell>
  );
}
