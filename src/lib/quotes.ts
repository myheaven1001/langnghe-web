import type { PillTone } from '@/components/ui';

// Trạng thái báo giá nhìn từ phía xưởng (enum quote_status; 'withdrawn' thêm
// ở 20261005092400).
export const SUPPLIER_QUOTE_STATUS: Record<string, { label: string; tone: PillTone }> = {
  pending: { label: 'Đang chờ buyer', tone: 'amber' },
  counter_offered: { label: 'Đang thương lượng', tone: 'blue' },
  accepted: { label: 'Được chấp nhận', tone: 'green' },
  rejected: { label: 'Không được chọn', tone: 'gray' },
  withdrawn: { label: 'Đã rút', tone: 'gray' },
};

// RFQ còn nhận báo giá — khớp trigger guard_rfq_quote_write (RFQ_NOT_OPEN).
export const RFQ_OPEN_STATUSES = ['published', 'quoted', 'negotiating'];

export interface SupplierQuote {
  id: string;
  rfq_id: string;
  unit_price: number;
  min_qty: number | null;
  lead_time_days: number | null;
  note: string | null;
  valid_until: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// ── Trả giá (bảng rfq_quote_revisions — kế hoạch 5.7) ────────────────────
export type QuoteParty = 'buyer' | 'supplier';

export interface QuoteRevision {
  id: string;
  quote_id: string;
  proposed_by: QuoteParty;
  unit_price: number;
  lead_time_days: number | null;
  note: string | null;
  created_at: string;
}

export const QUOTE_REVISION_COLUMNS =
  'id, quote_id, proposed_by, unit_price, lead_time_days, note, created_at';

// Mỗi báo giá tối đa 10 lượt đề nghị — khớp counter_quote() (COUNTER_LIMIT_REACHED).
export const MAX_QUOTE_ROUNDS = 10;

/** Lượt đề nghị gần nhất; chưa có lịch sử thì coi như báo giá gốc của xưởng. */
export function lastRevision(revisions: QuoteRevision[]): QuoteRevision | null {
  return revisions.length ? revisions[revisions.length - 1] : null;
}

/** Gom lịch sử (đã sắp cũ → mới) theo báo giá. */
export function groupRevisions(rows: QuoteRevision[] | null): Map<string, QuoteRevision[]> {
  const map = new Map<string, QuoteRevision[]>();
  for (const row of rows ?? []) {
    const list = map.get(row.quote_id) ?? [];
    list.push(row);
    map.set(row.quote_id, list);
  }
  return map;
}

// Mã lỗi từ counter_quote() / reject_quote() / trigger báo giá → câu tiếng Việt.
export function quoteErrorMessage(message: string, fallback: string): string {
  if (message.includes('NOT_YOUR_TURN')) {
    return 'Đang chờ bên kia trả lời đề nghị gần nhất. Tải lại trang để xem trạng thái mới.';
  }
  if (message.includes('COUNTER_LIMIT_REACHED')) {
    return 'Báo giá này đã đủ 10 lượt đề nghị — hãy chốt, từ chối hoặc nhắn tin trao đổi thêm.';
  }
  if (message.includes('QUOTE_NOT_NEGOTIABLE') || message.includes('FORBIDDEN_QUOTE_CHANGE')) {
    return 'Báo giá này đã được xử lý. Tải lại trang.';
  }
  if (message.includes('RFQ_ALREADY_SETTLED')) return 'Yêu cầu báo giá đã đóng.';
  if (message.includes('QUOTE_NOT_FOUND')) return 'Không tìm thấy báo giá. Tải lại trang.';
  if (message.includes('INVALID_PRICE')) return 'Đơn giá không hợp lệ.';
  if (message.includes('INVALID_LEAD_TIME')) return 'Thời gian sản xuất từ 1 đến 365 ngày.';
  if (message.includes('INVALID_NOTE')) return 'Lời nhắn tối đa 500 ký tự.';
  if (message.includes('ACCOUNT_SUSPENDED')) return 'Tài khoản của bạn đang bị tạm khóa.';
  if (message.includes('NOT_AUTHENTICATED')) return 'Vui lòng đăng nhập lại.';
  return fallback;
}
