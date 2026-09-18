'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatVnd } from '@/lib/format';
import type { ConversationRow } from '../../_lib/conversations';

export interface ChatMessage {
  id: string;
  rfqId: string;
  quoteId: string | null;
  senderId: string;
  senderRole: 'buyer' | 'supplier';
  content: string;
  createdAt: string;
}

export interface ChatQuoteInfo {
  unitPrice: number;
  status: string;
}

const QUICK_REPLIES = [
  'Cảm ơn xưởng, mình đã nhận được báo giá.',
  'Xưởng có thể giảm giá thêm không ạ?',
  'Khi nào có thể gửi mẫu ạ?',
];

function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateSepLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const dateStr = d.toLocaleDateString('vi-VN');
  if (isSameDay(d, now)) return `Hôm nay, ${dateStr}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return `Hôm qua, ${dateStr}`;
  return dateStr;
}

function threadHref(row: ConversationRow) {
  return row.quoteId ? `/messages/${row.rfqId}?quote=${row.quoteId}` : `/messages/${row.rfqId}`;
}

export function ChatDetailClient({
  rfqId,
  quoteId,
  myUserId,
  myRole,
  rfqTitle,
  rfqQuantity,
  rfqUnit,
  quoteInfo,
  counterpart,
  rfqDetailHref,
  initialMessages,
  conversations,
}: {
  rfqId: string;
  quoteId: string | null;
  myUserId: string;
  myRole: 'buyer' | 'supplier';
  rfqTitle: string;
  rfqQuantity: number;
  rfqUnit: string | null;
  quoteInfo: ChatQuoteInfo | null;
  counterpart: { name: string; icon: string; verified: boolean; shopHref: string | null };
  rfqDetailHref: string | null;
  initialMessages: ChatMessage[];
  conversations: ConversationRow[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachNote, setAttachNote] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set(initialMessages.map((m) => m.id)));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  // Realtime chỉ lọc được 1 cột trong `filter` (rfq_id) — quote_id (đúng
  // thread hiện tại hoặc broadcast NULL) lọc thêm ở client. RLS
  // (rfq_messages_select) vẫn là hàng rào thật: server không gửi xuống
  // event nào mình không có quyền SELECT dù filter client có đúng hay không.
  useEffect(() => {
    const channel = supabase
      .channel(`rfq_messages_${rfqId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rfq_messages', filter: `rfq_id=eq.${rfqId}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            rfq_id: string;
            quote_id: string | null;
            sender_id: string;
            sender_role: 'buyer' | 'supplier';
            content: string;
            created_at: string;
          };
          if (row.quote_id !== null && row.quote_id !== quoteId) return;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setMessages((prev) => [
            ...prev,
            {
              id: row.id,
              rfqId: row.rfq_id,
              quoteId: row.quote_id,
              senderId: row.sender_id,
              senderRole: row.sender_role,
              content: row.content,
              createdAt: row.created_at,
            },
          ]);
          if (row.sender_role !== myRole) {
            supabase.rpc('mark_thread_read', { p_rfq_id: rfqId, p_quote_id: quoteId }).then(() => {
              router.refresh();
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ cần resubscribe khi đổi hội thoại
  }, [rfqId, quoteId, myRole]);

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('rfq_messages')
      .insert({
        rfq_id: rfqId,
        quote_id: quoteId,
        sender_id: myUserId,
        sender_role: myRole,
        content,
      })
      .select('id, rfq_id, quote_id, sender_id, sender_role, content, created_at')
      .single();

    setSending(false);

    if (insertError || !data) {
      setError('Không gửi được tin nhắn. Vui lòng thử lại.');
      return;
    }

    seenIds.current.add(data.id);
    setMessages((prev) => [
      ...prev,
      {
        id: data.id,
        rfqId: data.rfq_id,
        quoteId: data.quote_id,
        senderId: data.sender_id,
        senderRole: data.sender_role,
        content: data.content,
        createdAt: data.created_at,
      },
    ]);
    setInput('');
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 130px)' }}>
      <div className="text-brand-light mb-2.5 flex shrink-0 items-center gap-1.5 text-[11.5px]">
        <Link href="/messages" className="text-brand-sub hover:text-brand-red">
          Nhắn tin
        </Link>
        <span>/</span>
        <span className="truncate">{counterpart.name}</span>
      </div>

      <div className="border-brand-border flex min-h-0 flex-1 gap-0 overflow-hidden rounded-[10px] border bg-white">
        {/* Danh sách hội thoại (thu gọn trên mobile) */}
        <aside className="border-brand-border hidden w-[260px] shrink-0 flex-col overflow-hidden border-r md:flex">
          <div className="border-brand-border shrink-0 border-b p-3.5 text-sm font-bold">
            Nhắn tin
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="text-brand-light p-4 text-center text-[11.5px]">
                Chưa có hội thoại nào.
              </div>
            ) : (
              conversations.map((c) => {
                const active = c.rfqId === rfqId && c.quoteId === quoteId;
                return (
                  <Link
                    key={c.quoteId ?? c.rfqId}
                    href={threadHref(c)}
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
                      <div className="truncate text-[12.5px] font-bold">{c.counterpartName}</div>
                      <div className="text-brand-sub truncate text-[11px]">
                        {c.lastMessageIsMine && <span className="text-brand-light">Bạn: </span>}
                        {c.lastMessage}
                      </div>
                    </div>
                    {c.unreadCount > 0 && !active && (
                      <span className="bg-brand-red shrink-0 rounded-lg px-[5px] py-px text-[9px] font-bold text-white">
                        {c.unreadCount}
                      </span>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </aside>

        {/* Chat pane */}
        <div className="bg-brand-bg flex min-h-0 flex-1 flex-col">
          <div className="border-brand-border flex shrink-0 items-center gap-3 border-b bg-white p-3 px-5">
            <div className="bg-brand-bg flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-lg">
              {counterpart.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-bold">
                <span className="truncate">{counterpart.name}</span>
                {counterpart.verified && (
                  <span className="bg-status-green-soft text-status-green shrink-0 rounded-lg px-1.5 py-px text-[9px] font-bold">
                    ✓ Đã xác minh
                  </span>
                )}
              </div>
            </div>
            {counterpart.shopHref && (
              <Link
                href={counterpart.shopHref}
                className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink ml-auto flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border-[1.5px] bg-white text-sm"
                title="Xem gian hàng"
              >
                🏪
              </Link>
            )}
          </div>

          {(quoteInfo || rfqDetailHref) && (
            <div className="flex shrink-0 items-center gap-2.5 border-b border-[#FFD6A8] bg-[#FFF8F0] px-5 py-2.5 text-xs text-[#7A4D0E]">
              📋{' '}
              <span className="min-w-0 truncate">
                <b className="text-[#5C3A08]">RFQ:</b> {rfqTitle} —{' '}
                {rfqQuantity.toLocaleString('vi-VN')} {rfqUnit ?? ''}
                {quoteInfo && (
                  <>
                    {' '}
                    · báo giá <b className="text-[#5C3A08]">{formatVnd(quoteInfo.unitPrice)}</b>
                  </>
                )}
              </span>
              {rfqDetailHref && (
                <Link
                  href={rfqDetailHref}
                  className="text-brand-red ml-auto shrink-0 font-semibold whitespace-nowrap"
                >
                  Xem RFQ →
                </Link>
              )}
            </div>
          )}

          <div ref={scrollRef} className="flex flex-1 flex-col gap-1 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <div className="text-brand-light m-auto text-center text-xs">
                Chưa có tin nhắn nào. Gửi lời chào để bắt đầu trao đổi nhé.
              </div>
            ) : (
              messages.map((m, i) => {
                const prev = messages[i - 1];
                const showSep =
                  !prev || !isSameDay(new Date(prev.createdAt), new Date(m.createdAt));
                const mine = m.senderRole === myRole;
                return (
                  <div key={m.id}>
                    {showSep && (
                      <div className="text-brand-light my-3.5 text-center text-[10.5px]">
                        {dateSepLabel(m.createdAt)}
                      </div>
                    )}
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[64%] ${mine ? 'text-right' : 'text-left'}`}>
                        <div
                          className={`rounded-[14px] px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
                            mine
                              ? 'bg-brand-red rounded-br-[4px] text-white'
                              : 'border-brand-border rounded-bl-[4px] border bg-white'
                          }`}
                        >
                          {m.content}
                        </div>
                        <div className="text-brand-light mt-0.5 px-1 text-[9.5px]">
                          {formatMsgTime(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-brand-border shrink-0 border-t bg-white p-3 px-4">
            {error && <div className="text-status-red mb-2 text-[11.5px]">{error}</div>}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_REPLIES.map((qr) => (
                <button
                  key={qr}
                  type="button"
                  onClick={() => setInput(qr)}
                  className="border-brand-border text-brand-sub hover:border-brand-red hover:text-brand-red rounded-full border-[1.5px] bg-white px-2.5 py-1 text-[11px]"
                >
                  {qr}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div className="relative shrink-0">
                <button
                  type="button"
                  title="Đính kèm (chưa hỗ trợ)"
                  onClick={() => setAttachNote((v) => !v)}
                  className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink flex h-9 w-9 items-center justify-center rounded-lg border-[1.5px] bg-white text-sm"
                >
                  📎
                </button>
                {attachNote && (
                  <div className="text-brand-light border-brand-border absolute bottom-11 left-0 w-max max-w-[220px] rounded-lg border bg-white p-2 text-[10.5px] shadow-md">
                    🚧 Đính kèm file chưa được hỗ trợ.
                  </div>
                )}
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder="Nhập tin nhắn..."
                className="border-brand-border focus:border-brand-red max-h-[100px] min-h-[38px] flex-1 resize-none rounded-[10px] border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
              />
              <button
                type="button"
                disabled={sending || !input.trim()}
                onClick={handleSend}
                className="bg-brand-red hover:bg-brand-red-dark h-[38px] shrink-0 rounded-lg px-4 text-xs font-semibold text-white disabled:opacity-60"
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
