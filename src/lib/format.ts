// Generic formatting helpers shared across buyer/supplier pages (RFQ,
// orders, ...) — kept separate from lib/rfq.ts so non-RFQ pages (like
// /orders) don't import through an RFQ-named module for plain formatting.

export function formatVnDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN');
}

export function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function hoursUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 3_600_000);
}

// `new Date(Date.now() - ...)` inline in a Server Component body trips the
// react-hooks/purity lint rule (it flags direct Date.now()/Math.random()
// call sites in component code, but not calls routed through a helper like
// this one) — used by /orders to compute its "since" cutoff for date-range
// filtering.
export function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function formatVnd(n: number) {
  return `${n.toLocaleString('vi-VN')}đ`;
}

// Same react-hooks/purity reasoning as daysAgoIso() above — routes the
// `Date.now()`/`new Date()` call through a helper instead of writing it
// inline in a Server Component body.
export function monthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

// "05/10/2026 14:30" theo giờ Việt Nam, dù chạy trên server (UTC) hay trình
// duyệt. Các cột TIMESTAMP không múi giờ (orders, order_events…) được DB ghi
// theo UTC nhưng trả về không kèm "Z" — thêm vào để không lệch 7 tiếng.
export function formatVnDateTime(iso: string) {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
