import { formatVnd, formatVnDateTime } from '@/lib/format';
import type { QuoteParty, QuoteRevision } from '@/lib/quotes';

// Lịch sử trả giá của một báo giá (bảng rfq_quote_revisions — kế hoạch 5.7),
// cũ → mới. `viewer` quyết định bên nào được gọi là "Bạn".
export function QuoteHistory({
  revisions,
  viewer,
  unit,
}: {
  revisions: QuoteRevision[];
  viewer: QuoteParty;
  unit: string | null;
}) {
  if (revisions.length < 2) return null;

  return (
    <div className="bg-brand-bg mb-2.5 rounded-lg px-3 py-2.5">
      <div className="text-brand-sub mb-1.5 text-xs font-bold tracking-[.04em] uppercase">
        Lịch sử trả giá
      </div>
      <ol className="flex flex-col gap-1.5">
        {revisions.map((r, i) => {
          const mine = r.proposed_by === viewer;
          const who = mine ? 'Bạn' : r.proposed_by === 'buyer' ? 'Buyer' : 'Xưởng';
          const isLast = i === revisions.length - 1;
          return (
            <li key={r.id} className="text-xs leading-relaxed break-words">
              <span className={isLast ? 'text-brand-ink font-bold' : 'text-brand-sub'}>
                {who}: {formatVnd(Number(r.unit_price))} / {unit ?? 'đơn vị'}
                {r.lead_time_days != null ? ` · ${r.lead_time_days} ngày` : ''}
              </span>
              <span className="text-brand-light"> · {formatVnDateTime(r.created_at)}</span>
              {r.note && <span className="text-brand-sub block">&ldquo;{r.note}&rdquo;</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
