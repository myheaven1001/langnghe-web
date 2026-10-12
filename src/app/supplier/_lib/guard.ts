import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { HeaderProps, SidebarNavGroup } from '@/components/ui';
import { getNewRfqCount, getUnreadNotificationCount } from './counts';
import { buildSupplierNavGroups } from './nav';

// Phần mở đầu chung của trang khu xưởng (như requireBuyer / requireAdmin):
// phải đăng nhập và có hồ sơ xưởng; trả kèm header + menu cho AppShell. Các
// trang cũ còn tự viết đoạn này tại chỗ.
export async function requireSupplier(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  supplier: { id: string; shop_name: string };
  shell: { header: HeaderProps; navGroups: SidebarNavGroup[] };
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: supplier } = await supabase
    .from('supplier_profiles')
    .select('id, shop_name')
    .eq('user_id', user.id)
    .single();
  if (!supplier) redirect('/');

  const [newRfqCount, unreadCount] = await Promise.all([
    getNewRfqCount(supabase, supplier.id),
    getUnreadNotificationCount(supabase, user.id),
  ]);

  return {
    supabase,
    userId: user.id,
    supplier,
    shell: {
      header: {
        icons: [
          { icon: '💬', title: 'Tin nhắn' },
          { icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined },
        ],
        userName: supplier.shop_name,
        userRole: 'Supplier',
      },
      navGroups: buildSupplierNavGroups({ newRfqCount, unreadCount }),
    },
  };
}
