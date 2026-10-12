// Tranh chấp (kế hoạch 5.8): buyer / xưởng tự mở qua open_dispute(), trao đổi
// trong bảng dispute_messages, admin giải quyết bằng admin_resolve_dispute()
// (đổi đơn + ghi bảng refunds). RLS giới hạn mỗi người chỉ thấy tranh chấp
// của đơn mình; admin thấy tất cả.
import type { PillTone } from '@/components/ui';
import type { createClient } from '@/lib/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type DisputeViewer = 'buyer' | 'supplier' | 'admin';

/** Trang gốc của khu tranh chấp theo vai trò. */
export const DISPUTE_BASE: Record<DisputeViewer, string> = {
  buyer: '/disputes',
  supplier: '/supplier/disputes',
  admin: '/admin/disputes',
};

export const DISPUTE_STATUS: Record<string, { label: string; tone: PillTone }> = {
  open: { label: 'Mới mở', tone: 'red' },
  investigating: { label: 'Sàn đang xử lý', tone: 'amber' },
  resolved: { label: 'Đã giải quyết', tone: 'green' },
};

export const DISPUTE_RESOLUTION_LABEL: Record<string, string> = {
  release_supplier: 'Không hoàn tiền — xưởng đã làm đúng',
  refund_buyer: 'Hoàn toàn bộ cho buyer, huỷ đơn',
  partial: 'Hoàn một phần cho buyer',
};

export const DISPUTE_ROLE_LABEL: Record<string, string> = {
  buyer: 'Buyer',
  supplier: 'Xưởng',
  admin: 'Sàn',
};

// Đơn mở được tranh chấp — khớp open_dispute() (ORDER_NOT_DISPUTABLE).
export const DISPUTABLE_ORDER_STATUSES = ['confirmed', 'producing', 'shipped', 'delivered'];

export interface DisputeRow {
  id: string;
  order_id: string;
  reason: string;
  status: string;
  reporter_role: string | null;
  resolution: string | null;
  refund_ratio: number | null;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
  orders: {
    id: string;
    total: number;
    status: string;
    buyer_profiles: { company_name: string } | null;
    supplier_profiles: { shop_name: string } | null;
  } | null;
}

export interface DisputeMessageRow {
  id: string;
  sender_role: string;
  body: string;
  attachment_path: string | null;
  attachment_name: string | null;
  created_at: string;
}

export interface RefundRow {
  id: string;
  order_id: string;
  dispute_id: string | null;
  amount: number;
  status: string;
  note: string | null;
  bank_ref: string | null;
  created_at: string;
  paid_at: string | null;
}

const DISPUTE_COLUMNS =
  'id, order_id, reason, status, reporter_role, resolution, refund_ratio, resolution_note, created_at, resolved_at, orders(id, total, status, buyer_profiles(company_name), supplier_profiles(shop_name))';
const REFUND_COLUMNS =
  'id, order_id, dispute_id, amount, status, note, bank_ref, created_at, paid_at';

export async function loadDisputes(
  supabase: SupabaseServerClient,
  filter: 'open' | 'resolved' | 'all',
): Promise<DisputeRow[]> {
  let query = supabase
    .from('disputes')
    .select(DISPUTE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100);
  if (filter === 'open') query = query.neq('status', 'resolved');
  if (filter === 'resolved') query = query.eq('status', 'resolved');
  const { data } = await query;
  return (data ?? []) as unknown as DisputeRow[];
}

export async function loadDispute(
  supabase: SupabaseServerClient,
  id: string,
): Promise<{ dispute: DisputeRow; messages: DisputeMessageRow[]; refunds: RefundRow[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: dispute } = await supabase
    .from('disputes')
    .select(DISPUTE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (!dispute) return null;

  const [{ data: messages }, { data: refunds }] = await Promise.all([
    supabase
      .from('dispute_messages')
      .select('id, sender_role, body, attachment_path, attachment_name, created_at')
      .eq('dispute_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('refunds')
      .select(REFUND_COLUMNS)
      .eq('dispute_id', id)
      .order('created_at', { ascending: true }),
  ]);

  return {
    dispute: dispute as unknown as DisputeRow,
    messages: (messages ?? []) as DisputeMessageRow[],
    refunds: (refunds ?? []) as RefundRow[],
  };
}

/** Khoản hoàn đang chờ sàn chuyển (trang /admin/disputes). */
export async function loadPendingRefunds(supabase: SupabaseServerClient): Promise<RefundRow[]> {
  const { data } = await supabase
    .from('refunds')
    .select(REFUND_COLUMNS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50);
  return (data ?? []) as RefundRow[];
}

/** Tranh chấp của một đơn, mới nhất trước (trang chi tiết đơn). */
export async function loadOrderDisputes(
  supabase: SupabaseServerClient,
  orderId: string,
): Promise<{ id: string; status: string; reason: string }[]> {
  const { data } = await supabase
    .from('disputes')
    .select('id, status, reason')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

// Mã lỗi từ open_dispute() / add_dispute_message() / admin_mark_refund_paid().
export function disputeErrorMessage(message: string, fallback: string): string {
  if (message.includes('ORDER_NOT_DISPUTABLE')) {
    return 'Chỉ mở tranh chấp cho đơn đã thanh toán và chưa hoàn tất.';
  }
  if (message.includes('DISPUTE_ALREADY_OPEN'))
    return 'Đơn này đang có tranh chấp chưa giải quyết.';
  if (message.includes('DISPUTE_ALREADY_RESOLVED')) {
    return 'Tranh chấp đã được giải quyết. Tải lại trang.';
  }
  if (message.includes('DISPUTE_MESSAGE_LIMIT')) return 'Tranh chấp đã đủ 200 tin trao đổi.';
  if (message.includes('DISPUTE_NOT_FOUND')) return 'Không tìm thấy tranh chấp.';
  if (message.includes('INVALID_MESSAGE')) return 'Nội dung dài 1–2000 ký tự.';
  if (message.includes('INVALID_ATTACHMENT')) return 'File đính kèm chưa tải lên được. Thử lại.';
  if (message.includes('REFUND_ALREADY_PAID')) return 'Khoản hoàn này đã được đánh dấu trước đó.';
  if (message.includes('REFUND_NOT_FOUND')) return 'Không tìm thấy khoản hoàn.';
  if (message.includes('REASON_REQUIRED')) return 'Vui lòng nhập đủ nội dung (10–1000 ký tự).';
  if (message.includes('ORDER_NOT_FOUND')) return 'Không tìm thấy đơn hàng.';
  if (message.includes('FORBIDDEN_NOT_ADMIN')) return 'Chỉ quản trị viên làm được thao tác này.';
  if (message.includes('ACCOUNT_SUSPENDED')) return 'Tài khoản của bạn đang bị tạm khóa.';
  if (message.includes('NOT_AUTHENTICATED')) return 'Vui lòng đăng nhập lại.';
  return fallback;
}
