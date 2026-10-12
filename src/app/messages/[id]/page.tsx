import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui';
import { getUnreadNotificationCount, getNewRfqCount } from '../../supplier/_lib/counts';
import {
  MESSAGE_COLUMNS,
  loadConversations,
  parseContextParam,
  toChatMessage,
  type MessageDbRow,
} from '../_lib/conversations';
import { buildMessagesShell } from '../_lib/shell';
import { ChatClient } from './_components/ChatClient';

export const metadata: Metadata = {
  title: 'Chat — LàngNghề.vn',
};

// Một hội thoại buyer ↔ xưởng (kế hoạch 5.9). `id` là id hội thoại; không tồn
// tại hoặc không phải của người xem (kể cả link kiểu cũ /messages/<rfq id>)
// thì về danh sách. `?ctx=rfq:<id>` gắn ngữ cảnh cho tin đầu tiên gửi đi.
export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ctx?: string }>;
}) {
  const { id } = await params;
  const { ctx } = await searchParams;

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

  // Đánh dấu đã đọc TRƯỚC khi tải danh sách để badge của hội thoại đang mở đúng luôn.
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    await supabase.rpc('mark_conversation_read', { p_conversation_id: id });
  }

  const conversations = await loadConversations(supabase);
  const current = conversations.find((c) => c.id === id);
  if (!current) redirect('/messages');

  const [unreadCount, newRfqCount, { data: messagesData }] = await Promise.all([
    getUnreadNotificationCount(supabase, user.id),
    supplier ? getNewRfqCount(supabase, supplier.id) : Promise.resolve(0),
    // 500 tin gần nhất, hiển thị cũ → mới.
    supabase
      .from('conversation_messages')
      .select(MESSAGE_COLUMNS)
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const { header, navGroups } = buildMessagesShell({
    buyer,
    supplier,
    unreadCount,
    newRfqCount,
    unreadThreadCount: conversations.filter((c) => c.unreadCount > 0).length,
  });

  return (
    <AppShell header={header} navGroups={navGroups}>
      <ChatClient
        key={id}
        conversationId={id}
        myRole={current.myRole}
        counterpart={{
          name: current.counterpartName,
          icon: current.counterpartIcon,
          shopHref: current.myRole === 'buyer' ? `/shops/${current.counterpartId}` : null,
        }}
        initialMessages={((messagesData ?? []) as MessageDbRow[]).map(toChatMessage).reverse()}
        conversations={conversations}
        pendingContext={parseContextParam(ctx)}
      />
    </AppShell>
  );
}
