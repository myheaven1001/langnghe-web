import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { HeaderProps, SidebarNavGroup } from '@/components/ui';
import { buildAdminNavGroups } from './nav';

// Phần mở đầu chung của mọi trang /admin/*: phải đăng nhập, phải là admin
// (middleware đã chặn theo vai trò — kiểm tra lại ở đây như các trang khác),
// kèm header + menu cho AppShell.
export async function requireAdmin(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  shell: { header: HeaderProps; navGroups: SidebarNavGroup[] };
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/');

  const [{ count: unreadCount }, { count: pendingVerificationCount }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false),
    supabase
      .from('verifications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  return {
    supabase,
    userId: user.id,
    shell: {
      header: {
        icons: [{ icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined }],
        userName: user.email ?? 'Admin',
        userRole: 'Quản trị viên',
        userInitial: 'A',
      },
      navGroups: buildAdminNavGroups({ pendingVerificationCount: pendingVerificationCount ?? 0 }),
    },
  };
}
