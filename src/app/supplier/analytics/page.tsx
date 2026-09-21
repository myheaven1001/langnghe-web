import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, Card, CardBody, CardHeader, StatCard } from '@/components/ui';
import { formatVnd } from '@/lib/format';
import { buildSupplierNavGroups } from '../_lib/nav';
import { getNewRfqCount, getUnreadNotificationCount } from '../_lib/counts';

export const metadata: Metadata = {
  title: 'Analytics xưởng — LàngNghề.vn',
};

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

// Khớp hình dạng JSON của public.get_supplier_analytics() (migration
// 20261002090000_sprint3_search_logs_rfq_metrics.sql).
interface Pair {
  current: number;
  previous: number;
}

interface SupplierAnalytics {
  days: number;
  search_appearances: Pair;
  rfq_received: Pair;
  quotes_sent: Pair;
  revenue: Pair;
  daily: { day: string; count: number }[];
  funnel: { received: number; quoted: number; chosen: number; ordered: number };
  rfq_market: {
    rfqs: number;
    avg_quotes_received: number | null;
    avg_first_quote_hours: number | null;
    avg_award_hours: number | null;
    awarded_count: number;
    my_avg_response_hours: number | null;
  };
  keywords: { query: string; count: number }[];
  top_products: { id: string; name: string; count: number }[];
}

function parseRange(raw: string | undefined): Range {
  const n = Number(raw);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : 30;
}

function delta({ current, previous }: Pair): { text?: string; tone?: 'up' | 'down' | 'new' } {
  if (previous === 0) return current > 0 ? { text: 'Mới', tone: 'new' } : {};
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return {};
  return { text: `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}%`, tone: pct > 0 ? 'up' : 'down' };
}

function compactVnd(v: number) {
  if (v < 1_000_000) return formatVnd(v);
  const m = v / 1_000_000;
  return `${m >= 10 ? Math.round(m) : Number(m.toFixed(1))}tr`;
}

function formatHours(h: number | null) {
  if (h === null) return '—';
  if (h < 1) return `${Math.round(h * 60)} phút`;
  if (h < 48) return `${Number(h.toFixed(1))} giờ`;
  return `${Number((h / 24).toFixed(1))} ngày`;
}

// 'YYYY-MM-DD' → 'd/m'
function dayLabel(day: string) {
  const [, m, d] = day.split('-');
  return `${Number(d)}/${Number(m)}`;
}

