import { PRODUCT, RATING_BARS, REVIEWS } from './data';

// Matches #tab-reviews from the prototype.
export function ReviewsTab() {
  return (
    <div>
      <div className="mb-5 flex flex-col items-center gap-5 rounded-md border border-[#E8E8E8] bg-[#FAFAFA] p-4 sm:flex-row">
        <div className="text-center">
          <div className="font-tight text-brand-red text-[40px] leading-none font-bold">
            {PRODUCT.rating}
          </div>
          <div className="my-1 text-lg text-[#FFB800]">★★★★★</div>
          <div className="text-brand-sub text-xs">{PRODUCT.ratingCount} đánh giá</div>
        </div>
        <div className="flex-1 self-stretch">
          {RATING_BARS.map((bar) => (
            <div key={bar.stars} className="mb-1.5 flex items-center gap-2">
              <div className="text-brand-sub w-[30px] shrink-0 text-right text-xs">{bar.stars}★</div>
              <div className="border-brand-border h-[7px] flex-1 overflow-hidden rounded-full bg-[#E8E8E8]">
                <div className="h-full rounded-full bg-[#FFB800]" style={{ width: `${bar.percent}%` }} />
              </div>
              <div className="text-brand-sub w-6 shrink-0 text-xs">{bar.count}</div>
            </div>
          ))}
        </div>
      </div>

      {REVIEWS.map((review) => (
        <div key={review.id} className="border-brand-border border-b py-3.5 last:border-none">
          <div className="mb-2 flex items-center gap-2.5">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold text-white ${review.avatarGradient}`}
            >
              {review.avatarInitial}
            </div>
            <div>
              <div className="text-[13px] font-semibold">{review.name}</div>
              <div className="text-[12px] text-[#FFB800]">{review.stars}</div>
            </div>
            <div className="text-brand-sub ml-auto text-[11px]">{review.date}</div>
          </div>
          <div className="text-brand-sub text-[13px] leading-[1.6]">{review.content}</div>
          <div className="text-brand-light mt-1.5 text-[11px]">{review.orderNote}</div>
        </div>
      ))}
    </div>
  );
}
