'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  MESSAGE_COLUMNS,
  contextHref,
  messageErrorMessage,
  toChatMessage,
  type ChatMessage,
  type ChatRole,
  type ConversationRow,
  type MessageContextType,
  type MessageDbRow,
} from '../../_lib/conversations';

function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

// Một hội thoại buyer ↔ xưởng (kế hoạch 5.9). Gửi qua RPC send_message();
// tin mới của cả hai phía về qua Realtime trên conversation_messages (RLS chỉ
// phát cho người trong hội thoại). Nhận tin của bên kia khi đang mở thì đánh
// dấu đã đọc luôn. `pendingContext` (từ ?ctx=) gắn vào tin đầu tiên gửi đi.
export function ChatClient({
  conversationId,
  myRole,
  counterpart,
  initialMessages,
  conversations,
  pendingContext,
}: {
  conversationId: string;
  myRole: ChatRole;
  counterpart: { name: string; icon: string; shopHref: string | null };
  initialMessages: ChatMessage[];
  conversations: ConversationRow[];
  pendingContext: { type: MessageContextType; id: string } | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState(pendingContext);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set(initialMessages.map((m) => m.id)));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  useEffect(() => {
    const channel = supabase
      .channel(`conversation_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageDbRow;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setMessages((prev) => [...prev, toChatMessage(row)]);
          if (row.sender_role !== myRole) {
            supabase
              .rpc('mark_conversation_read', { p_conversation_id: conversationId })
              .then(() => router.refresh());
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ cần resubscribe khi đổi hội thoại
  }, [conversationId, myRole]);

  async function handleSend() {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);

    const { data: messageId, error: sendError } = await supabase.rpc('send_message', {
      p_conversation_id: conversationId,
      p_body: body,
      p_context_type: context?.type ?? null,
      p_context_id: context?.id ?? null,
    });
    if (sendError || !messageId) {
      setSending(false);
      setError(
        messageErrorMessage(sendError?.message ?? '', 'Không gửi được tin nhắn. Vui lòng thử lại.'),
      );
      return;
    }

    // Lấy lại đúng dòng vừa ghi (giờ server) — Realtime có thể đã đưa về trước.
    const { data: row } = await supabase
      .from('conversation_messages')
      .select(MESSAGE_COLUMNS)
      .eq('id', messageId as string)
      .maybeSingle();
    setSending(false);
    if (row && !seenIds.current.has(row.id)) {
      seenIds.current.add(row.id);
      setMessages((prev) => [...prev, toChatMessage(row as MessageDbRow)]);
    }
    setInput('');
    setContext(null);
  }

  const pending = context ? contextHref(context.type, context.id, myRole) : null;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 150px)', minHeight: 420 }}>
      <div className="text-brand-light mb-2.5 flex shrink-0 items-center gap-1.5 text-xs">
        <Link href="/messages" className="text-brand-sub hover:text-brand-red">
          Nhắn tin
        </Link>
        <span>/</span>
        <span className="truncate">{counterpart.name}</span>
      </div>

      <div className="border-brand-border flex min-h-0 flex-1 gap-0 overflow-hidden rounded-[10px] border bg-white">
        {/* Danh sách hội thoại (ẩn trên điện thoại) */}
        <aside className="border-brand-border hidden w-[260px] shrink-0 flex-col overflow-hidden border-r md:flex">
          <div className="border-brand-border shrink-0 border-b p-3.5 text-sm font-bold">
            Nhắn tin
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((c) => {
              const active = c.id === conversationId;
              return (
                <Link
                  key={c.id}
                  href={`/messages/${c.id}`}
                  className={`border-brand-border/60 relative flex items-center gap-2.5 border-b p-3 transition-colors last:border-b-0 ${
                    active
                      ? 'bg-[#FFF0F0]'
                      : c.unreadCount > 0
                        ? 'bg-[#FFFBF8] hover:bg-[#FAFAF8]'
                        : 'hover:bg-[#FAFAF8]'
                  }`}
                >
                  {active && (
                    <span className="bg-brand-red absolute top-0 bottom-0 left-0 w-[3px]" />
                  )}
                  <div className="bg-brand-bg flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] text-base">
                    {c.counterpartIcon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold">{c.counterpartName}</div>
                    <div className="text-brand-sub truncate text-xs">
                      {c.lastMessageIsMine && <span className="text-brand-light">Bạn: </span>}
                      {c.lastMessage || 'Chưa có tin nhắn'}
                    </div>
                  </div>
                  {c.unreadCount > 0 && !active && (
                    <span className="bg-brand-red shrink-0 rounded-lg px-[5px] py-px text-xs font-bold text-white">
                      {c.unreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </aside>

        {/* Khung chat */}
        <div className="bg-brand-bg flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-brand-border flex shrink-0 items-center gap-3 border-b bg-white p-3 px-4">
            <div className="bg-brand-bg flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-lg">
              {counterpart.icon}
            </div>
            <div className="min-w-0 flex-1 truncate text-sm font-bold">{counterpart.name}</div>
            {counterpart.shopHref && (
              <Link
                href={counterpart.shopHref}
                className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-[1.5px] bg-white text-sm"
                title="Xem gian hàng"
              >
                🏪
              </Link>
            )}
          </div>

          <div ref={scrollRef} className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="text-brand-light m-auto text-center text-xs">
                Chưa có tin nhắn nào. Gửi lời chào để bắt đầu trao đổi nhé.
              </div>
            ) : (
              messages.map((m, i) => {
                const prev = messages[i - 1];
                const showSep = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
                const mine = m.senderRole === myRole;
                // Chỉ hiện nhãn ngữ cảnh khi đổi chủ đề so với tin trước.
                const showContext =
                  m.contextType &&
                  m.contextId &&
                  (prev?.contextType !== m.contextType || prev?.contextId !== m.contextId);
                const ctx = showContext ? contextHref(m.contextType!, m.contextId!, myRole) : null;
                return (
                  <div key={m.id}>
                    {showSep && (
                      <div className="text-brand-light my-3.5 text-center text-xs">
                        {dayKey(m.createdAt)}
                      </div>
                    )}
                    {ctx && (
                      <div className="my-2 text-center">
                        <Link
                          href={ctx.href}
                          className="text-brand-clay inline-block rounded-full bg-[#FDF1E9] px-2.5 py-1 text-xs font-semibold"
                        >
                          Về: {ctx.label} →
                        </Link>
                      </div>
                    )}
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[82%] md:max-w-[64%] ${mine ? 'text-right' : 'text-left'}`}
                      >
                        <div
                          className={`inline-block rounded-[14px] px-3.5 py-2.5 text-left text-[13px] leading-relaxed break-words whitespace-pre-line ${
                            mine
                              ? 'bg-brand-red rounded-br-[4px] text-white'
                              : 'border-brand-border rounded-bl-[4px] border bg-white'
                          }`}
                        >
                          {m.body}
                        </div>
                        <div className="text-brand-light mt-0.5 px-1 text-xs">
                          {formatMsgTime(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-brand-border shrink-0 border-t bg-white p-3">
            {error && <div className="text-status-red mb-2 text-xs">{error}</div>}
            {pending && (
              <div className="text-brand-sub mb-2 flex items-center gap-2 text-xs">
                <span className="text-brand-clay min-w-0 truncate rounded-full bg-[#FDF1E9] px-2.5 py-1 font-semibold">
                  Về: {pending.label}
                </span>
                <button
                  type="button"
                  onClick={() => setContext(null)}
                  className="text-brand-light min-h-8 shrink-0"
                  aria-label="Bỏ ngữ cảnh"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder="Nhập tin nhắn..."
                className="border-brand-border focus:border-brand-red max-h-[100px] min-h-10 flex-1 resize-none rounded-[10px] border-[1.5px] px-3 py-2 text-base outline-none lg:text-[13px]"
              />
              <button
                type="button"
                disabled={sending || !input.trim()}
                onClick={handleSend}
                className="bg-brand-red hover:bg-brand-red-dark h-10 shrink-0 rounded-lg px-4 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {sending ? 'Đang gửi...' : 'Gửi'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
