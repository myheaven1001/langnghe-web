import { formatVnDateTime } from '@/lib/format';
import {
  DOC_TYPE_LABEL,
  ORDER_EVENT_LABEL,
  ORDER_FORWARD_CHAIN,
  orderEventActor,
  type OrderEventRow,
} from '@/lib/orders';

// Dòng thời gian của đơn: sự kiện thật (order_events) + các bước chưa diễn
// ra. Dùng chung cho trang đơn của buyer, xưởng và admin.
export function OrderTimeline({
  events,
  status,
  viewerId,
}: {
  events: OrderEventRow[];
  status: string;
  viewerId: string;
}) {
  const doneTypes = new Set(events.map((e) => e.event_type));
  const nextIndex =
    status === 'cancelled' ? -1 : ORDER_FORWARD_CHAIN.findIndex((t) => !doneTypes.has(t));
  const ghostSteps = nextIndex === -1 ? [] : ORDER_FORWARD_CHAIN.slice(nextIndex);

  return (
    <div className="flex flex-col">
      {events.map((event, i) => {
        const meta = ORDER_EVENT_LABEL[event.event_type] ?? { icon: '•', label: event.event_type };
        const isLast = i === events.length - 1 && ghostSteps.length === 0;
        const isSide = event.event_type === 'note' || event.event_type === 'document_added';
        const docLabel =
          event.event_type === 'document_added'
            ? [DOC_TYPE_LABEL[event.metadata?.doc_type ?? ''], event.metadata?.file_name]
                .filter(Boolean)
                .join(' — ')
            : null;
        return (
          <div key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && (
              <div className="bg-brand-border absolute top-6 bottom-0 left-[11px] w-[1.5px]" />
            )}
            <div
              className={`z-10 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full text-[11px] ${
                isSide ? 'border-brand-border border bg-white' : 'bg-brand-green text-white'
              }`}
            >
              {meta.icon}
            </div>
            <div className="min-w-0 flex-1 pb-0.5">
              <div className="text-brand-ink text-[12.5px] font-bold">{meta.label}</div>
              {docLabel && (
                <div className="text-brand-sub mt-0.5 text-[11.5px] break-words">{docLabel}</div>
              )}
              {event.note && (
                <div className="text-brand-sub mt-0.5 text-[11.5px] leading-relaxed break-words whitespace-pre-line">
                  {event.note}
                </div>
              )}
              <div className="text-brand-light mt-0.5 text-[10.5px]">
                {formatVnDateTime(event.created_at)} · {orderEventActor(event, viewerId)}
              </div>
            </div>
          </div>
        );
      })}

      {ghostSteps.map((type, i) => {
        const meta = ORDER_EVENT_LABEL[type] ?? { icon: '•', label: type };
        const isLast = i === ghostSteps.length - 1;
        return (
          <div key={type} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && (
              <div className="bg-brand-border absolute top-6 bottom-0 left-[11px] w-[1.5px]" />
            )}
            <div className="border-brand-border text-brand-light z-10 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border-2 bg-white text-[10px]">
              {i + 1}
            </div>
            <div className="flex-1 pb-0.5">
              <div className="text-brand-light text-[12.5px] font-bold">{meta.label}</div>
              <div className="text-brand-light mt-0.5 text-[11.5px]">Chưa diễn ra</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
