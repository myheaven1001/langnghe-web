'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/ui';
import { buildSupplierNavGroups } from '../../supplier/_lib/nav';

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

type Category = 'rfq' | 'order' | 'account';
type TabKey = 'all' | 'unread' | Category;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unread', label: 'Chưa đọc' },
  { key: 'rfq', label: 'RFQ & báo giá' },
  { key: 'order', label: 'Đơn hàng' },
  { key: 'account', label: 'Tài khoản' },
];

// Icon/màu/nhóm cho từng notification_type (enum ở
// 20260905120000_extensions_and_enums.sql, +quote_rejected ở
// 20260919090000, +dispute_opened/dispute_resolved ở 20260930090100).
// quota_low/credit_low khai báo sẵn nhưng MVP chưa emit (xem comment enum
// gốc) — vẫn map ở đây để khi Sprint 2 bắt đầu emit thì trang này không
// cần sửa gì thêm.
const NOTIFICATION_META: Record<string, { icon: string; bg: string; category: Category }> = {
  rfq_received: { icon: '📋', bg: '#E8F1FF', category: 'rfq' },
  quote_received: { icon: '💰', bg: '#FFF0E0', category: 'rfq' },
  quote_accepted: { icon: '🤝', bg: '#E1F5EE', category: 'rfq' },
  quote_rejected: { icon: '✕', bg: '#FDECEC', category: 'rfq' },
  rfq_expired: { icon: '⏰', bg: '#F0EFEC', category: 'rfq' },
  order_confirmed: { icon: '✓', bg: '#E1F5EE', category: 'order' },
  order_shipped: { icon: '🚚', bg: '#E8F1FF', category: 'order' },
  order_delivered: { icon: '📬', bg: '#E1F5EE', category: 'order' },
  dispute_opened: { icon: '⚠️', bg: '#FDECEC', category: 'order' },
  dispute_resolved: { icon: '⚖️', bg: '#E1F5EE', category: 'order' },
  verification_approved: { icon: '✅', bg: '#E1F5EE', category: 'account' },
  verification_rejected: { icon: '⚠️', bg: '#FDECEC', category: 'account' },
  account_suspended: { icon: '🚫', bg: '#FDECEC', category: 'account' },
  quota_low: { icon: '⚠️', bg: '#FFF0E0', category: 'account' },
  credit_low: { icon: '🎟️', bg: '#FDECEC', category: 'account' },
};

function metaFor(type: string) {
  return NOTIFICATION_META[type] ?? { icon: '🔔', bg: '#F0EFEC', category: 'account' as Category };
}

