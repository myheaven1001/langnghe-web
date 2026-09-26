// Đường dẫn quay lại sau đăng nhập/đăng ký (`?next=`). Chỉ nhận đường dẫn
// nội bộ: bắt đầu bằng "/" nhưng không phải "//" hay "/\" (trình duyệt hiểu
// cả hai là URL sang domain khác), không chứa ký tự điều khiển. Giá trị lạ
// → null, người gọi dùng trang chủ theo vai trò.
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null;
  }
  return value;
}

// Thêm `next` vào query string nếu có.
export function withNext(path: string, next: string | null | undefined): string {
  if (!next) return path;
  return `${path}${path.includes('?') ? '&' : '?'}next=${encodeURIComponent(next)}`;
}
