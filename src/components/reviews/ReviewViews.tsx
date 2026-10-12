import type { ReactNode } from 'react';
import { formatVnDate } from '@/lib/format';
import type { PublicReview, ReviewSummary } from '@/lib/reviews';

export function Stars({ rating, size = 'md' }: { rating: number; size?: 'md' | 'lg' }) {
  const full = Math.round(rating);
  return (
    <span
      className={`whitespace-nowrap ${size === 'lg' ? 'text-lg' : 'text-sm'}`}
      role="img"
      aria-label={`${rating} trên 5 sao`}
    >
      <span className="text-[#FFB800]">{'★'.repeat(full)}</span>
      <span className="text-[#DDD8CF]">{'★'.repeat(5 - full)}</span>
    </span>
  );
}

// Một đánh giá: sao, người viết, nhận xét, trả lời của xưởng. `footer` là chỗ
// cho nút hành động theo vai trò (trả lời, ẩn…).
export function ReviewCard({
  rating,
  author,
  createdAt,
  comment,
  reply,
  repliedAt,
  hiddenReason,
  footer,
}: {
  rating: number;
  author: ReactNode;
  createdAt: string;
  comment: string | null;
  reply: string | null;
  repliedAt?: string | null;
  /** Có giá trị = đánh giá đang bị sàn ẩn. */
  hiddenReason?: string | null;
  footer?: ReactNode;
}) {
  return (
    <div className="border-b border-[#F2F0EC] py-3.5 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Stars rating={rating} />
        <span className="min-w-0 text-[13px] font-semibold break-words">{author}</span>
        <span className="text-brand-light text-xs">{formatVnDate(createdAt)}</span>
        {hiddenReason != null && (
          <span className="bg-status-red-soft text-status-red rounded-full px-2 py-px text-xs font-semibold">
            Đang bị ẩn
          </span>
        )}
      </div>
      {comment && (
        <div className="mt-1 text-[13px] leading-relaxed break-words whitespace-pre-line">
          {comment}
        </div>
      )}
      {hiddenReason && (
        <div className="text-status-red mt-1 text-xs break-words">Lý do ẩn: {hiddenReason}</div>
      )}
      {reply && (
        <div className="bg-brand-bg mt-2 rounded-lg px-3 py-2">
          <div className="text-brand-sub text-xs font-semibold">
            Xưởng trả lời{repliedAt ? ` · ${formatVnDate(repliedAt)}` : ''}
          </div>
          <div className="mt-0.5 text-[13px] leading-relaxed break-words whitespace-pre-line">
            {reply}
          </div>
        </div>
      )}
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

// Khối đánh giá công khai trên trang gian hàng: điểm trung bình, phân bố sao,
// các đánh giá mới nhất (đã che tên buyer ở DB).
export function PublicReviews({
  summary,
  reviews,
}: {
  summary: ReviewSummary;
  reviews: PublicReview[];
}) {
  if (summary.count === 0) return null;

  return (
    <section id="reviews" className="border-brand-border mb-3 rounded-md border bg-white p-4">
      <h2 className="mb-3 text-[15px] font-bold">Đánh giá từ người mua</h2>
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <div className="font-tight text-[28px] leading-none font-bold">
            {Number(summary.average).toFixed(1)}
          </div>
          <Stars rating={Number(summary.average)} size="lg" />
          <div className="text-brand-sub text-xs">{summary.count} đánh giá</div>
        </div>
        <div className="min-w-[200px] flex-1 sm:max-w-[320px]">
          {(['5', '4', '3', '2', '1'] as const).map((star) => {
            const n = summary.stars[star] ?? 0;
            return (
              <div key={star} className="text-brand-sub flex items-center gap-2 text-xs">
                <span className="w-7 shrink-0">{star} ★</span>
                <span className="bg-brand-bg h-1.5 flex-1 overflow-hidden rounded-full">
                  <span
                    className="block h-full rounded-full bg-[#FFB800]"
                    style={{ width: `${(n / summary.count) * 100}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right">{n}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        {reviews.map((r) => (
          <ReviewCard
            key={r.id}
            rating={r.rating}
            author={r.buyer_name}
            createdAt={r.created_at}
            comment={r.comment}
            reply={r.supplier_reply}
            repliedAt={r.replied_at}
          />
        ))}
      </div>
      {summary.count > reviews.length && (
        <div className="text-brand-light mt-2 text-xs">
          Đang hiện {reviews.length} đánh giá mới nhất trên tổng {summary.count}.
        </div>
      )}
    </section>
  );
}
