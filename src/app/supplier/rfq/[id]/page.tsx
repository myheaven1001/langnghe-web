import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  AppShell,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Pill,
  StatusPill,
} from '@/components/ui';
import { daysUntil, formatVnd, formatVnDateTime, hoursUntil } from '@/lib/format';
import { RFQ_OPEN_STATUSES, SUPPLIER_QUOTE_STATUS, type SupplierQuote } from '@/lib/quotes';
import { effectiveDeadline } from '@/lib/rfq';
import { buildSupplierNavGroups } from '../../_lib/nav';
import { getNewRfqCount, getUnreadNotificationCount } from '../../_lib/counts';
import { QuoteForm } from '../_components/QuoteForm';

export const metadata: Metadata = {
  title: 'Chi tiết RFQ — LàngNghề.vn',
};

interface RfqDetail {
  id: string;
  title: string;
  requirements: string | null;
  quantity: number;
  unit: string | null;
  budget_min: number | null;
  budget_max: number | null;
  rfq_type: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  deadline_days: number | null;
  buyer_profiles: { id: string; company_name: string; city: string | null } | null;
  categories: { name: string } | null;
}

function budgetLabel(min: number | null, max: number | null) {
  if (min != null && max != null) return `${formatVnd(min)} – ${formatVnd(max)}`;
  if (min != null) return `Từ ${formatVnd(min)}`;
  if (max != null) return `Đến ${formatVnd(max)}`;
  return 'Buyer chưa nêu';
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#F2F0EC] py-2 text-[13px] last:border-b-0">
      <span className="text-brand-sub shrink-0">{label}</span>
      <span className="text-brand-ink text-right font-semibold break-words">{value}</span>
    </div>
  );
}

