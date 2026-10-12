import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell, Card, CardBody, CardHeader } from '@/components/ui';
import { ReviewReplyForm } from '@/components/reviews/ReviewActions';
import { ReviewCard, Stars } from '@/components/reviews/ReviewViews';
import { REVIEW_COLUMNS, type ReviewRow } from '@/lib/reviews';
import { requireSupplier } from '../_lib/guard';

export const metadata: Metadata = {
  title: 'Đánh giá — LàngNghề.vn',
};

type SupplierReview = ReviewRow & { buyer_profiles: { company_name: string } | null };

// Đánh giá buyer dành cho xưởng (bước 6). Xưởng thấy cả đánh giá đang bị sàn
// ẩn (kèm lý do) nhưng chỉ trả lời được đánh giá đang hiển thị.
export default async function SupplierReviewsPage() {
  const { supabase, supplier, shell } = await requireSupplier();

  const [{ data: reviewsData }, { data: profile }] = await Promise.all([
    supabase
      .from('reviews')
      .select(`${REVIEW_COLUMNS}, buyer_profiles(company_name)`)
      .eq('supplier_id', supplier.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('supplier_profiles')
      .select('rating_avg, rating_count')
      .eq('id', supplier.id)
      .maybeSingle(),
  ]);

  const reviews = (reviewsData ?? []) as unknown as SupplierReview[];
  const average = Number(profile?.rating_avg ?? 0);
  const count = Number(profile?.rating_count ?? 0);
  const unanswered = reviews.filter((r) => !r.supplier_reply && !r.hidden_at).length;

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Đánh giá</h1>
        <div className="text-brand-sub mt-1 flex flex-wrap items-center gap-x-2 text-[13px]">
          {count > 0 ? (
            <>
              <Stars rating={average} />
              <strong className="text-brand-ink">{average.toFixed(1)}</strong>
              <span>
                · {count} đánh giá đang hiển thị · {unanswered} chưa trả lời
              </span>
            </>
          ) : (
            'Chưa có đánh giá nào. Buyer chấm sao sau khi đơn hoàn tất.'
          )}
        </div>
      </div>

      {reviews.length > 0 && (
        <Card>
          <CardHeader title={<>⭐ Đánh giá từ buyer</>} />
          <CardBody padded>
            {reviews.map((r) => (
              <ReviewCard
                key={r.id}
                rating={r.rating}
                author={
                  <>
                    {r.buyer_profiles?.company_name ?? 'Buyer'}{' '}
                    <Link
                      href={`/supplier/orders/${r.order_id}`}
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
                footer={
                  r.hidden_at ? null : (
                    <ReviewReplyForm reviewId={r.id} currentReply={r.supplier_reply} />
                  )
                }
              />
            ))}
          </CardBody>
        </Card>
      )}
    </AppShell>
  );
}
