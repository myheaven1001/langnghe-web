// Dùng chung cho 3 trang chi tiết đơn: /orders/[id] (buyer),
// /supplier/orders/[id] (xưởng), /admin/orders/[id] (admin) — kế hoạch 3.4–3.6.

export type OrderRole = 'buyer' | 'supplier' | 'admin';

export interface OrderEventRow {
  id: string;
  actor_id: string | null;
  event_type: string;
  note: string | null;
  metadata: {
    actor_role?: OrderRole;
    doc_type?: string;
    file_name?: string;
    auto?: boolean;
  } | null;
  created_at: string;
}

export interface OrderDocumentRow {
  id: string;
  uploader_role: OrderRole;
  doc_type: string;
  storage_path: string;
  file_name: string;
  note: string | null;
  created_at: string;
}

// Thứ tự vòng đời — vẽ các bước "chưa diễn ra" sau sự kiện thật cuối cùng.
export const ORDER_FORWARD_CHAIN = [
  'order_created',
  'payment_confirmed',
  'producing_started',
  'shipped',
  'delivered',
  'completed',
] as const;

// Cùng danh sách với CHECK của order_events.event_type (20261005091900).
export const ORDER_EVENT_LABEL: Record<string, { icon: string; label: string }> = {
  order_created: { icon: '🎉', label: 'Đơn hàng được tạo' },
  payment_confirmed: { icon: '💳', label: 'Đã xác nhận thanh toán' },
  producing_started: { icon: '🧵', label: 'Xưởng bắt đầu sản xuất' },
  shipped: { icon: '🚚', label: 'Đã bàn giao vận chuyển' },
  delivered: { icon: '📬', label: 'Buyer đã nhận hàng' },
  dispute_opened: { icon: '⚠️', label: 'Mở tranh chấp' },
  dispute_resolved: { icon: '✅', label: 'Đã giải quyết tranh chấp' },
  completed: { icon: '🏁', label: 'Hoàn tất đơn hàng' },
  cancelled: { icon: '✕', label: 'Đơn hàng bị hủy' },
  note: { icon: '📝', label: 'Ghi chú' },
  document_added: { icon: '📎', label: 'Thêm chứng từ' },
};

export const ORDER_ROLE_LABEL: Record<OrderRole, string> = {
  buyer: 'Buyer',
  supplier: 'Xưởng',
  admin: 'Sàn LàngNghề.vn',
};

export const DOC_TYPE_LABEL: Record<string, string> = {
  payment_receipt: 'Biên lai chuyển khoản',
  shipping_document: 'Vận đơn / phiếu giao hàng',
  invoice: 'Hoá đơn',
  other: 'Khác',
};

// Loại chứng từ mỗi vai trò được tải — khớp trigger order_documents_before_insert.
export const DOC_TYPES_BY_ROLE: Record<OrderRole, string[]> = {
  buyer: ['payment_receipt', 'other'],
  supplier: ['shipping_document', 'invoice', 'other'],
  admin: ['payment_receipt', 'shipping_document', 'invoice', 'other'],
};

// Ai làm sự kiện này. Event note/document_added có metadata.actor_role; các
// event trạng thái thì suy ra từ bảng chuyển trạng thái (guard_order_update).
export function orderEventActor(event: OrderEventRow, viewerId: string): string {
  if (event.actor_id && event.actor_id === viewerId) return 'Bạn';
  if (event.metadata?.actor_role) return ORDER_ROLE_LABEL[event.metadata.actor_role];
  if (!event.actor_id) return 'Hệ thống';
  switch (event.event_type) {
    case 'producing_started':
    case 'shipped':
      return ORDER_ROLE_LABEL.supplier;
    case 'order_created':
    case 'delivered':
    case 'completed':
      return ORDER_ROLE_LABEL.buyer;
    default:
      return ORDER_ROLE_LABEL.admin;
  }
}

export function orderCode(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

// Mã lỗi từ trigger/hàm của đơn hàng → câu tiếng Việt.
export function orderErrorMessage(message: string, fallback: string): string {
  if (message.includes('ACCOUNT_SUSPENDED')) return 'Tài khoản của bạn đang bị tạm khóa.';
  if (message.includes('ORDER_TRACKING_REQUIRED')) {
    return 'Vui lòng nhập mã vận đơn (không bắt buộc khi chọn Tự vận chuyển).';
  }
  if (message.includes('FORBIDDEN_ORDER_STATUS_CHANGE')) {
    return 'Đơn hàng đã đổi trạng thái. Vui lòng tải lại trang.';
  }
  if (message.includes('FORBIDDEN_DOCUMENT_TYPE')) return 'Bạn không tải được loại chứng từ này.';
  if (message.includes('ORDER_DOCUMENT_LIMIT'))
    return 'Đơn đã đủ 30 chứng từ, không thêm được nữa.';
  if (message.includes('INVALID_NOTE')) return 'Ghi chú dài 1–1000 ký tự.';
  if (message.includes('ORDER_NOT_FOUND')) return 'Không tìm thấy đơn hàng.';
  return fallback;
}

// ── Dòng hàng của đơn (bảng order_items — kế hoạch 5.2/5.3) ──────────────
export interface OrderItemRow {
  id?: string;
  product_id?: string | null;
  product_name: string;
  variant_label: string | null;
  unit: string | null;
  quantity: number;
  unit_price?: number;
  line_total?: number;
  sort_order?: number;
}

/** Cột order_items cho trang chi tiết đơn. */
export const ORDER_ITEMS_DETAIL =
  'order_items(id, product_id, product_name, variant_label, unit, quantity, unit_price, line_total, sort_order)';
/** Cột order_items đủ để tóm tắt đơn ở danh sách. */
export const ORDER_ITEMS_BRIEF =
  'order_items(product_name, variant_label, unit, quantity, sort_order)';

export function sortOrderItems<T extends OrderItemRow>(items: T[] | null | undefined): T[] {
  return [...(items ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

// Một dòng tóm tắt đơn cho danh sách: "Bát gốm và 2 mặt hàng khác", "100 cái".
// Đơn từ báo giá có đúng 1 dòng hàng; đơn đặt thẳng có thể nhiều dòng.
export function summarizeOrderItems(items: OrderItemRow[] | null | undefined): {
  title: string;
  quantityLabel: string;
} {
  const sorted = sortOrderItems(items);
  if (sorted.length === 0) return { title: 'Đơn hàng', quantityLabel: '' };
  const first = sorted[0];
  const names = new Set(sorted.map((i) => i.product_name));
  const title =
    names.size > 1
      ? `${first.product_name} và ${names.size - 1} mặt hàng khác`
      : first.product_name;
  const totalQty = sorted.reduce((sum, i) => sum + i.quantity, 0);
  const units = new Set(sorted.map((i) => i.unit ?? ''));
  const unit = units.size === 1 ? (first.unit ?? '') : '';
  return { title, quantityLabel: `${totalQty.toLocaleString('vi-VN')} ${unit}`.trim() };
}
