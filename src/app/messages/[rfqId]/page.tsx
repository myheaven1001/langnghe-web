import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui';
import { getUnreadNotificationCount, getNewRfqCount } from '../../supplier/_lib/counts';
import { loadBuyerConversations, loadSupplierConversations } from '../_lib/conversations';
import { buildMessagesShell } from '../_lib/shell';
import {
  ChatDetailClient,
  type ChatMessage,
  type ChatQuoteInfo,
} from './_components/ChatDetailClient';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface ThreadContext {
  rfqTitle: string;
  rfqQuantity: number;
  rfqUnit: string | null;
  quoteId: string | null;
  quoteInfo: ChatQuoteInfo | null;
  counterpart: { name: string; icon: string; verified: boolean; shopHref: string | null };
  rfqDetailHref: string | null;
}

async function resolveBuyerThread(
  supabase: SupabaseServerClient,
  buyerId: string,
  rfqId: string,
  requestedQuoteId: string | undefined,
): Promise<ThreadContext | null> {
  const { data: rfq } = await supabase
    .from('rfq_requests')
    .select('id, title, quantity, unit')
    .eq('id', rfqId)
    .eq('buyer_id', buyerId)
    .maybeSingle();
  if (!rfq) return null;

  const { data: quotesData } = await supabase
    .from('rfq_quotes')
    .select('id, unit_price, status, supplier_id, created_at, supplier_profiles(id, shop_name)')
    .eq('rfq_id', rfqId)
    .order('created_at', { ascending: true });
  const quotes = (quotesData ?? []) as unknown as {
    id: string;
    unit_price: number;
    status: string;
    supplier_id: string;
    supplier_profiles: { id: string; shop_name: string } | null;
  }[];
  if (quotes.length === 0) return null; // chưa có xưởng nào báo giá -> chưa có ai để nhắn tin

  const quote = quotes.find((q) => q.id === requestedQuoteId) ?? quotes[0];

  const { data: verifiedRow } = await supabase
    .from('verifications')
    .select('entity_id')
    .eq('entity_type', 'supplier')
    .eq('status', 'approved')
    .eq('entity_id', quote.supplier_id)
    .maybeSingle();

  return {
    rfqTitle: rfq.title,
    rfqQuantity: rfq.quantity,
    rfqUnit: rfq.unit,
    quoteId: quote.id,
    quoteInfo: { unitPrice: quote.unit_price, status: quote.status },
    counterpart: {
      name: quote.supplier_profiles?.shop_name ?? 'Xưởng',
      icon: '🏭',
      verified: !!verifiedRow,
      shopHref: quote.supplier_profiles ? `/shops/${quote.supplier_profiles.id}` : null,
    },
    rfqDetailHref: `/rfq/${rfqId}`,
  };
}

async function resolveSupplierThread(
  supabase: SupabaseServerClient,
  supplierId: string,
  rfqId: string,
): Promise<ThreadContext | null> {
  const { data: quotesData } = await supabase
    .from('rfq_quotes')
    .select(
      'id, unit_price, status, created_at, rfq_requests(id, title, quantity, unit, buyer_id, buyer_profiles(id, company_name))',
    )
    .eq('rfq_id', rfqId)
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });
  const quotes = (quotesData ?? []) as unknown as {
    id: string;
    unit_price: number;
    status: string;
    rfq_requests: {
      id: string;
      title: string;
      quantity: number;
      unit: string | null;
      buyer_id: string;
      buyer_profiles: { id: string; company_name: string } | null;
    } | null;
  }[];
  // Supplier chưa từng chào giá RFQ này -> không có gì để mở
  const quote = quotes.find((q) => q.status !== 'rejected') ?? quotes[0];
  if (!quote || !quote.rfq_requests) return null;

  const { data: verifiedRow } = await supabase
    .from('verifications')
    .select('entity_id')
    .eq('entity_type', 'buyer')
    .eq('status', 'approved')
    .eq('entity_id', quote.rfq_requests.buyer_id)
    .maybeSingle();

  return {
    rfqTitle: quote.rfq_requests.title,
    rfqQuantity: quote.rfq_requests.quantity,
    rfqUnit: quote.rfq_requests.unit,
    quoteId: quote.id,
    quoteInfo: { unitPrice: quote.unit_price, status: quote.status },
    counterpart: {
      name: quote.rfq_requests.buyer_profiles?.company_name ?? 'Buyer',
      icon: '🏢',
      verified: !!verifiedRow,
      shopHref: null,
    },
    // Chưa có trang chi tiết RFQ riêng cho supplier (chỉ có /supplier/rfq
    // dạng inbox) — không link "Xem RFQ →" tới đâu cụ thể được, ẩn luôn.
    rfqDetailHref: null,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ rfqId: string }>;
}): Promise<Metadata> {
  await params;
  return { title: 'Chat — LàngNghề.vn' };
}

