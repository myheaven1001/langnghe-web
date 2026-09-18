// Shared formatting/derivation helpers for the RFQ list (/rfq) and detail
// (/rfq/[id]) pages — kept here instead of duplicated so both stay in sync.

export { formatVnDate, daysUntil, formatVnd } from './format';

export interface RfqDeadlineFields {
  created_at: string;
  expires_at: string | null;
  deadline_days: number | null;
}

// create_rfq() (see supabase/migrations/20260918090000_rfq_quota_and_targets.sql)
// never sets rfq_requests.expires_at — only deadline_days is stored. Derive
// a display deadline from created_at + deadline_days when expires_at is
// still NULL, so "còn X ngày" has something real to show instead of "—".
export function effectiveDeadline(rfq: RfqDeadlineFields): string | null {
  if (rfq.expires_at) return rfq.expires_at;
  if (rfq.deadline_days == null) return null;
  const d = new Date(rfq.created_at);
  d.setDate(d.getDate() + rfq.deadline_days);
  return d.toISOString();
}
