import type { createClient } from '@/lib/supabase/server';

// Dùng chung giữa /messages (5.1 — danh sách hội thoại) và /messages/[rfqId]
// (5.2 — cột hội thoại bên trái trong chat chi tiết) để không lặp lại cùng
// 1 logic group-by-thread ở 2 nơi.
export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface ConversationRow {
  rfqId: string;
  quoteId: string | null;
  rfqTag: string;
  counterpartName: string;
  counterpartIcon: string;
  lastMessage: string;
  lastMessageIsMine: boolean;
  lastMessageAt: string;
  unreadCount: number;
}

interface MessageRow {
  id: string;
  rfq_id: string;
  quote_id: string | null;
  sender_role: 'buyer' | 'supplier';
  content: string;
  created_at: string;
  read_at: string | null;
}

// Gộp danh sách tin nhắn phẳng thành 1 dòng/hội thoại: khoá nhóm là
// quote_id (1 supplier ↔ 1 rfq, do uq_quote_active_per_supplier), hoặc
// `rfq_id` khi tin broadcast (quote_id NULL) chưa gắn vào 1 supplier cụ
// thể nào — vẫn đúng tinh thần "group theo rfq_id" của roadmap (RFQ vẫn
// là ngữ cảnh hiển thị qua rfqTag) nhưng không gộp nhầm 2 xưởng khác
// nhau vào chung 1 dòng khi RFQ multi-target có nhiều xưởng đã báo giá.
function buildConversations(
  messages: MessageRow[],
  counterpartOf: (rfqId: string, quoteId: string | null) => { name: string; icon: string } | null,
  rfqTagOf: (rfqId: string) => string,
  myRole: 'buyer' | 'supplier',
): ConversationRow[] {
  const byThread = new Map<string, MessageRow[]>();
  for (const m of messages) {
    const key = m.quote_id ?? `rfq:${m.rfq_id}`;
    const list = byThread.get(key);
    if (list) list.push(m);
    else byThread.set(key, [m]);
  }

  const rows: ConversationRow[] = [];
  for (const [, list] of byThread) {
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const last = list[0];
    const counterpart = counterpartOf(last.rfq_id, last.quote_id);
    if (!counterpart) continue; // không xác định được đối phương -> bỏ qua, tránh hiển thị sai người
    rows.push({
      rfqId: last.rfq_id,
      quoteId: last.quote_id,
      rfqTag: rfqTagOf(last.rfq_id),
      counterpartName: counterpart.name,
      counterpartIcon: counterpart.icon,
      lastMessage: last.content,
      lastMessageIsMine: last.sender_role === myRole,
      lastMessageAt: last.created_at,
      unreadCount: list.filter((m) => m.sender_role !== myRole && !m.read_at).length,
    });
  }

  rows.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  return rows;
}

export async function loadBuyerConversations(supabase: SupabaseServerClient, buyerId: string) {
  const { data: rfqsData } = await supabase
    .from('rfq_requests')
    .select('id, title')
    .eq('buyer_id', buyerId);
  const rfqs = rfqsData ?? [];
  if (rfqs.length === 0) return [];

  const rfqIds = rfqs.map((r) => r.id);
  const rfqTitleById = new Map(rfqs.map((r) => [r.id as string, r.title as string]));

  const [{ data: quotesData }, { data: messagesData }] = await Promise.all([
    supabase
      .from('rfq_quotes')
      .select('id, rfq_id, supplier_profiles(shop_name)')
      .in('rfq_id', rfqIds),
    supabase
      .from('rfq_messages')
      .select('id, rfq_id, quote_id, sender_role, content, created_at, read_at')
      .in('rfq_id', rfqIds),
  ]);

  const quotes = (quotesData ?? []) as unknown as {
    id: string;
    rfq_id: string;
    supplier_profiles: { shop_name: string } | null;
  }[];
  const shopNameByQuoteId = new Map(
    quotes.map((q) => [q.id, q.supplier_profiles?.shop_name ?? 'Xưởng']),
  );

  return buildConversations(
    (messagesData ?? []) as MessageRow[],
    (rfqId, quoteId) => {
      if (quoteId) return { name: shopNameByQuoteId.get(quoteId) ?? 'Xưởng', icon: '🏭' };
      // Broadcast (quote_id NULL): RFQ single-target chỉ có tối đa 1 xưởng,
      // lấy luôn tên xưởng đó nếu đã có báo giá.
      const soleQuote = quotes.find((q) => q.rfq_id === rfqId);
      return { name: soleQuote?.supplier_profiles?.shop_name ?? 'Xưởng', icon: '🏭' };
    },
    (rfqId) => rfqTitleById.get(rfqId) ?? 'RFQ',
    'buyer',
  );
}

export async function loadSupplierConversations(
  supabase: SupabaseServerClient,
  supplierId: string,
) {
  const { data: quotesData } = await supabase
    .from('rfq_quotes')
    .select('id, rfq_id, rfq_requests(id, title, buyer_profiles(company_name))')
    .eq('supplier_id', supplierId);

  const quotes = (quotesData ?? []) as unknown as {
    id: string;
    rfq_id: string;
    rfq_requests: {
      id: string;
      title: string;
      buyer_profiles: { company_name: string } | null;
    } | null;
  }[];
  if (quotes.length === 0) return [];

  const rfqIds = [...new Set(quotes.map((q) => q.rfq_id))];
  const rfqTitleById = new Map(quotes.map((q) => [q.rfq_id, q.rfq_requests?.title ?? 'RFQ']));
  const buyerNameByRfqId = new Map(
    quotes.map((q) => [q.rfq_id, q.rfq_requests?.buyer_profiles?.company_name ?? 'Buyer']),
  );
  const quoteIdByRfqId = new Map(quotes.map((q) => [q.rfq_id, q.id]));

  // Không cần lọc quote_id ở query — rfq_messages_select (RLS) đã tự giới
  // hạn đúng tin nhắn của quote mình + broadcast của rfq mình đã báo giá.
  const { data: messagesData } = await supabase
    .from('rfq_messages')
    .select('id, rfq_id, quote_id, sender_role, content, created_at, read_at')
    .in('rfq_id', rfqIds);

  return buildConversations(
    (messagesData ?? []) as MessageRow[],
    (rfqId, quoteId) => {
      // Chỉ nhận tin nếu đúng quote của mình hoặc broadcast của rfq mình đã báo giá
      if (quoteId && quoteId !== quoteIdByRfqId.get(rfqId)) return null;
      return { name: buyerNameByRfqId.get(rfqId) ?? 'Buyer', icon: '🏢' };
    },
    (rfqId) => rfqTitleById.get(rfqId) ?? 'RFQ',
    'supplier',
  );
}
