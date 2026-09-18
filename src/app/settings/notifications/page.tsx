import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui';
import { NotificationPreferencesGrid } from './_components/NotificationPreferencesGrid';

export const metadata: Metadata = {
  title: 'Cài đặt thông báo — LàngNghề.vn',
};

interface PreferenceRow {
  notification_type: string;
  channel: string;
  enabled: boolean;
}

export default async function NotificationSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: buyer } = await supabase
    .from('buyer_profiles')
    .select('id, company_name')
    .eq('user_id', user.id)
    .single();

  if (!buyer) redirect('/');

  const [{ data: unreadCount }, { count: activeRfqCount }, { data: prefsData }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
      .then((r) => ({ data: r.count ?? 0 })),
    supabase
      .from('rfq_requests')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', buyer.id)
      .in('status', ['published', 'quoted', 'negotiating']),
    supabase
      .from('notification_preferences')
      .select('notification_type, channel, enabled')
      .eq('user_id', user.id),
  ]);

  const initialPrefs: Record<string, boolean> = {};
  for (const row of (prefsData ?? []) as PreferenceRow[]) {
    initialPrefs[`${row.notification_type}:${row.channel}`] = row.enabled;
  }

  return (
    <AppShell
      header={{
        icons: [
          { icon: '💬', title: 'Tin nhắn' },
          { icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined },
        ],
        userName: buyer.company_name,
        userRole: 'Buyer',
      }}
      navGroups={[
        { items: [{ icon: '🏠', label: 'Dashboard', href: '/dashboard' }] },
        {
          label: 'Mua hàng',
          items: [
            { icon: '📝', label: 'Gửi RFQ mới', href: '/rfq/new' },
            { icon: '📋', label: 'RFQ của tôi', href: '/rfq', count: activeRfqCount || undefined },
            { icon: '📦', label: 'Đơn hàng', href: '/orders' },
          ],
        },
        {
          label: 'Kết nối',
          items: [
            { icon: '💬', label: 'Nhắn tin', href: '/messages' },
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
      ]}
    >
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Cài đặt thông báo</span>
      </div>

      <div className="mb-[18px]">
        <div className="text-xl font-bold">Cài đặt thông báo</div>
        <div className="text-brand-sub mt-1 text-[12.5px]">
          Chọn cách bạn muốn nhận thông báo cho từng loại sự kiện — trong ứng dụng hoặc qua email.
        </div>
      </div>

      <NotificationPreferencesGrid
        userId={user.id}
        initialPrefs={initialPrefs}
        email={user.email ?? ''}
        phone={user.phone ?? null}
      />
    </AppShell>
  );
}