export default async function SupplierAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const range = parseRange((await searchParams).range);

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

  const [newRfqCount, unreadCount, { data, error }] = await Promise.all([
    getNewRfqCount(supabase, supplier.id),
    getUnreadNotificationCount(supabase, user.id),
    supabase.rpc('get_supplier_analytics', { p_days: range }),
  ]);
  const stats = data as SupplierAnalytics | null;

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
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/supplier/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Analytics</span>
      </div>

      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-bold">Analytics xưởng</div>
          <div className="text-brand-sub mt-1 text-[12.5px]">
            Hiệu suất tìm kiếm và chỉ số RFQ của gian hàng — cập nhật theo thời gian thực.
          </div>
        </div>
        <div className="border-brand-border flex gap-0.5 rounded-lg border bg-white p-[3px]">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/supplier/analytics?range=${r}`}
              className={`rounded-md px-3.5 py-[7px] text-xs font-semibold ${
                r === range ? 'bg-brand-red text-white' : 'text-brand-sub hover:text-brand-red'
              }`}
            >
              {r} ngày
            </Link>
          ))}
        </div>
      </div>

      {error || !stats ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-[60px] text-center">
          <div className="mb-3 text-[36px]">⚠️</div>
          <div className="mb-1.5 text-sm font-bold">Chưa tải được số liệu Analytics</div>
          <div className="text-brand-sub mx-auto max-w-[440px] text-xs leading-relaxed">
            {error?.code === 'PGRST202' ? (
              <>
                Database chưa có hàm <code className="text-brand-ink">get_supplier_analytics</code>.
                Cần chạy migration{' '}
                <code className="text-brand-ink">
                  20261002090000_sprint3_search_logs_rfq_metrics
                </code>{' '}
                trên Supabase.
              </>
            ) : (
              'Đã có lỗi khi đọc dữ liệu. Vui lòng thử lại sau.'
            )}
          </div>
        </div>
      ) : (
        <AnalyticsBody stats={stats} range={range} />
      )}
    </AppShell>
  );
}

function AnalyticsBody({ stats, range }: { stats: SupplierAnalytics; range: Range }) {
  const { funnel, rfq_market: market } = stats;
  const revDelta = delta(stats.revenue);
  const searchDelta = delta(stats.search_appearances);
  const rfqDelta = delta(stats.rfq_received);
  const quoteDelta = delta(stats.quotes_sent);

  const maxDaily = Math.max(...stats.daily.map((d) => d.count), 0);
  const labelStep = range <= 7 ? 1 : range <= 30 ? 3 : 10;
  const maxProduct = Math.max(...stats.top_products.map((p) => p.count), 0);

  const funnelSteps = [
    { label: 'RFQ nhận', value: funnel.received, color: 'bg-brand-blue' },
    { label: 'Đã báo giá', value: funnel.quoted, color: 'bg-status-purple' },
    { label: 'Buyer chọn', value: funnel.chosen, color: 'bg-status-amber' },
    { label: 'Thành đơn', value: funnel.ordered, color: 'bg-status-green' },
  ];

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon="🔍"
          iconTone="blue"
          value={stats.search_appearances.current.toLocaleString('vi-VN')}
          label="Lượt xuất hiện trong tìm kiếm"
          delta={searchDelta.text}
          deltaTone={searchDelta.tone}
        />
        <StatCard
          icon="📥"
          iconTone="amber"
          value={stats.rfq_received.current.toLocaleString('vi-VN')}
          label="RFQ nhận được"
          delta={rfqDelta.text}
          deltaTone={rfqDelta.tone}
        />
        <StatCard
          icon="📤"
          iconTone="purple"
          value={stats.quotes_sent.current.toLocaleString('vi-VN')}
          label="Báo giá đã gửi"
          delta={quoteDelta.text}
          deltaTone={quoteDelta.tone}
        />
        <StatCard
          icon="💰"
          iconTone="green"
          value={compactVnd(stats.revenue.current)}
          label="Doanh thu (VNĐ)"
          delta={revDelta.text}
          deltaTone={revDelta.tone}
        />
      </div>

      <Card>
        <CardHeader
          title={<>📈 Lượt xuất hiện trong tìm kiếm theo ngày</>}
          action={
            <div className="text-brand-sub text-[11.5px]">
              <span className="bg-brand-orange mr-1.5 inline-block h-2 w-2 rounded-sm" />
              Lượt tìm kiếm khớp sản phẩm của bạn
            </div>
          }
        />
        <div className="p-[18px]">
          {maxDaily === 0 ? (
            <div className="text-brand-light py-10 text-center text-xs">
              Chưa có lượt tìm kiếm nào khớp sản phẩm của bạn trong {range} ngày qua.
            </div>
          ) : (
            <div className="flex h-[160px] items-end gap-[3px] pt-2.5">
              {stats.daily.map((d, i) => (
                <div
                  key={d.day}
                  title={`${dayLabel(d.day)}: ${d.count} lượt`}
                  className="group relative flex h-full flex-1 flex-col items-center justify-end"
                >
                  <div
                    className="from-brand-orange to-brand-red relative w-full max-w-[22px] rounded-t bg-gradient-to-b transition-opacity group-hover:opacity-80"
                    style={{
                      height: d.count > 0 ? `${Math.max((d.count / maxDaily) * 100, 3)}%` : 0,
                    }}
                  >
                    <span className="text-brand-ink absolute -top-[18px] left-1/2 -translate-x-1/2 text-[9.5px] font-bold whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">
                      {d.count}
                    </span>
                  </div>
                  <div className="text-brand-light mt-1.5 h-3 text-[9.5px] whitespace-nowrap">
                    {i % labelStep === 0 ? dayLabel(d.day) : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={<>🔻 Phễu chuyển đổi RFQ</>} />
          <div className="p-[18px]">
            {funnel.received === 0 ? (
              <div className="text-brand-light py-6 text-center text-xs">
                Chưa có RFQ nào gửi tới xưởng trong {range} ngày qua.
              </div>
            ) : (
              <>
                <div className="flex items-center">
                  {funnelSteps.map((step, i) => (
                    <div key={step.label} className="flex flex-1 items-center">
                      {i > 0 && <span className="text-brand-light shrink-0 text-base">→</span>}
                      <div className="flex-1 px-2 text-center">
                        <div
                          className={`font-tight mb-2 flex h-[60px] items-center justify-center rounded-lg text-lg font-bold text-white ${step.color}`}
                        >
                          {step.value}
                        </div>
                        <div className="text-brand-sub text-[11.5px] font-semibold">
                          {step.label}
                        </div>
                        <div className="text-brand-light mt-0.5 text-[10px]">
                          {Math.round((step.value / funnel.received) * 100)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <dl className="mt-4 rounded-lg border border-[#FFD6A8] bg-[#FFF8F0] px-3.5 py-3 text-xs text-[#7A4D0E]">
                  <MarketRow
                    label="Báo giá trung bình mỗi RFQ (mức cạnh tranh)"
                    value={
                      market.avg_quotes_received === null ? '—' : String(market.avg_quotes_received)
                    }
                  />
                  <MarketRow
                    label="Thời gian bạn báo giá trung bình"
                    value={formatHours(market.my_avg_response_hours)}
                  />
                  <MarketRow
                    label="Báo giá đầu tiên tới trung bình (mọi xưởng)"
                    value={formatHours(market.avg_first_quote_hours)}
                  />
                  <MarketRow
                    label="RFQ đã chốt xưởng (bất kỳ xưởng nào)"
                    value={`${market.awarded_count}/${market.rfqs}`}
                  />
                  <MarketRow
                    label="Thời gian chốt trung bình"
                    value={formatHours(market.avg_award_hours)}
                  />
                </dl>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={<>🔍 Từ khóa tìm thấy sản phẩm của bạn</>} />
          <CardBody padded>
            {stats.keywords.length === 0 ? (
              <div className="text-brand-light py-6 text-center text-xs">
                Chưa có từ khóa nào trong {range} ngày qua.
              </div>
            ) : (
              stats.keywords.map((k) => (
                <div
                  key={k.query}
                  className="flex items-center justify-between border-b border-[#F2F0EC] py-[9px] last:border-b-0"
                >
                  <span className="text-[12.5px] font-semibold">{k.query}</span>
                  <span className="text-brand-light text-[11px]">{k.count} lượt</span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title={<>🏆 Sản phẩm xuất hiện nhiều nhất trong tìm kiếm</>} />
        <div className="p-[18px]">
          {stats.top_products.length === 0 ? (
            <div className="text-brand-light py-6 text-center text-xs">
              Chưa có sản phẩm nào xuất hiện trong kết quả tìm kiếm trong {range} ngày qua.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-brand-light border-brand-border border-b px-2.5 pb-2.5 text-left text-[10.5px] font-bold tracking-[.05em] uppercase">
                    Sản phẩm
                  </th>
                  <th className="text-brand-light border-brand-border border-b px-2.5 pb-2.5 text-left text-[10.5px] font-bold tracking-[.05em] uppercase">
                    Lượt xuất hiện
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.top_products.map((p) => (
                  <tr key={p.id} className="border-b border-[#F2F0EC] last:border-b-0">
                    <td className="px-2.5 py-[11px] text-[12.5px]">
                      <Link
                        href={`/supplier/products/${p.id}/edit`}
                        className="hover:text-brand-red flex items-center gap-[9px]"
                      >
                        <span className="bg-brand-bg flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[7px] text-[15px]">
                          🏺
                        </span>
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-2.5 py-[11px] text-[12.5px]">
                      <span className="bg-brand-bg mr-1.5 inline-block h-[5px] w-[60px] overflow-hidden rounded-sm align-middle">
                        <span
                          className="bg-brand-orange block h-full rounded-sm"
                          style={{ width: `${maxProduct ? (p.count / maxProduct) * 100 : 0}%` }}
                        />
                      </span>
                      {p.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <p className="text-brand-light mt-1 text-[11px] leading-relaxed">
        &ldquo;Lượt xuất hiện&rdquo; = số lượt tìm kiếm có ít nhất một sản phẩm đang bán của bạn
        khớp từ khóa (không tính lượt bạn tự tìm). Đây là số lần sản phẩm nằm trong kết quả, chưa
        phải lượt xem hay lượt bấm — hệ thống chưa ghi lượt xem gian hàng/sản phẩm. Mức thay đổi
        (↑/↓) so với {range} ngày liền trước. Ngày tính theo giờ Việt Nam.
      </p>
    </>
  );
}

function MarketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[3px]">
      <dt>{label}</dt>
      <dd className="font-bold whitespace-nowrap">{value}</dd>
    </div>
  );
}
