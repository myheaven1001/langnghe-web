import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { HeaderProps, SidebarNavGroup } from '@/components/ui';
import { buildBuyerNavGroups } from '@/lib/buyer-nav';

export { buildBuyerNavGroups };

// Phần mở đầu chung của trang khu buyer: phải đăng nhập và có hồ sơ buyer;
// trả kèm header + menu cho AppShell.
export async function requireBuyer(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  buyer: { id: string; company_name: string };
  shell: { header: HeaderProps; navGroups: SidebarNavGroup[] };
}> {
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

  const [{ count: unreadCount }, { count: activeRfqCount }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false),
    supabase
      .from('rfq_requests')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', buyer.id)
      .in('status', ['published', 'quoted', 'negotiating']),
  ]);

  return {
    supabase,
    userId: user.id,
    buyer,
    shell: {
      header: {
        icons: [
          { icon: '💬', title: 'Tin nhắn' },
          { icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined },
        ],
        userName: buyer.company_name,
        userRole: 'Buyer',
      },
      navGroups: buildBuyerNavGroups({
        activeRfqCount: activeRfqCount ?? 0,
        unreadCount: unreadCount ?? 0,
      }),
    },
  };
}
