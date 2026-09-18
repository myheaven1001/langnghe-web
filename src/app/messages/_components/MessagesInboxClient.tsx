'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatVnDate } from '@/lib/format';
import type { ConversationRow } from '../_lib/conversations';

type TabKey = 'all' | 'unread';

// Cùng phong cách rút gọn "12 phút / 1 giờ / Hôm qua" như .convo-time trong
// messages_inbox_page.html — khác formatRelativeTime() ở dashboard (có
// "trước") vì ở đây không gian hẹp hơn (nằm cạnh badge số chưa đọc).
function convoTime(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hôm qua';
  if (days < 30) return `${days} ngày`;
  return formatVnDate(iso);
}

function threadHref(row: ConversationRow) {
  return row.quoteId ? `/messages/${row.rfqId}?quote=${row.quoteId}` : `/messages/${row.rfqId}`;
}

// Danh sách hội thoại đã tải hết ở server component cha (quy mô 1
// buyer/supplier thấy được nhỏ) — tab/search lọc ở đây, giống RfqInboxClient.
export function MessagesInboxClient({ conversations }: { conversations: ConversationRow[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('all');
  const [q, setQ] = useState('');
  const [markingRead, setMarkingRead] = useState(false);

  const totalUnread = useMemo(
    () => conversations.filter((c) => c.unreadCount > 0).length,
    [conversations],
  );

  const filtered = useMemo(() => {
    let list = tab === 'unread' ? conversations.filter((c) => c.unreadCount > 0) : conversations;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.counterpartName.toLowerCase().includes(needle) ||
          c.rfqTag.toLowerCase().includes(needle) ||
          c.lastMessage.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [conversations, tab, q]);

  async function handleMarkAllRead() {
    setMarkingRead(true);
    const supabase = createClient();
    await supabase.rpc('mark_all_messages_read');
    setMarkingRead(false);
    router.refresh();
  }

  return (
    <div>
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Nhắn tin</span>
      </div>

      <div className="mb-[18px]">
        <div className="text-xl font-bold">Nhắn tin</div>
        <div className="text-brand-sub mt-1 text-[12.5px]">
          {conversations.length} cuộc hội thoại · {totalUnread} chưa đọc
        </div>
      </div>

      <div className="border-brand-border mb-4 flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setTab('all')}
          className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[12.5px] font-semibold whitespace-nowrap ${
            tab === 'all'
              ? 'border-brand-red text-brand-red'
              : 'text-brand-sub hover:text-brand-red border-transparent'
          }`}
        >
          Tất cả
          <span
            className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${
              tab === 'all' ? 'bg-status-red-soft text-brand-red' : 'bg-brand-bg text-brand-sub'
            }`}
          >
            {conversations.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab('unread')}
          className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[12.5px] font-semibold whitespace-nowrap ${
            tab === 'unread'
              ? 'border-brand-red text-brand-red'
              : 'text-brand-sub hover:text-brand-red border-transparent'
          }`}
        >
          Chưa đọc
          <span
            className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${
              tab === 'unread' ? 'bg-status-red-soft text-brand-red' : 'bg-brand-bg text-brand-sub'
            }`}
          >
            {totalUnread}
          </span>
        </button>
      </div>

      <div className="mb-3.5 flex items-center gap-2.5">
        <div className="relative flex-1">
          <span className="text-brand-light pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs">
            🔍
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên xưởng, nội dung tin nhắn..."
            className="border-brand-border focus:border-brand-red w-full rounded-lg border py-2 pr-3 pl-8 text-[12.5px] outline-none"
          />
        </div>
        <button
          type="button"
          disabled={markingRead || totalUnread === 0}
          onClick={handleMarkAllRead}
          className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink shrink-0 rounded-lg border-[1.5px] bg-white px-3.5 py-2 text-xs font-semibold whitespace-nowrap disabled:cursor-default disabled:opacity-50"
        >
          {markingRead ? 'Đang xử lý...' : '✓ Đánh dấu đã đọc tất cả'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-[50px] text-center">
          <div className="mb-2.5 text-[32px]">💬</div>
          <div className="mb-1.5 text-sm font-bold">
            {tab === 'unread' ? 'Không có tin nhắn chưa đọc' : 'Chưa có cuộc hội thoại nào'}
          </div>
          <div className="text-brand-sub text-xs">
            {tab === 'unread'
              ? 'Bạn đã xem hết các cuộc hội thoại.'
              : 'Nhắn tin sẽ xuất hiện khi có trao đổi quanh một RFQ.'}
          </div>
        </div>
      ) : (
        <div className="border-brand-border overflow-hidden rounded-[10px] border bg-white">
          {filtered.map((c) => {
            const unread = c.unreadCount > 0;
            return (
              <Link
                key={c.quoteId ?? c.rfqId}
                href={threadHref(c)}
                className={`border-brand-border/70 relative flex items-center gap-3 border-b p-3.5 px-4 transition-colors last:border-b-0 hover:bg-[#FAFAF8] ${
                  unread ? 'bg-[#FFFBF8]' : ''
                }`}
              >
                {unread && <span className="bg-brand-red absolute top-0 bottom-0 left-0 w-[3px]" />}
                <div className="bg-brand-bg flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-lg">
                  {c.counterpartIcon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span
                      className={`text-brand-ink truncate text-[13px] ${unread ? 'font-extrabold' : 'font-bold'}`}
                    >
                      {c.counterpartName}
                    </span>
                    <span className="text-brand-clay shrink-0 rounded-[5px] bg-[#FDF1E9] px-1.5 py-px text-[9.5px] font-semibold">
                      {c.rfqTag}
                    </span>
                  </div>
                  <div
                    className={`truncate text-xs ${unread ? 'text-brand-ink font-medium' : 'text-brand-sub'}`}
                  >
                    {c.lastMessageIsMine && <span className="text-brand-light">Bạn: </span>}
                    {c.lastMessage}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
                  <div
                    className={`text-[10.5px] ${unread ? 'text-brand-red font-semibold' : 'text-brand-light'}`}
                  >
                    {convoTime(c.lastMessageAt)}
                  </div>
                  {unread && (
                    <span className="bg-brand-red min-w-[16px] rounded-full px-1.5 py-px text-center text-[10px] font-bold text-white">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