export default async function ChatDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ rfqId: string }>;
  searchParams: Promise<{ quote?: string }>;
}) {
  const { rfqId } = await params;
  const { quote: requestedQuoteId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: buyer }, { data: supplier }] = await Promise.all([
    supabase.from('buyer_profiles').select('id, company_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('supplier_profiles').select('id, shop_name').eq('user_id', user.id).maybeSingle(),
  ]);
  if (!buyer && !supplier) redirect('/');

  const thread = buyer
    ? await resolveBuyerThread(supabase, buyer.id, rfqId, requestedQuoteId)
    : await resolveSupplierThread(supabase, supplier!.id, rfqId);

  if (!thread) redirect('/messages');

  // Đánh dấu đã đọc TRƯỚC khi tải danh sách hội thoại bên trái, để badge
  // "chưa đọc" của chính hội thoại đang mở phản ánh đúng luôn (không phải
  // đợi lần load trang sau).
  await supabase.rpc('mark_thread_read', { p_rfq_id: rfqId, p_quote_id: thread.quoteId });

  const [unreadCount, newRfqCount, conversations, { data: messagesData }] = await Promise.all([
    getUnreadNotificationCount(supabase, user.id),
    supplier ? getNewRfqCount(supabase, supplier.id) : Promise.resolve(0),
    buyer
      ? loadBuyerConversations(supabase, buyer.id)
      : loadSupplierConversations(supabase, supplier!.id),
    supabase
      .from('rfq_messages')
      .select('id, rfq_id, quote_id, sender_id, sender_role, content, created_at')
      .eq('rfq_id', rfqId)
      .order('created_at', { ascending: true })
      .limit(500),
  ]);

  const initialMessages: ChatMessage[] = (
    (messagesData ?? []) as unknown as {
      id: string;
      rfq_id: string;
      quote_id: string | null;
      sender_id: string;
      sender_role: 'buyer' | 'supplier';
      content: string;
      created_at: string;
    }[]
  )
    .filter((m) => m.quote_id === null || m.quote_id === thread.quoteId)
    .map((m) => ({
      id: m.id,
      rfqId: m.rfq_id,
      quoteId: m.quote_id,
      senderId: m.sender_id,
      senderRole: m.sender_role,
      content: m.content,
      createdAt: m.created_at,
    }));

  const unreadThreadCount = conversations.filter((c) => c.unreadCount > 0).length;

  const { header, navGroups } = buildMessagesShell({
    buyer,
    supplier,
    unreadCount,
    newRfqCount,
    unreadThreadCount,
  });

  return (
    <AppShell header={header} navGroups={navGroups}>
      <ChatDetailClient
        rfqId={rfqId}
        quoteId={thread.quoteId}
        myUserId={user.id}
        myRole={buyer ? 'buyer' : 'supplier'}
        rfqTitle={thread.rfqTitle}
        rfqQuantity={thread.rfqQuantity}
        rfqUnit={thread.rfqUnit}
        quoteInfo={thread.quoteInfo}
        counterpart={thread.counterpart}
        rfqDetailHref={thread.rfqDetailHref}
        initialMessages={initialMessages}
        conversations={conversations}
      />
    </AppShell>
  );
}
