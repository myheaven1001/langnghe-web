// Mã lỗi từ các hàm admin_* (20261005092000_admin_actions.sql) → câu tiếng Việt.
const ADMIN_ERRORS: Record<string, string> = {
  FORBIDDEN_NOT_ADMIN: 'Chỉ quản trị viên đang hoạt động mới làm được thao tác này.',
  ORDER_NOT_FOUND: 'Không tìm thấy đơn hàng.',
  ORDER_NOT_PENDING_PAYMENT: 'Đơn không còn ở trạng thái chờ thanh toán. Vui lòng tải lại trang.',
  INVALID_PAYMENT: 'Số tiền hoặc thời điểm nhận tiền không hợp lệ.',
  PAYMENT_AMOUNT_MISMATCH: 'Số tiền đã nhận khác tổng đơn — cần ghi chú giải thích.',
  USER_NOT_FOUND: 'Không tìm thấy tài khoản.',
  CANNOT_CHANGE_SELF: 'Không tự khoá/mở khoá tài khoản của chính mình được.',
  CANNOT_SUSPEND_ADMIN: 'Không khoá được tài khoản quản trị viên.',
  REASON_REQUIRED: 'Vui lòng ghi lý do.',
  VERIFICATION_NOT_FOUND: 'Không tìm thấy hồ sơ.',
  VERIFICATION_NOT_PENDING: 'Hồ sơ đã được xử lý trước đó. Vui lòng tải lại trang.',
  DISPUTE_ALREADY_OPEN: 'Đơn này đang có tranh chấp chưa giải quyết.',
  INVALID_REPORTER: 'Vui lòng chọn bên báo tranh chấp.',
  INVALID_INPUT: 'Giá trị nhập không hợp lệ.',
  PROFILE_NOT_FOUND: 'Không tìm thấy hồ sơ.',
  INSUFFICIENT_CREDIT: 'Buyer không đủ credit để trừ.',
  DISPUTE_NOT_FOUND: 'Không tìm thấy tranh chấp.',
  DISPUTE_ALREADY_RESOLVED: 'Tranh chấp đã được giải quyết trước đó. Vui lòng tải lại trang.',
  INVALID_RESOLUTION: 'Quyết định xử lý không hợp lệ.',
  ORDER_CANCEL_REASON_REQUIRED: 'Vui lòng ghi lý do hủy đơn.',
  FORBIDDEN_ORDER_STATUS_CHANGE: 'Không hủy được đơn đã hoàn tất hoặc đã hủy.',
  FORBIDDEN_ADMIN_DIRECT_WRITE: 'Thao tác này phải đi qua chức năng quản trị tương ứng.',
};

export function adminErrorMessage(message: string, fallback: string): string {
  for (const [code, text] of Object.entries(ADMIN_ERRORS)) {
    if (message.includes(code)) return text;
  }
  return fallback;
}
