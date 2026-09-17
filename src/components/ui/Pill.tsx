import type { ReactNode } from 'react';

export type PillTone = 'blue' | 'amber' | 'green' | 'gray' | 'red' | 'purple';

// Tailwind's JIT scanner needs literal class strings, so tones are looked
// up from this map rather than built with a template string.
const TONE_CLASSNAMES: Record<PillTone, string> = {
  blue: 'bg-status-blue-soft text-status-blue',
  amber: 'bg-status-amber-soft text-status-amber',
  green: 'bg-status-green-soft text-status-green',
  gray: 'bg-status-gray-soft text-status-gray',
  red: 'bg-status-red-soft text-status-red',
  purple: 'bg-status-purple-soft text-status-purple',
};

export function Pill({
  tone,
  children,
  className = '',
}: {
  tone: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-[10.5px] font-semibold whitespace-nowrap ${TONE_CLASSNAMES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

interface StatusEntry {
  label: string;
  tone: PillTone;
}

// Domain -> status -> { label, tone } maps, transcribed 1:1 from the .pill-*
// rules in the prototypes (dashboard_buyer, rfq_list, rfq_detail,
// order_list, admin_order_management, supplier_order_list,
// supplier_rfq_inbox, supplier_product_list, admin_user_management,
// admin_dashboard). Labels are the Vietnamese copy used in those pages.
export const RFQ_STATUS = {
  published: { label: 'Đang chờ', tone: 'blue' },
  quoted: { label: 'Đã có báo giá', tone: 'amber' },
  negotiating: { label: 'Đang đàm phán', tone: 'amber' },
  awarded: { label: 'Đã chốt', tone: 'green' },
  closed: { label: 'Đã đóng', tone: 'gray' },
  expired: { label: 'Hết hạn', tone: 'gray' },
  cancelled: { label: 'Đã hủy', tone: 'red' },
} satisfies Record<string, StatusEntry>;

export const ORDER_STATUS = {
  pending_payment: { label: 'Chờ thanh toán', tone: 'amber' },
  confirmed: { label: 'Đã xác nhận', tone: 'blue' },
  producing: { label: 'Đang sản xuất', tone: 'purple' },
  shipped: { label: 'Đang giao', tone: 'blue' },
  delivered: { label: 'Đã giao', tone: 'green' },
  completed: { label: 'Hoàn tất', tone: 'green' },
  disputed: { label: 'Khiếu nại', tone: 'red' },
  cancelled: { label: 'Đã hủy', tone: 'gray' },
} satisfies Record<string, StatusEntry>;

export const SUPPLIER_RFQ_STATUS = {
  new: { label: 'Mới', tone: 'red' },
  quoted: { label: 'Đã báo giá', tone: 'amber' },
  won: { label: 'Đã thắng', tone: 'green' },
  lost: { label: 'Đã mất', tone: 'gray' },
  expired: { label: 'Hết hạn', tone: 'gray' },
} satisfies Record<string, StatusEntry>;

export const PRODUCT_STATUS = {
  active: { label: 'Đang bán', tone: 'green' },
  draft: { label: 'Nháp', tone: 'gray' },
  paused: { label: 'Tạm dừng', tone: 'amber' },
} satisfies Record<string, StatusEntry>;

export const USER_STATUS = {
  active: { label: 'Hoạt động', tone: 'green' },
  pending: { label: 'Chờ duyệt', tone: 'amber' },
  suspended: { label: 'Đã khóa', tone: 'red' },
} satisfies Record<string, StatusEntry>;

export const VERIFICATION_CASE_STATUS = {
  open: { label: 'Mới', tone: 'red' },
  investigating: { label: 'Đang xem xét', tone: 'amber' },
} satisfies Record<string, StatusEntry>;

const STATUS_DOMAINS = {
  rfq: RFQ_STATUS,
  order: ORDER_STATUS,
  supplierRfq: SUPPLIER_RFQ_STATUS,
  product: PRODUCT_STATUS,
  user: USER_STATUS,
  verification: VERIFICATION_CASE_STATUS,
} as const;

export type StatusDomain = keyof typeof STATUS_DOMAINS;

/** Convenience wrapper around Pill for a known status domain (rfq/order/...). */
export function StatusPill({
  domain,
  status,
  className,
}: {
  domain: StatusDomain;
  status: string;
  className?: string;
}) {
  const map = STATUS_DOMAINS[domain] as Record<string, StatusEntry>;
  const entry = map[status];
  if (!entry) {
    return (
      <Pill tone="gray" className={className}>
        {status}
      </Pill>
    );
  }
  return (
    <Pill tone={entry.tone} className={className}>
      {entry.label}
    </Pill>
  );
}
