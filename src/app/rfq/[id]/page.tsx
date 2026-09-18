import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, Card, CardBody, CardHeader, StatusPill } from '@/components/ui';
import { daysUntil, effectiveDeadline, formatVnDate, formatVnd } from '@/lib/rfq';
import { AcceptQuoteButton } from './_components/AcceptQuoteButton';
import { CancelRfqButton } from './_components/CancelRfqButton';

export const metadata: Metadata = {
  title: 'Chi tiết RFQ — LàngNghề.vn',
};

const RFQ_TYPE_LABEL: Record<string, string> = {
  single: 'RFQ đơn',
  multi: 'Multi-RFQ',
};

const ACTIVE_QUOTE_STATUSES = ['pending', 'counter_offered'];
const SETTLED_RFQ_STATUSES = ['awarded', 'closed', 'expired', 'cancelled'];
const CANCELABLE_RFQ_STATUSES = ['published', 'quoted', 'negotiating'];

interface RfqDetail {
  id: string;
  title: string;
  requirements: string | null;
  quantity: number;
  unit: string | null;
  budget_min: number | null;
  budget_max: number | null;
  deadline_days: number | null;
  rfq_type: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  categories: { name: string } | null;
}

interface QuoteRow {
  id: string;
  supplier_id: string;
  unit_price: number;
  min_qty: number | null;
  lead_time_days: number | null;
  note: string | null;
  valid_until: string | null;
  status: string;
  created_at: string;
  supplier_profiles: {
    shop_name: string;
    village_origin: string | null;
    craft_category: string | null;
    rating_avg: number | null;
  } | null;
}

interface TargetRow {
  supplier_id: string;
  supplier_profiles: { shop_name: string; village_origin: string | null } | null;
}

type StepState = 'done' | 'active' | 'pending';
interface Step {
  label: string;
  time?: string;
  state: StepState;
}

// Trạng thái RFQ (rfq_requests.status) là nguồn sự thật duy nhất cho
// stepper — không suy luận ngược từ quote data, tránh lệch nếu sau này có
// đường đi khác tới cùng 1 status (vd. admin tự đóng RFQ).
function buildSteps(rfq: Pick<RfqDetail, 'status' | 'created_at'>, respondedCount: number): Step[] {
  const sentStep: Step = { label: 'Đã gửi yêu cầu', time: formatVnDate(rfq.created_at), state: 'done' };
  const hasQuotes = respondedCount > 0;

  if (rfq.status === 'cancelled') {
    return [sentStep, { label: 'Đã hủy yêu cầu', state: 'done' }];
  }
  if (rfq.status === 'expired') {
    return [
      sentStep,
      {
        label: hasQuotes ? `${respondedCount} xưởng đã phản hồi` : 'Không có xưởng phản hồi',
        state: 'done',
      },
      { label: 'Đã hết hạn', state: 'done' },
    ];
  }

  const isAwarded = rfq.status === 'awarded' || rfq.status === 'closed';
  const isSettled = SETTLED_RFQ_STATUSES.includes(rfq.status);

  return [
    sentStep,
    {
      label: 'Nhận báo giá',
      time: hasQuotes ? `${respondedCount} xưởng đã phản hồi` : undefined,
      state: hasQuotes ? 'done' : 'active',
    },
    {
      label: 'Đang đàm phán',
      time: !isSettled && hasQuotes ? 'Chọn báo giá phù hợp' : undefined,
      state: isSettled ? 'done' : hasQuotes ? 'active' : 'pending',
    },
    { label: 'Chốt xưởng', state: isAwarded ? 'done' : 'pending' },
    { label: 'Tạo đơn hàng', state: isAwarded ? 'done' : 'pending' },
  ];
}

