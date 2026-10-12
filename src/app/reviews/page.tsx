import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell, Card, CardBody, CardHeader } from '@/components/ui';
import { ReviewForm } from '@/components/reviews/ReviewActions';
import { ReviewCard } from '@/components/reviews/ReviewViews';
import { requireBuyer } from '@/lib/buyer-shell';
import { formatVnDate } from '@/lib/format';
import { REVIEW_COLUMNS, type ReviewRow } from '@/lib/reviews';

export const metadata: Metadata = {
  title: 'Đánh giá của tôi — LàngNghề.vn',
};

interface PendingOrder {
  id: string;
  completed_at: string | null;
  supplier_profiles: { shop_name: string } | null;
}

type MyReview = ReviewRow & { supplier_profiles: { shop_name: string } | null };

// "Đánh giá của tôi" (bước 6): đơn đã hoàn tất chưa đánh giá + các đánh giá
// đã gửi kèm trả lời của xưởng.
export default async function BuyerReviewsPage() {
  const { supabase, buyer, shell } = await requireBuyer();

  const [{ data: reviewsData }, { data: completedData }] = await Promise.all([
    supabase
      .from('reviews')
      .select(`${REVIEW_COLUMNS}, supplier_profiles(shop_name)`)
      .eq('buyer_id', buyer.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('orders')
      .select('id, completed_at, supplier_profiles(shop_name)')
      .eq('buyer_id', buyer.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(100),
  ]);

  const reviews = (reviewsData ?? []) as unknown as MyReview[];
  const reviewed = new Set(reviews.map((r) => r.order_id));
  const pending = ((completedData ?? []) as unknown as PendingOrder[]).filter(
    (o) => !reviewed.has(o.id),
  );

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Đánh giá của tôi</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          {pending.length} đơn chờ đánh giá · {reviews.length} đánh giá đã gửi
        </div>
      </div>

      {pending.length > 0 && (
        <Card>
          <CardHeader title={<>⭐ Chờ bạn đánh giá</>} />
          <CardBody padded>
            {pending.map((o) => (
              <div
                key={o.id}
                className="border-b border-[#F2F0EC] py-3.5 first:pt-0 last:border-b-0 last:pb-0"
              >
                <div className="mb-2 flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <strong className="break-words">
                    {o.supplier_profiles?.shop_name ?? 'Xưởng'}
                  </strong>
                  <Link href={`/orders/${o.id}`} className="text-brand-blue text-xs">
                    Đơn #{o.id.slice(0, 8).toUpperCase()}
                  </Link>
                  {o.completed_at && (
                    <span className="text-brand-light text-xs">
                      hoàn tất {formatVnDate(`${o.completed_at}Z`)}
                    </span>
                  )}
                </div>
                <ReviewForm orderId={o.id} />
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title={<>📝 Đã gửi</>} />
        <CardBody padded>
          {reviews.length === 0 ? (
            <div className="text-brand-sub text-[13px]">
              Bạn chưa gửi đánh giá nào. Sau khi một đơn hoàn tất, bạn có thể chấm sao cho xưởng ở
              đây hoặc ngay trong trang đơn hàng.
            </div>
          ) : (
            reviews.map((r) => (
              <ReviewCard
                key={r.id}
                rating={r.rating}
                author={
                  <>
                    {r.supplier_profiles?.shop_name ?? 'Xưởng'}{' '}
                    <Link href={`/orders/${r.order_id}`} className="text-brand-blue font-normal">
                      · Đơn #{r.order_id.slice(0, 8).toUpperCase()}
                    </Link>
                  </>
                }
                createdAt={r.created_at}
                comment={r.comment}
                reply={r.supplier_reply}
                repliedAt={r.replied_at}
                hiddenReason={r.hidden_at ? (r.hidden_reason ?? '') : undefined}
              />
            ))
          )}
        </CardBody>
      </Card>
    </AppShell>
  );
}
