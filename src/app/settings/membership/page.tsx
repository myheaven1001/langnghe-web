import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, Card, CardBody, CardHeader } from '@/components/ui';
import { formatVnDate, formatVnd } from '@/lib/format';
import { PLAN_ICON, PLAN_LABEL } from '@/lib/constants';
import { ComingSoonButton } from './_components/ComingSoonButton';

export const metadata: Metadata = {
  title: 'Membership & Credit — LàngNghề.vn',
};

// Credit không phải RFQ hạn mức — không có bảng "credit package" trong
// schema (mua credit là việc của Giai đoạn 9), nên đây là bảng giá tĩnh ở
// tầng UI, không phải dữ liệu đọc từ DB như phần còn lại của trang.
const CREDIT_PACKS = [
  { credits: 5, priceVnd: 100_000 },
  { credits: 10, priceVnd: 180_000, badge: 'Tiết kiệm 10%' },
  { credits: 20, priceVnd: 320_000, badge: 'Tiết kiệm 20%' },
];

const REASON_META: Record<string, { icon: string; bg: string }> = {
  purchase: { icon: '💳', bg: 'bg-status-green-soft' },
  consume: { icon: '➖', bg: 'bg-status-amber-soft' },
  refund: { icon: '↩️', bg: 'bg-status-blue-soft' },
  bonus: { icon: '🎁', bg: 'bg-status-purple-soft' },
};

interface PlanRow {
  id: string;
  name: string;
  price_vnd: number;
  billing_cycle: string;
}

interface FeatureRow {
  plan_id: string;
  feature_key: string;
  feature_value: string;
}

interface LedgerRow {
  id: string;
  change_amount: number;
  balance_after: number;
  reason: string;
  order_ref: string | null;
  created_at: string;
  rfq_requests: { title: string } | null;
}

function featureValue(features: FeatureRow[], planId: string, key: string) {
  return features.find((f) => f.plan_id === planId && f.feature_key === key)?.feature_value ?? null;
}

function reasonLabel(tx: LedgerRow) {
  const rfqTitle = tx.rfq_requests?.title;
  switch (tx.reason) {
    case 'purchase':
      return `Mua ${tx.change_amount} credit${tx.order_ref ? ` — mã đơn ${tx.order_ref}` : ''}`;
    case 'consume':
      return `Dùng credit cho RFQ${rfqTitle ? ` "${rfqTitle}"` : ''}`;
    case 'refund':
      return `Hoàn credit${rfqTitle ? ` — RFQ "${rfqTitle}"` : ''}`;
    case 'bonus':
      return 'Credit thưởng';
    default:
      return tx.reason;
  }
}