// payload.rfq_id / order_id -> route thật đúng theo role — khớp comment gốc
// "order_id, rfq_id, quote_id... để link đúng trang" ở bảng notifications.
// Vài type chưa có trang chi tiết riêng cho supplier (không có
// /supplier/rfq/[id] hay /supplier/orders/[id]) nên trỏ về trang danh sách.
function resolveHref(n: NotificationRow, role: 'buyer' | 'supplier'): string | null {
  const rfqId = typeof n.payload?.rfq_id === 'string' ? n.payload.rfq_id : null;
  const orderId = typeof n.payload?.order_id === 'string' ? n.payload.order_id : null;

  switch (n.type) {
    case 'rfq_received':
      return '/supplier/rfq';
    case 'quote_received':
    case 'rfq_expired':
      return rfqId ? `/rfq/${rfqId}` : '/rfq';
    case 'quote_accepted':
    case 'quote_rejected':
      return role === 'supplier' ? '/supplier/rfq' : rfqId ? `/rfq/${rfqId}` : '/rfq';
    case 'order_confirmed':
    case 'order_shipped':
    case 'order_delivered':
    case 'dispute_opened':
    case 'dispute_resolved':
      return role === 'buyer' && orderId ? `/orders/${orderId}` : '/supplier/orders';
    case 'verification_approved':
    case 'verification_rejected':
      return role === 'buyer' ? '/settings/profile' : '/supplier/settings/profile';
    case 'quota_low':
    case 'credit_low':
      return '/settings/membership';
    default:
      return null;
  }
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const minutes = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days === 1)
    return `Hôm qua, ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('vi-VN');
}

function dayGroupOf(iso: string): 'Hôm nay' | 'Hôm qua' | 'Tuần này' | 'Cũ hơn' {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return 'Hôm nay';
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays <= 7) return 'Tuần này';
  return 'Cũ hơn';
}

const DAY_GROUP_ORDER = ['Hôm nay', 'Hôm qua', 'Tuần này', 'Cũ hơn'] as const;

export function NotificationsClient({
  userId,
  role,
  buyer,
  supplier,
  newRfqCount,
  unreadMessageThreadCount,
  initialNotifications,
}: {
  userId: string;
  role: 'buyer' | 'supplier';
  buyer: { id: string; company_name: string } | null;
  supplier: { id: string; shop_name: string } | null;
  newRfqCount: number;
  unreadMessageThreadCount: number;
  initialNotifications: NotificationRow[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [tab, setTab] = useState<TabKey>('all');
  const [markingAll, setMarkingAll] = useState(false);
  const seenIds = useRef(new Set(initialNotifications.map((n) => n.id)));

  // Realtime: tin mới -> thêm vào đầu danh sách + badge tự tăng. Tin bị
  // update (vd. mark-all-read từ tab khác) -> đồng bộ lại trạng thái đã đọc
  // ở tab này, để badge luôn khớp thực tế ("cập nhật badge số chưa đọc live").
  useEffect(() => {
    const channel = supabase
      .channel(`notifications_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setNotifications((prev) => [row, ...prev]);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          setNotifications((prev) => prev.map((n) => (n.id === row.id ? row : n)));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = {
      all: notifications.length,
      unread: 0,
      rfq: 0,
      order: 0,
      account: 0,
    };
    notifications.forEach((n) => {
      if (!n.is_read) c.unread++;
      c[metaFor(n.type).category]++;
    });
    return c;
  }, [notifications]);

  const filtered = useMemo(() => {
    if (tab === 'all') return notifications;
    if (tab === 'unread') return notifications.filter((n) => !n.is_read);
    return notifications.filter((n) => metaFor(n.type).category === tab);
  }, [notifications, tab]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, NotificationRow[]>();
    for (const n of filtered) {
      const g = dayGroupOf(n.created_at);
      const list = byGroup.get(g);
      if (list) list.push(n);
      else byGroup.set(g, [n]);
    }
    return DAY_GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({
      label: g,
      items: byGroup.get(g)!,
    }));
  }, [filtered]);

  async function markOneRead(n: NotificationRow) {
    if (n.is_read) return;
    setNotifications((prev) =>
      prev.map((x) =>
        x.id === n.id ? { ...x, is_read: true, read_at: new Date().toISOString() } : x,
      ),
    );
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', n.id);
  }

  async function markAllRead() {
    setMarkingAll(true);
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.is_read ? n : { ...n, is_read: true, read_at: now })),
    );
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: now })
      .eq('user_id', userId)
      .eq('is_read', false);
    setMarkingAll(false);
  }

  const header = {
    icons: [
      { icon: '💬', title: 'Tin nhắn', badge: unreadMessageThreadCount || undefined },
      { icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined },
    ],
    userName: buyer ? buyer.company_name : (supplier?.shop_name ?? ''),
    userRole: buyer ? 'Buyer' : 'Supplier',
  };

  const navGroups = buyer
    ? [
        { items: [{ icon: '🏠', label: 'Dashboard', href: '/dashboard' }] },
        {
          label: 'Mua hàng',
          items: [
            { icon: '📝', label: 'Gửi RFQ mới', href: '/rfq/new' },
            { icon: '📋', label: 'RFQ của tôi', href: '/rfq' },
            { icon: '📦', label: 'Đơn hàng', href: '/orders' },
          ],
        },
        {
          label: 'Kết nối',
          items: [
            {
              icon: '💬',
              label: 'Nhắn tin',
              href: '/messages',
              count: unreadMessageThreadCount || undefined,
            },
            {
              icon: '🔔',
              label: 'Thông báo',
              href: '/notifications',
              count: unreadCount || undefined,
            },
          ],
        },
        {
          label: 'Tài khoản',
          items: [
            { icon: '🏢', label: 'Hồ sơ & xác minh', href: '/settings/profile' },
            { icon: '💳', label: 'Membership & credit', href: '/settings/membership' },
            { icon: '⚙️', label: 'Cài đặt thông báo', href: '/settings/notifications' },
          ],
        },
      ]
    : buildSupplierNavGroups({ newRfqCount, unreadCount });

  return (
    <AppShell header={header} navGroups={navGroups}>
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Thông báo</span>
      </div>

      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-bold">Thông báo</div>
          <div className="text-brand-sub mt-1 text-[12.5px]">
            {notifications.length} thông báo · {unreadCount} chưa đọc
          </div>
        </div>
        <button
          type="button"
          disabled={markingAll || unreadCount === 0}
          onClick={markAllRead}
          className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink shrink-0 rounded-lg border-[1.5px] bg-white px-3.5 py-2 text-xs font-semibold whitespace-nowrap disabled:cursor-default disabled:opacity-50"
        >
          {markingAll ? 'Đang xử lý...' : '✓ Đánh dấu tất cả đã đọc'}
        </button>
      </div>

      <div className="border-brand-border mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => {
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[12.5px] font-semibold whitespace-nowrap ${
                isActive
                  ? 'border-brand-red text-brand-red'
                  : 'text-brand-sub hover:text-brand-red border-transparent'
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${
                  isActive ? 'bg-status-red-soft text-brand-red' : 'bg-brand-bg text-brand-sub'
                }`}
              >
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-[50px] text-center">
          <div className="mb-2.5 text-[32px]">🔔</div>
          <div className="mb-1.5 text-sm font-bold">Không có thông báo nào ở mục này</div>
          <div className="text-brand-sub text-xs">Bạn đã xem hết thông báo trong mục này.</div>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="text-brand-light mb-2 pl-0.5 text-[11.5px] font-bold tracking-[.05em] uppercase">
              {group.label}
            </div>
            <div className="border-brand-border overflow-hidden rounded-[10px] border bg-white">
              {group.items.map((n) => {
                const meta = metaFor(n.type);
                const href = resolveHref(n, role);
                const body = (
                  <>
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-base"
                      style={{ background: meta.bg }}
                    >
                      {meta.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-[12.5px] leading-relaxed ${n.is_read ? 'font-semibold' : 'font-bold'}`}
                      >
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="text-brand-sub mt-0.5 text-[11.5px] leading-relaxed">
                          {n.body}
                        </div>
                      )}
                      <div className="text-brand-light mt-1 text-[10.5px]">
                        {formatTime(n.created_at)}
                      </div>
                    </div>
                    {!n.is_read && (
                      <span className="bg-brand-red mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full" />
                    )}
                  </>
                );
                const className = `relative flex gap-3 border-b border-[#F2F0EC] p-3.5 px-4 transition-colors last:border-b-0 hover:bg-[#FAFAF8] ${
                  !n.is_read ? 'bg-[#FFFBF8]' : ''
                }`;
                return href ? (
                  <Link key={n.id} href={href} onClick={() => markOneRead(n)} className={className}>
                    {!n.is_read && (
                      <span className="bg-brand-red absolute top-0 bottom-0 left-0 w-[3px]" />
                    )}
                    {body}
                  </Link>
                ) : (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => markOneRead(n)}
                    onKeyDown={(e) => e.key === 'Enter' && markOneRead(n)}
                    className={`${className} cursor-pointer`}
                  >
                    {!n.is_read && (
                      <span className="bg-brand-red absolute top-0 bottom-0 left-0 w-[3px]" />
                    )}
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </AppShell>
  );
}
