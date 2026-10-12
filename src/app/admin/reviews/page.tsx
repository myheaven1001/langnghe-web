import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell, Card, CardBody } from '@/components/ui';
import { ReviewModerateButton } from '@/components/reviews/ReviewActions';
import { ReviewCard } from '@/components/reviews/ReviewViews';
import { REVIEW_COLUMNS, type ReviewRow } from '@/lib/reviews';
import { requireAdmin } from '../_lib/guard';

export const metadata: Metadata = {
  title: 'Kiểm duyệt đánh giá — LàngNghề.vn',
};

type AdminReview = ReviewRow & {
  buyer_profiles: { company_name: string } | null;
  supplier_profiles: { id: string; shop_name: string } | null;
};

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'low', label: '1–2 sao' },
  { key: 'hidden', label: 'Đang ẩn' },
] as const;

// Kiểm duyệt đánh giá (bước 6): xem mọi đánh giá, ẩn cái vi phạm (có lý do,
// có nhật ký) hoặc hiện lại. Ẩn / hiện tự tính lại điểm của xưởng.
export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as (typeof TABS)[number]['key']) : 'all';

  const { supabase, shell } = await requireAdmin();
  let query = supabase
    .from('reviews')
    .select(`${REVIEW_COLUMNS}, buyer_profiles(company_name), supplier_profiles(id, shop_name)`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (tab === 'low') query = query.lte('rating', 2);
  if (tab === 'hidden') query = query.not('hidden_at', 'is', null);
  const { data } = await query;
  const reviews = (data ?? []) as unknown as AdminReview[];

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-lg font-bold">Kiểm duyệt đánh giá</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          100 đánh giá mới nhất. Chỉ ẩn đánh giá vi phạm (xúc phạm, quảng cáo, không liên quan đơn
          hàng) — không ẩn vì điểm thấp.
        </div>
      </div>

      <div className="border-brand-border mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'all' ? '/admin/reviews' : `/admin/reviews?tab=${t.key}`}
            className={`border-b-2 px-3.5 py-2.5 text-[13px] font-semibold whitespace-nowrap ${
              t.key === tab
                ? 'border-brand-forest text-brand-forest'
                : 'text-brand-sub hover:text-brand-forest border-transparent'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardBody padded>
          {reviews.length === 0 ? (
            <div className="text-brand-sub text-[13px]">Không có đánh giá nào ở mục này.</div>
          ) : (
            reviews.map((r) => (
              <ReviewCard
                key={r.id}
                rating={r.rating}
                author={
                  <>
                    {r.buyer_profiles?.company_name ?? 'Buyer'} →{' '}
                    {r.supplier_profiles?.shop_name ?? 'Xưởng'}{' '}
                    <Link
                      href={`/admin/orders/${r.order_id}`}
                      className="text-brand-blue font-normal"
                    >
                      · Đơn #{r.order_id.slice(0, 8).toUpperCase()}
                    </Link>
                  </>
                }
                createdAt={r.created_at}
                comment={r.comment}
                reply={r.supplier_reply}
                repliedAt={r.replied_at}
                hiddenReason={r.hidden_at ? (r.hidden_reason ?? '') : undefined}
                footer={<ReviewModerateButton reviewId={r.id} hidden={!!r.hidden_at} />}
              />
            ))
          )}
        </CardBody>
      </Card>
    </AppShell>
  );
}