// Trang RFQ phía xưởng (kế hoạch 4.6): xem đủ yêu cầu của buyer và gửi / sửa
// / rút báo giá ngay tại đây. RLS rfq_requests_supplier_view quyết định xưởng
// có được thấy RFQ này không — không thấy thì 404.
export default async function SupplierRfqDetailPage({
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

  const { data: supplier } = await supabase
    .from('supplier_profiles')
    .select('id, shop_name')
    .eq('user_id', user.id)
    .single();

  if (!supplier) redirect('/');

  const { data: rfqData } = await supabase
    .from('rfq_requests')
    .select(
      'id, title, requirements, quantity, unit, budget_min, budget_max, rfq_type, status, created_at, expires_at, deadline_days, buyer_profiles(id, company_name, city), categories(name)',
    )
    .eq('id', id)
    .maybeSingle();

  if (!rfqData) notFound();
  const rfq = rfqData as unknown as RfqDetail;

  const [newRfqCount, unreadCount, { data: quotesData }, { data: buyerVerified }] =
    await Promise.all([
      getNewRfqCount(supabase, supplier.id),
      getUnreadNotificationCount(supabase, user.id),
      supabase
        .from('rfq_quotes')
        .select(
          'id, rfq_id, unit_price, min_qty, lead_time_days, note, valid_until, status, created_at, updated_at',
        )
        .eq('rfq_id', id)
        .eq('supplier_id', supplier.id)
        .order('created_at', { ascending: false }),
      rfq.buyer_profiles
        ? supabase
            .from('verifications')
            .select('id')
            .eq('entity_type', 'buyer')
            .eq('entity_id', rfq.buyer_profiles.id)
            .eq('status', 'approved')
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const quotes = (quotesData ?? []) as SupplierQuote[];
  // Báo giá "hiện tại": bản mới nhất chưa rút / chưa bị từ chối.
  const current = quotes.find((q) => q.status !== 'withdrawn' && q.status !== 'rejected') ?? null;
  const pending = current?.status === 'pending' ? current : null;
  const accepted = current?.status === 'accepted' ? current : null;
  const history = quotes.filter((q) => q.id !== current?.id);

  const { data: order } = accepted
    ? await supabase.from('orders').select('id').eq('rfq_quote_id', accepted.id).maybeSingle()
    : { data: null };

  const isOpen = RFQ_OPEN_STATUSES.includes(rfq.status);
  const deadline = effectiveDeadline(rfq);
  const hrs = deadline ? hoursUntil(deadline) : null;
  const code = `#${rfq.id.slice(0, 8).toUpperCase()}`;

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
      <div className="text-brand-sub mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <Link href="/supplier/rfq" className="hover:text-brand-red">
          RFQ nhận được
        </Link>
        <span>/</span>
        <span className="text-brand-light">{code}</span>
      </div>

      <div className="mb-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <StatusPill domain="rfq" status={rfq.status} />
          {rfq.rfq_type === 'multi' && <Pill tone="purple">Gửi nhiều xưởng</Pill>}
          {current && (
            <Pill tone={SUPPLIER_QUOTE_STATUS[current.status]?.tone ?? 'gray'}>
              Báo giá của bạn: {SUPPLIER_QUOTE_STATUS[current.status]?.label ?? current.status}
            </Pill>
          )}
        </div>
        <h1 className="text-xl font-bold break-words">{rfq.title}</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          {rfq.buyer_profiles?.company_name ?? 'Buyer'}
          {buyerVerified && <span className="text-status-green"> · ✓ Đã xác minh</span>}
          {rfq.buyer_profiles?.city ? ` · ${rfq.buyer_profiles.city}` : ''}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* YÊU CẦU */}
        <div className="min-w-0">
          <Card>
            <CardHeader title={<>📋 Yêu cầu của buyer</>} />
            <CardBody padded>
              <InfoRow
                label="Số lượng"
                value={`${rfq.quantity.toLocaleString('vi-VN')} ${rfq.unit ?? ''}`}
              />
              <InfoRow
                label="Ngân sách / đơn vị"
                value={budgetLabel(rfq.budget_min, rfq.budget_max)}
              />
              {rfq.categories?.name && <InfoRow label="Ngành hàng" value={rfq.categories.name} />}
              <InfoRow
                label="Hạn báo giá"
                value={
                  hrs === null ? (
                    'Chưa nêu'
                  ) : hrs <= 0 ? (
                    'Đã hết hạn'
                  ) : (
                    <span className={hrs <= 24 ? 'text-brand-red' : undefined}>
                      Còn {hrs <= 24 ? `${hrs} giờ` : `${daysUntil(deadline!)} ngày`}
                    </span>
                  )
                }
              />
              <InfoRow label="Gửi lúc" value={formatVnDateTime(rfq.created_at)} />
              {rfq.requirements && (
                <div className="mt-3">
                  <div className="text-brand-sub mb-1 text-xs font-bold tracking-[.04em] uppercase">
                    Mô tả chi tiết
                  </div>
                  <div className="text-brand-ink text-sm leading-relaxed break-words whitespace-pre-line">
                    {rfq.requirements}
                  </div>
                </div>
              )}
              <Link
                href={`/messages/${rfq.id}`}
                className="text-brand-blue mt-3 inline-flex min-h-10 items-center text-[13px] font-semibold"
              >
                💬 Nhắn tin hỏi thêm buyer →
              </Link>
            </CardBody>
          </Card>

          {history.length > 0 && (
            <Card>
              <CardHeader title={<>🕒 Báo giá trước đây cho RFQ này</>} />
              <CardBody padded>
                {history.map((q) => (
                  <div
                    key={q.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F2F0EC] py-2.5 text-[13px] first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <span>
                      <strong>{formatVnd(q.unit_price)}</strong>
                      <span className="text-brand-sub"> · {formatVnDateTime(q.created_at)}</span>
                    </span>
                    <Pill tone={SUPPLIER_QUOTE_STATUS[q.status]?.tone ?? 'gray'}>
                      {SUPPLIER_QUOTE_STATUS[q.status]?.label ?? q.status}
                    </Pill>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>

        {/* BÁO GIÁ CỦA XƯỞNG */}
        <div className="min-w-0">
          <Card>
            <CardHeader
              title={
                <>
                  💰{' '}
                  {accepted
                    ? 'Báo giá đã được chấp nhận'
                    : pending
                      ? 'Báo giá của bạn'
                      : 'Gửi báo giá'}
                </>
              }
            />
            <CardBody padded>
              {accepted ? (
                <>
                  <InfoRow label="Đơn giá" value={formatVnd(accepted.unit_price)} />
                  <InfoRow
                    label="Tổng giá trị"
                    value={formatVnd(accepted.unit_price * rfq.quantity)}
                  />
                  {accepted.lead_time_days != null && (
                    <InfoRow label="Thời gian sản xuất" value={`${accepted.lead_time_days} ngày`} />
                  )}
                  <ButtonLink
                    href={order ? `/supplier/orders/${order.id}` : '/supplier/orders'}
                    block
                    className="mt-3"
                  >
                    📦 Mở đơn hàng
                  </ButtonLink>
                </>
              ) : current ? (
                pending && isOpen ? (
                  <>
                    <div className="text-brand-sub mb-3 text-[13px] leading-relaxed">
                      Buyer chưa quyết định — bạn còn sửa hoặc rút báo giá được. Gửi lúc{' '}
                      {formatVnDateTime(pending.created_at)}.
                    </div>
                    <QuoteForm
                      key={pending.id}
                      rfqId={rfq.id}
                      quantity={rfq.quantity}
                      unit={rfq.unit}
                      quote={pending}
                    />
                  </>
                ) : (
                  <>
                    <InfoRow label="Đơn giá" value={formatVnd(current.unit_price)} />
                    <InfoRow
                      label="Trạng thái"
                      value={SUPPLIER_QUOTE_STATUS[current.status]?.label ?? current.status}
                    />
                    <div className="text-brand-sub mt-3 text-[13px]">
                      {isOpen
                        ? 'Báo giá đang được buyer xem xét, không sửa được ở trạng thái này.'
                        : 'RFQ đã đóng.'}
                    </div>
                  </>
                )
              ) : isOpen ? (
                <QuoteForm
                  key="new"
                  rfqId={rfq.id}
                  quantity={rfq.quantity}
                  unit={rfq.unit}
                  quote={null}
                />
              ) : (
                <div className="text-brand-sub text-[13px] leading-relaxed">
                  RFQ này đã đóng, không nhận báo giá nữa.
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
