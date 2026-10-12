import type { createClient } from '@/lib/supabase/server';

// Tin nhắn theo cặp buyer ↔ xưởng (kế hoạch 5.9): bảng conversations +
// conversation_messages, ghi qua RPC start_conversation / send_message /
// mark_conversation_read. Danh sách lấy qua list_conversations() vì buyer và
// xưởng không đọc thẳng hồ sơ của nhau được (RLS) — hàm trả sẵn tên bên kia.
export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ChatRole = 'buyer' | 'supplier';
export type MessageContextType = 'rfq' | 'product' | 'order';

export interface ConversationRow {
  id: string;
  myRole: ChatRole;
  counterpartId: string;
  counterpartName: string;
  counterpartIcon: string;
  lastMessage: string;
  lastMessageIsMine: boolean;
  /** null = hội thoại vừa mở, chưa có tin nào. */
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  senderRole: ChatRole;
  body: string;
  contextType: MessageContextType | null;
  contextId: string | null;
  createdAt: string;
}

export const MESSAGE_COLUMNS = 'id, sender_role, body, context_type, context_id, created_at';

export interface MessageDbRow {
  id: string;
  sender_role: ChatRole;
  body: string;
  context_type: MessageContextType | null;
  context_id: string | null;
  created_at: string;
}

export function toChatMessage(row: MessageDbRow): ChatMessage {
  return {
    id: row.id,
    senderRole: row.sender_role,
    body: row.body,
    contextType: row.context_type,
    contextId: row.context_id,
    createdAt: row.created_at,
  };
}

interface ListRow {
  id: string;
  my_role: ChatRole;
  counterpart_id: string;
  counterpart_name: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_role: ChatRole | null;
  unread: number;
}

// Mọi hội thoại của người đang đăng nhập, mới nhất trước. Tài khoản vừa là
// buyer vừa là xưởng (role 'both') nhận cả hai phía.
export async function loadConversations(
  supabase: SupabaseServerClient,
): Promise<ConversationRow[]> {
  const { data } = await supabase.rpc('list_conversations');
  return ((data ?? []) as ListRow[]).map((row) => ({
    id: row.id,
    myRole: row.my_role,
    counterpartId: row.counterpart_id,
    counterpartName: row.counterpart_name,
    counterpartIcon: row.my_role === 'buyer' ? '🏭' : '🏢',
    lastMessage: row.last_message_preview ?? '',
    lastMessageIsMine: row.last_sender_role === row.my_role,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread,
  }));
}

/** Trang xem ngữ cảnh của một tin theo vai trò người xem. */
export function contextHref(
  type: MessageContextType,
  id: string,
  role: ChatRole,
): { href: string; label: string } {
  if (type === 'product') return { href: `/products/${id}`, label: 'Sản phẩm' };
  if (type === 'order') {
    return {
      href: role === 'buyer' ? `/orders/${id}` : `/supplier/orders/${id}`,
      label: `Đơn #${id.slice(0, 8).toUpperCase()}`,
    };
  }
  return {
    href: role === 'buyer' ? `/rfq/${id}` : `/supplier/rfq/${id}`,
    label: `RFQ #${id.slice(0, 8).toUpperCase()}`,
  };
}

/** `?ctx=rfq:<uuid>` → ngữ cảnh gắn vào tin đầu tiên gửi đi. */
export function parseContextParam(
  value: string | undefined,
): { type: MessageContextType; id: string } | null {
  const match = /^(rfq|product|order):([0-9a-f-]{36})$/i.exec(value ?? '');
  return match ? { type: match[1] as MessageContextType, id: match[2] } : null;
}

// Mã lỗi từ start_conversation() / send_message() → câu tiếng Việt.
export function messageErrorMessage(message: string, fallback: string): string {
  if (message.includes('DIRECT_MESSAGE_DISABLED')) {
    return 'Xưởng này chỉ nhận tin từ buyer đã gửi yêu cầu báo giá hoặc có đơn. Hãy gửi yêu cầu báo giá trước.';
  }
  if (message.includes('NO_RELATIONSHIP')) {
    return 'Chỉ nhắn được cho buyer đã mời bạn báo giá hoặc có đơn chung.';
  }
  if (message.includes('MESSAGE_RATE_LIMIT')) return 'Bạn gửi quá nhanh. Chờ một phút rồi thử lại.';
  if (message.includes('INVALID_MESSAGE')) return 'Tin nhắn dài 1–4000 ký tự.';
  if (message.includes('COUNTERPART_NOT_FOUND')) return 'Không tìm thấy người nhận.';
  if (message.includes('CONVERSATION_NOT_FOUND')) return 'Không tìm thấy hội thoại. Tải lại trang.';
  if (message.includes('NOT_A_PARTICIPANT')) return 'Tài khoản này không nhắn tin ở đây được.';
  if (message.includes('ACCOUNT_SUSPENDED')) return 'Tài khoản của bạn đang bị tạm khóa.';
  if (message.includes('NOT_AUTHENTICATED')) return 'Vui lòng đăng nhập lại.';
  return fallback;
}