export default async function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: rfqData } = await supabase
    .from('rfq_requests')
    .select(
      'id, title, requirements, quantity, unit, budget_min, budget_max, deadline_days, rfq_type, status, expires_at, created_at, categories(name)',
    )
    .eq('id', id)
    .eq('buyer_id', buyer.id)
    .maybeSingle();

  // Không tồn tại HOẶC không phải RFQ của buyer này (RLS đã chặn từ tầng
  // DB) — cả 2 trường hợp trả về 404 như nhau, không tiết lộ RFQ nào tồn
  // tại của người khác.
  if (!rfqData) notFound();
  const rfq = rfqData as unknown as RfqDetail;

  const [{ data: quotesData }, { data: targetsData }, { data: unreadCount }, { count: activeRfqCount }] =
    await Promise.all([
      supabase
        .from('rfq_quotes')
        .select(
          'id, supplier_id, unit_price, min_qty, lead_time_days, note, valid_until, status, created_at, supplier_profiles(shop_name, village_origin, craft_category, rating_avg)',
        )
        .eq('rfq_id', id)
        .order('unit_price', { ascending: true }),
      supabase
        .from('rfq_targets')
        .select('supplier_id, supplier_profiles(shop_name, village_origin)')
        .eq('rfq_id', id),
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
    ]);

  const quotes = (quotesData ?? []) as unknown as QuoteRow[];
  const targets = (targetsData ?? []) as unknown as TargetRow[];
  const pendingTargets = targets.filter((t) => !quotes.some((q) => q.supplier_id === t.supplier_id));
  const targetCount = targets.length || quotes.length || 1;

  const supplierIds = quotes.map((q) => q.supplier_id);
  const { data: verifiedRows } = supplierIds.length
    ? await supabase
        .from('verifications')
        .select('entity_id')
        .eq('entity_type', 'supplier')
        .eq('status', 'approved')
        .in('entity_id', supplierIds)
    : { data: [] as { entity_id: string }[] };
  const verifiedSupplierIds = new Set((verifiedRows ?? []).map((v) => v.entity_id));

  const activeQuotes = quotes.filter(
    (q) => ACTIVE_QUOTE_STATUSES.includes(q.status) || q.status === 'accepted',
  );
  const bestPrice = activeQuotes.length ? Math.min(...activeQuotes.map((q) => q.unit_price)) : null;
  const fastestLeadTime = activeQuotes.reduce<number | null>((min, q) => {
    if (q.lead_time_days == null) return min;
    return min == null ? q.lead_time_days : Math.min(min, q.lead_time_days);
  }, null);

  const acceptedQuote = quotes.find((q) => q.status === 'accepted') ?? null;
  const isSettled = SETTLED_RFQ_STATUSES.includes(rfq.status);
  const canCancel = CANCELABLE_RFQ_STATUSES.includes(rfq.status);

  const deadline = effectiveDeadline(rfq);
  const remaining = deadline ? daysUntil(deadline) : null;
  const steps = buildSteps(rfq, quotes.length);

  const budgetLabel =
    rfq.budget_min != null && rfq.budget_max != null
      ? `${rfq.budget_min.toLocaleString('vi-VN')}–${rfq.budget_max.toLocaleString('vi-VN')}đ`
      : rfq.budget_min != null
        ? `Từ ${formatVnd(rfq.budget_min)}`
        : rfq.budget_max != null
          ? `Đến ${formatVnd(rfq.budget_max)}`
          : 'Chưa có ngân sách cụ thể';

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
            {
              icon: '📋',
              label: 'RFQ của tôi',
              href: '/rfq',
              count: activeRfqCount || undefined,
            },
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
            { icon: '💳', label: 'Membership & credit', href: '/settings/membership' },
            { icon: '⚙️', label: 'Cài đặt thông báo', href: '/settings/notifications' },
          ],
        },
      ]}
    >
      <div className="text-brand-light mb-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
        <Link href="/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/rfq" className="text-brand-sub hover:text-brand-red">
          RFQ của tôi
        </Link>
        <span>/</span>
        <span className="truncate">{rfq.title}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-[19px] font-bold">{rfq.title}</div>
            {rfq.rfq_type === 'multi' && (
              <span className="rounded-[5px] bg-[#F1EEFF] px-2 py-0.5 text-[10px] font-semibold text-[#5B4CDB]">
                Multi-RFQ
              </span>
            )}
            <StatusPill domain="rfq" status={rfq.status} />
          </div>
          <div className="text-brand-sub mt-1.5 flex flex-wrap gap-3.5 text-xs">
            <span>
              Mã RFQ: <b className="text-brand-ink">#{rfq.id.slice(0, 8).toUpperCase()}</b>
            </span>
            <span>
              Gửi: <b className="text-brand-ink">{formatVnDate(rfq.created_at)}</b>
            </span>
            <span>
              Hạn chót:{' '}
              <b className={remaining !== null && remaining <= 2 ? 'text-brand-red' : 'text-brand-ink'}>
                {deadline
                  ? remaining !== null && remaining <= 0
                    ? `hết hạn (${formatVnDate(deadline)})`
                    : `còn ${remaining} ngày (${formatVnDate(deadline)})`
                  : '—'}
              </b>
            </span>
            <span>
              Gửi tới: <b className="text-brand-ink">{targetCount} xưởng</b>
            </span>
          </div>
        </div>
        {canCancel && (
          <div className="flex shrink-0 gap-2">
            <CancelRfqButton rfqId={rfq.id} />
          </div>
        )}
      </div>

      {rfq.status === 'awarded' && acceptedQuote && (
        <div className="border-status-green-soft bg-status-green-soft mb-4 flex items-center gap-3 rounded-[10px] border p-3.5">
          <div className="text-[22px]">🎉</div>
          <div className="text-status-green flex-1 text-[12.5px] leading-relaxed">
            <strong className="mb-0.5 block text-[13.5px]">
              Đã chốt xưởng: {acceptedQuote.supplier_profiles?.shop_name ?? 'Xưởng đã chọn'}
            </strong>
            Đơn hàng đã được tạo — thanh toán để xưởng bắt đầu sản xuất.
          </div>
          <Link
            href="/orders"
            className="bg-brand-forest hover:bg-brand-forest-dark shrink-0 rounded-md px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-white"
          >
            Xem đơn hàng →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_280px]">
        {/* LEFT */}
        <div>
          <Card>
            <CardHeader title={<>📄 Chi tiết yêu cầu</>} />
            <CardBody padded>
              <div className="text-brand-sub mb-3.5 text-[12.5px] leading-relaxed">
                {rfq.requirements || 'Không có mô tả chi tiết.'}
              </div>
              <div className="mb-1 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="bg-brand-bg rounded-lg px-3 py-2.5">
                  <div className="text-brand-light mb-0.5 text-[10.5px]">Số lượng</div>
                  <div className="text-[13px] font-bold">
                    {rfq.quantity.toLocaleString('vi-VN')} {rfq.unit ?? ''}
                  </div>
                </div>
                <div className="bg-brand-bg rounded-lg px-3 py-2.5">
                  <div className="text-brand-light mb-0.5 text-[10.5px]">Ngân sách dự kiến</div>
                  <div className="text-[13px] font-bold">{budgetLabel}</div>
                </div>
                <div className="bg-brand-bg rounded-lg px-3 py-2.5">
                  <div className="text-brand-light mb-0.5 text-[10.5px]">Ngành hàng</div>
                  <div className="text-[13px] font-bold">{rfq.categories?.name ?? 'Chưa phân loại'}</div>
                </div>
                <div className="bg-brand-bg rounded-lg px-3 py-2.5">
                  <div className="text-brand-light mb-0.5 text-[10.5px]">Thời hạn báo giá</div>
                  <div className="text-[13px] font-bold">
                    {rfq.deadline_days != null ? `${rfq.deadline_days} ngày` : 'Không giới hạn'}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={<>💰 So sánh báo giá</>}
              action={
                <span className="text-brand-sub text-[11.5px]">
                  {quotes.length}/{targetCount} xưởng đã phản hồi
                </span>
              }
            />
            {bestPrice !== null && (
              <div className="text-brand-sub px-[18px] pb-3 text-[11.5px]">
                Giá thấp nhất <strong className="text-brand-ink">{formatVnd(bestPrice)}</strong>
                {fastestLeadTime !== null && (
                  <>
                    {' '}
                    · thời gian sản xuất nhanh nhất{' '}
                    <strong className="text-brand-ink">{fastestLeadTime} ngày</strong>
                  </>
                )}
              </div>
            )}

            {quotes.length === 0 && pendingTargets.length === 0 && (
              <div className="text-brand-light px-[18px] py-8 text-center text-xs">
                Chưa có xưởng nào được mời cho yêu cầu này.
              </div>
            )}

            <div className="flex flex-col gap-3.5 px-[18px] pb-[18px]">
              {quotes.map((quote) => {
                const isBest = bestPrice !== null && quote.unit_price === bestPrice && quote.status !== 'rejected';
                const isVerified = verifiedSupplierIds.has(quote.supplier_id);
                const canAccept = !isSettled && ACTIVE_QUOTE_STATUSES.includes(quote.status);
                const totalValue = quote.unit_price * rfq.quantity;

                return (
                  <div
                    key={quote.id}
                    className={`rounded-[10px] border-[1.5px] p-3.5 px-4 ${
                      quote.status === 'accepted' || (isBest && quote.status !== 'rejected')
                        ? 'border-brand-green bg-[#F7FDFA]'
                        : 'border-brand-border'
                    } ${quote.status === 'rejected' ? 'opacity-55' : ''}`}
                  >
                    <div className="mb-2.5 flex items-center gap-3">
                      <div className="bg-brand-bg flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg text-base">
                        🏭
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold">
                          {quote.supplier_profiles?.shop_name ?? 'Xưởng'}
                          {isVerified && (
                            <span className="bg-status-green-soft text-status-green rounded-full px-1.5 py-px text-[9px] font-bold">
                              ✓ Đã xác minh
                            </span>
                          )}
                          {isBest && quote.status !== 'rejected' && (
                            <span className="bg-brand-green rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white">
                              💰 Giá tốt nhất
                            </span>
                          )}
                        </div>
                        <div className="text-brand-light mt-0.5 text-[11px]">
                          {quote.supplier_profiles?.village_origin ?? 'Chưa rõ làng nghề'}
                          {quote.supplier_profiles?.rating_avg
                            ? ` · ${quote.supplier_profiles.rating_avg.toFixed(1)}★`
                            : ''}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-tight text-lg font-bold">{formatVnd(quote.unit_price)}</div>
                        <div className="text-brand-light text-[10.5px]">/ {rfq.unit ?? 'đơn vị'}</div>
                      </div>
                    </div>

                    <div className="mb-2.5 flex flex-wrap gap-4 border-y border-[#F2F0EC] py-2.5">
                      <div className="text-brand-sub text-[11.5px]">
                        Số lượng tối thiểu
                        <b className="text-brand-ink block text-[12.5px]">
                          {quote.min_qty ? `${quote.min_qty.toLocaleString('vi-VN')} ${rfq.unit ?? ''}` : '—'}
                        </b>
                      </div>
                      <div className="text-brand-sub text-[11.5px]">
                        Thời gian sản xuất
                        <b className="text-brand-ink block text-[12.5px]">
                          {quote.lead_time_days != null ? `${quote.lead_time_days} ngày` : '—'}
                        </b>
                      </div>
                      <div className="text-brand-sub text-[11.5px]">
                        Hiệu lực đến
                        <b className="text-brand-ink block text-[12.5px]">
                          {quote.valid_until ? formatVnDate(quote.valid_until) : '—'}
                        </b>
                      </div>
                      <div className="text-brand-sub text-[11.5px]">
                        Tổng giá trị
                        <b className="text-brand-ink block text-[12.5px]">{formatVnd(totalValue)}</b>
                      </div>
                    </div>

                    {quote.note && (
                      <div className="bg-brand-bg text-brand-sub mb-2.5 rounded-lg px-2.5 py-2 text-xs leading-relaxed">
                        &ldquo;{quote.note}&rdquo;
                      </div>
                    )}

                    {quote.status === 'accepted' ? (
                      <div className="text-status-green flex items-center gap-1.5 text-[12.5px] font-bold">
                        ✅ Đã chấp nhận báo giá này
                      </div>
                    ) : quote.status === 'rejected' ? (
                      <div className="text-brand-light text-xs font-semibold">
                        {isSettled ? 'Đã tự động đóng' : 'Đã từ chối'}
                      </div>
                    ) : !canAccept ? (
                      <div className="text-brand-light text-xs font-semibold">RFQ đã đóng</div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <AcceptQuoteButton
                          quoteId={quote.id}
                          supplierName={quote.supplier_profiles?.shop_name ?? 'xưởng này'}
                        />
                        <Link
                          href="/messages"
                          className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink rounded-md border-[1.5px] px-3.5 py-2 text-xs font-semibold"
                        >
                          💬 Nhắn tin
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}

              {pendingTargets.map((target) => (
                <div
                  key={target.supplier_id}
                  className="border-brand-border flex items-center gap-3 rounded-[10px] border-[1.5px] border-dashed p-3.5 px-4"
                >
                  <div className="bg-brand-bg flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg text-base opacity-60">
                    🏭
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-brand-sub text-[13px] font-bold">
                      {target.supplier_profiles?.shop_name ?? 'Xưởng'}
                    </div>
                    <div className="text-brand-light mt-0.5 text-[11px]">
                      Chưa gửi báo giá
                      {deadline ? ` · còn ${remaining !== null && remaining > 0 ? remaining : 0} ngày để phản hồi` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT RAIL */}
        <div>
          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Trạng thái RFQ
            </div>
            <div className="flex flex-col">
              {steps.map((step, i) => (
                <div key={step.label} className="relative flex gap-2.5 pb-5 last:pb-0">
                  {i < steps.length - 1 && (
                    <div className="bg-brand-border absolute top-[22px] left-[10px] bottom-0 w-[1.5px]" />
                  )}
                  <div
                    className={`z-10 flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full border-2 text-[10px] ${
                      step.state === 'done'
                        ? 'bg-brand-green border-brand-green text-white'
                        : step.state === 'active'
                          ? 'bg-brand-red border-brand-red text-white'
                          : 'border-brand-border text-brand-light bg-white'
                    }`}
                  >
                    {step.state === 'done' ? '✓' : step.state === 'active' ? '●' : i + 1}
                  </div>
                  <div>
                    <div
                      className={`pt-px text-xs font-semibold ${
                        step.state === 'pending' ? 'text-brand-light' : 'text-brand-ink'
                      }`}
                    >
                      {step.label}
                    </div>
                    {step.time && (
                      <div className="text-brand-light mt-0.5 text-[10.5px]">{step.time}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Thông tin yêu cầu
            </div>
            {[
              ['Mã RFQ', `#${rfq.id.slice(0, 8).toUpperCase()}`],
              ['Loại', `${RFQ_TYPE_LABEL[rfq.rfq_type] ?? rfq.rfq_type} (${targetCount} xưởng)`],
              ['Ngày gửi', formatVnDate(rfq.created_at)],
              ['Hạn chót', deadline ? formatVnDate(deadline) : '—'],
              ['Ngân sách', budgetLabel],
              ['Báo giá nhận', `${quotes.length}/${targetCount} xưởng`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between border-b border-[#F2F0EC] py-[7px] text-xs last:border-b-0"
              >
                <span className="text-brand-sub">{label}</span>
                <span className="text-brand-ink text-right font-semibold">{value}</span>
              </div>
            ))}
          </div>

          <div className="border-brand-border rounded-[10px] border bg-white p-4 text-center">
            <div className="mb-2 text-2xl">🙋</div>
            <div className="text-brand-sub mb-2.5 text-[11.5px] leading-relaxed">
              Cần hỗ trợ đàm phán hoặc so sánh báo giá?
            </div>
            <button
              type="button"
              className="border-brand-border text-brand-sub w-full rounded-lg border-[1.5px] py-2.5 text-xs font-semibold"
            >
              💬 Liên hệ đội hỗ trợ
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