export default async function MembershipPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: buyer } = await supabase
    .from('buyer_profiles')
    .select('id, company_name, quota_used_this_month, quota_reset_at, credit_balance, created_at')
    .eq('user_id', user.id)
    .single();

  if (!buyer) redirect('/');

  const [
    { data: membership },
    { data: plansData },
    { data: featuresData },
    { data: ledgerData },
    { data: unreadCount },
    { count: activeRfqCount },
  ] = await Promise.all([
    supabase
      .from('user_memberships')
      .select('started_at, expires_at, membership_plans(id, name, price_vnd, billing_cycle)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('membership_plans').select('id, name, price_vnd, billing_cycle').eq('is_active', true).order('price_vnd'),
    supabase.from('membership_features').select('plan_id, feature_key, feature_value'),
    supabase
      .from('rfq_credit_ledger')
      .select('id, change_amount, balance_after, reason, order_ref, created_at, rfq_requests(title)')
      .eq('buyer_id', buyer.id)
      .order('created_at', { ascending: false })
      .limit(20),
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

  const plans = (plansData ?? []) as PlanRow[];
  const features = (featuresData ?? []) as FeatureRow[];
  const ledger = (ledgerData ?? []) as unknown as LedgerRow[];

  const currentPlan =
    (membership?.membership_plans as unknown as PlanRow | null) ?? plans.find((p) => p.name === 'free') ?? null;
  const currentMonthlyQuotaRaw = currentPlan ? featureValue(features, currentPlan.id, 'rfq_monthly_quota') : null;
  const currentMonthlyQuota = currentMonthlyQuotaRaw === 'unlimited' ? null : Number(currentMonthlyQuotaRaw ?? 0);
  const currentMultiAllowed = currentPlan
    ? featureValue(features, currentPlan.id, 'multi_rfq_allowed') === 'true'
    : false;

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
            { icon: '📋', label: 'RFQ của tôi', href: '/rfq', count: activeRfqCount || undefined },
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
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Membership & credit</span>
      </div>

      <div className="mb-[18px]">
        <div className="text-xl font-bold">Membership & Credit</div>
        <div className="text-brand-sub mt-1 text-[12.5px]">
          Quản lý gói thành viên và số credit RFQ của bạn.
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_280px]">
        {/* LEFT */}
        <div>
          <Card>
            <CardHeader title={<>📦 Gói hiện tại</>} />
            <CardBody padded>
              <div className="flex flex-wrap items-center gap-4">
                <div className="bg-brand-bg shrink-0 rounded-[10px] px-4.5 py-3 text-center">
                  <div className="text-2xl">{PLAN_ICON[currentPlan?.name ?? 'free']}</div>
                  <div className="mt-0.5 text-[15px] font-bold">
                    {PLAN_LABEL[currentPlan?.name ?? 'free'] ?? currentPlan?.name}
                  </div>
                </div>
                <div className="min-w-[200px] flex-1">
                  <div className="flex max-w-[360px] justify-between py-1 text-xs">
                    <span className="text-brand-sub">RFQ mỗi tháng</span>
                    <span className="font-semibold">
                      {currentMonthlyQuota === null
                        ? 'Không giới hạn'
                        : `${buyer.quota_used_this_month} / ${currentMonthlyQuota} đã dùng`}
                    </span>
                  </div>
                  <div className="flex max-w-[360px] justify-between py-1 text-xs">
                    <span className="text-brand-sub">Multi-RFQ</span>
                    <span className={`font-semibold ${!currentMultiAllowed ? 'text-brand-light' : ''}`}>
                      {currentMultiAllowed ? 'Hỗ trợ' : 'Không hỗ trợ'}
                    </span>
                  </div>
                  <div className="flex max-w-[360px] justify-between py-1 text-xs">
                    <span className="text-brand-sub">Reset hạn mức</span>
                    <span className="font-semibold">
                      {buyer.quota_reset_at ? formatVnDate(buyer.quota_reset_at) : '—'}
                    </span>
                  </div>
                  <div className="flex max-w-[360px] justify-between py-1 text-xs">
                    <span className="text-brand-sub">Ngày bắt đầu</span>
                    <span className="font-semibold">{formatVnDate(buyer.created_at)} (đăng ký)</span>
                  </div>
                </div>
                <a
                  href="#pricing"
                  className="bg-brand-forest hover:bg-brand-forest-dark shrink-0 rounded-lg px-5 py-2.5 text-[13px] font-semibold whitespace-nowrap text-white"
                >
                  ⬆️ Nâng cấp gói
                </a>
              </div>
            </CardBody>
          </Card>

          <Card className="scroll-mt-4">
            <div id="pricing" />
            <CardHeader title={<>🔄 So sánh & nâng cấp gói</>} />
            <CardBody padded>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                {plans.map((plan) => {
                  const isCurrent = plan.id === currentPlan?.id;
                  const monthlyQuotaRaw = featureValue(features, plan.id, 'rfq_monthly_quota');
                  const monthlyQuota = monthlyQuotaRaw === 'unlimited' ? null : Number(monthlyQuotaRaw ?? 0);
                  const multiAllowed = featureValue(features, plan.id, 'multi_rfq_allowed') === 'true';
                  const maxSuppliers = Number(featureValue(features, plan.id, 'max_suppliers_per_rfq') ?? 1);
                  const monthlyEquivalent = plan.price_vnd > 0 ? Math.round(plan.price_vnd / 12) : 0;
                  const isBasic = plan.name === 'basic';

                  return (
                    <div
                      key={plan.id}
                      className={`relative rounded-xl border-[1.5px] p-4 ${
                        isCurrent
                          ? 'border-brand-green bg-[#F7FDFA]'
                          : isBasic
                            ? 'border-brand-red'
                            : 'border-brand-border'
                      }`}
                    >
                      {(isCurrent || isBasic) && (
                        <div
                          className={`absolute top-0 right-3.5 -translate-y-full rounded-b-md px-2.5 py-1 text-[10px] font-bold text-white ${
                            isCurrent ? 'bg-brand-green' : 'bg-brand-red'
                          }`}
                        >
                          {isCurrent ? 'Đang dùng' : 'Phổ biến'}
                        </div>
                      )}
                      <div className="mb-1.5 text-sm font-bold">
                        {PLAN_ICON[plan.name] ?? '📦'} {PLAN_LABEL[plan.name] ?? plan.name}
                      </div>
                      <div className="font-tight text-[22px] font-bold">
                        {plan.price_vnd === 0 ? '0đ' : formatVnd(monthlyEquivalent)}
                        {plan.price_vnd > 0 && <span className="text-brand-light text-[11px] font-normal">/tháng</span>}
                      </div>
                      <div className="text-brand-light mb-4 text-[11px]">
                        {plan.price_vnd === 0
                          ? 'mãi mãi'
                          : `${formatVnd(plan.price_vnd)} thanh toán ${plan.billing_cycle === 'yearly' ? 'theo năm' : 'theo tháng'}`}
                      </div>

                      <div className="text-brand-sub mb-2 flex items-start gap-1.5 text-xs leading-relaxed">
                        <span className="shrink-0">✓</span>
                        <span>{monthlyQuota === null ? 'RFQ không giới hạn' : `${monthlyQuota} RFQ / tháng`}</span>
                      </div>
                      {multiAllowed ? (
                        <div className="text-brand-sub mb-2 flex items-start gap-1.5 text-xs leading-relaxed">
                          <span className="shrink-0">✓</span>
                          <span>Multi-RFQ — tối đa {maxSuppliers} xưởng/RFQ</span>
                        </div>
                      ) : (
                        <>
                          <div className="text-brand-light mb-2 flex items-start gap-1.5 text-xs leading-relaxed">
                            <span className="shrink-0">✕</span>
                            <span>Multi-RFQ (nhiều xưởng)</span>
                          </div>
                          <div className="text-brand-sub mb-2 flex items-start gap-1.5 text-xs leading-relaxed">
                            <span className="shrink-0">✓</span>
                            <span>Tối đa {maxSuppliers} xưởng / RFQ</span>
                          </div>
                        </>
                      )}

                      {isCurrent ? (
                        <button
                          type="button"
                          disabled
                          className="bg-status-green-soft text-status-green mt-3 w-full cursor-default rounded-lg py-2.5 text-xs font-semibold"
                        >
                          Gói hiện tại
                        </button>
                      ) : (
                        <ComingSoonButton
                          className={`mt-3 w-full rounded-lg py-2.5 text-xs font-semibold ${
                            isBasic
                              ? 'bg-brand-red hover:bg-brand-red-dark text-white'
                              : 'border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink border-[1.5px]'
                          }`}
                        >
                          Nâng cấp lên {PLAN_LABEL[plan.name] ?? plan.name}
                        </ComingSoonButton>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<>🎟️ RFQ Credit</>} />
            <CardBody padded>
              <div className="bg-brand-bg mb-4 flex items-center gap-4 rounded-[10px] p-4">
                <div>
                  <div className="font-tight text-[30px] font-bold">{buyer.credit_balance}</div>
                  <div className="text-brand-sub text-[11.5px]">credit còn lại</div>
                </div>
                <div className="text-brand-sub flex-1 text-[11.5px] leading-relaxed">
                  Dùng credit để gửi thêm RFQ khi đã hết hạn mức tháng — mỗi credit tương ứng 1
                  RFQ. Credit không hết hạn và có thể tích lũy.
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {CREDIT_PACKS.map((pack) => (
                  <div
                    key={pack.credits}
                    className={`relative rounded-[10px] border-[1.5px] p-3.5 text-center ${
                      pack.badge ? 'border-brand-orange' : 'border-brand-border'
                    }`}
                  >
                    {pack.badge && (
                      <div className="bg-brand-orange absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[9.5px] font-bold whitespace-nowrap text-white">
                        {pack.badge}
                      </div>
                    )}
                    <div className="font-tight text-xl font-bold">{pack.credits}</div>
                    <div className="text-brand-light mb-2 text-[11px]">credit</div>
                    <div className="text-brand-red text-sm font-bold">{formatVnd(pack.priceVnd)}</div>
                    <div className="text-brand-light mt-0.5 text-[10.5px]">
                      {formatVnd(Math.round(pack.priceVnd / pack.credits))} / credit
                    </div>
                    <ComingSoonButton className="border-brand-border text-brand-sub hover:border-brand-red hover:text-brand-red mt-2.5 w-full rounded-md border-[1.5px] bg-white py-2 text-[11.5px] font-semibold">
                      Mua ngay
                    </ComingSoonButton>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<>🧾 Lịch sử giao dịch</>} />
            <CardBody>
              {ledger.length === 0 ? (
                <div className="text-brand-light px-[18px] py-8 text-center text-xs">
                  Chưa có giao dịch credit nào.
                </div>
              ) : (
                ledger.map((tx) => {
                  const meta = REASON_META[tx.reason] ?? { icon: '•', bg: 'bg-brand-bg' };
                  const positive = tx.change_amount > 0;
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 border-b border-[#F2F0EC] px-[18px] py-[11px] last:border-b-0"
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${meta.bg}`}>
                        {meta.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-semibold">{reasonLabel(tx)}</div>
                        <div className="text-brand-light mt-0.5 text-[10.5px]">
                          {formatVnDate(tx.created_at)} —{' '}
                          {new Date(tx.created_at).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-sm font-bold ${positive ? 'text-brand-green' : 'text-brand-red'}`}>
                          {positive ? '+' : ''}
                          {tx.change_amount}
                        </div>
                        <div className="text-brand-light mt-0.5 text-[10.5px]">còn {tx.balance_after}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>
        </div>

        {/* RIGHT RAIL */}
        <div>
          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Thanh toán
            </div>
            <div className="flex justify-between border-b border-[#F2F0EC] py-[7px] text-xs">
              <span className="text-brand-sub">Gói hiện tại</span>
              <span className="text-brand-ink text-right font-semibold">
                {PLAN_LABEL[currentPlan?.name ?? 'free'] ?? currentPlan?.name}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#F2F0EC] py-[7px] text-xs">
              <span className="text-brand-sub">Chu kỳ thanh toán</span>
              <span className="text-brand-ink text-right font-semibold">
                {!currentPlan || currentPlan.price_vnd === 0
                  ? '—'
                  : currentPlan.billing_cycle === 'yearly'
                    ? 'Theo năm'
                    : 'Theo tháng'}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#F2F0EC] py-[7px] text-xs">
              <span className="text-brand-sub">Lần thanh toán tới</span>
              <span className="text-brand-ink text-right font-semibold">
                {membership?.expires_at ? formatVnDate(membership.expires_at) : 'Không áp dụng'}
              </span>
            </div>
            <div className="flex justify-between py-[7px] text-xs">
              <span className="text-brand-sub">Phương thức</span>
              <span className="text-brand-ink text-right font-semibold">Chưa thiết lập</span>
            </div>
          </div>

          <div className="border-brand-border rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              ❓ Câu hỏi thường gặp
            </div>
            {[
              [
                'Credit khác gì với hạn mức RFQ?',
                'Hạn mức reset mỗi tháng theo gói. Credit là mua thêm, dùng khi hết hạn mức và không bao giờ hết hạn.',
              ],
              [
                'Vì sao chưa nâng cấp/mua credit được ngay?',
                'Trang này đang hiển thị đúng dữ liệu gói & credit thật của bạn — cổng thanh toán online sẽ nối ở giai đoạn tiếp theo.',
              ],
            ].map(([q, a]) => (
              <div key={q} className="mb-3 last:mb-0">
                <div className="mb-0.5 text-xs font-semibold">{q}</div>
                <div className="text-brand-sub text-[11.5px] leading-relaxed">{a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
