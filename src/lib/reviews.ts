// Đánh giá xưởng (bước 6 — Uy tín): bảng reviews, mỗi đơn hoàn tất một đánh
// giá. Ghi qua RPC submit_review / reply_review / admin_moderate_review; phần
// công khai đọc qua supplier_reviews() + supplier_review_summary().

export interface ReviewRow {
  id: string;
  order_id: string;
  rating: number;
  comment: string | null;
  supplier_reply: string | null;
  replied_at: string | null;
  hidden_at: string | null;
  hidden_reason: string | null;
  created_at: string;
}

export const REVIEW_COLUMNS =
  'id, order_id, rating, comment, supplier_reply, replied_at, hidden_at, hidden_reason, created_at';

/** Một dòng của supplier_reviews() — tên buyer đã được che bớt ở DB. */
export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  supplier_reply: string | null;
  replied_at: string | null;
  created_at: string;
  buyer_name: string;
}

export interface ReviewSummary {
  count: number;
  average: number;
  stars: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export const RATING_LABEL: Record<number, string> = {
  1: 'Rất tệ',
  2: 'Chưa tốt',
  3: 'Tạm được',
  4: 'Tốt',
  5: 'Rất tốt',
};

// Mã lỗi từ submit_review() / reply_review() / admin_moderate_review().
export function reviewErrorMessage(message: string, fallback: string): string {
  if (message.includes('REVIEW_EXISTS')) return 'Đơn này đã được đánh giá. Tải lại trang.';
  if (message.includes('ORDER_NOT_COMPLETED')) return 'Chỉ đánh giá được đơn đã hoàn tất.';
  if (message.includes('ORDER_IN_DISPUTE')) {
    return 'Đơn đang có tranh chấp — đánh giá sau khi sàn giải quyết xong.';
  }
  if (message.includes('INVALID_RATING')) return 'Vui lòng chọn số sao từ 1 đến 5.';
  if (message.includes('INVALID_COMMENT')) return 'Nội dung dài 1–1000 ký tự.';
  if (message.includes('REVIEW_HIDDEN')) return 'Đánh giá đang bị sàn ẩn, không trả lời được.';
  if (message.includes('REVIEW_NOT_FOUND')) return 'Không tìm thấy đánh giá.';
  if (message.includes('REASON_REQUIRED')) return 'Vui lòng ghi lý do.';
  if (message.includes('ORDER_NOT_FOUND')) return 'Không tìm thấy đơn hàng.';
  if (message.includes('FORBIDDEN_NOT_ADMIN')) return 'Chỉ quản trị viên làm được thao tác này.';
  if (message.includes('ACCOUNT_SUSPENDED')) return 'Tài khoản của bạn đang bị tạm khóa.';
  if (message.includes('NOT_AUTHENTICATED')) return 'Vui lòng đăng nhập lại.';
  return fallback;
}
