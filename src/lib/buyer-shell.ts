import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { HeaderProps, SidebarNavGroup } from '@/components/ui';
import { features } from '@/lib/features';

// Menu khu buyer. Các trang cũ còn khai báo mảng này tại chỗ; trang mới (giỏ
// hàng, thanh toán…) dùng hàm này để không chép thêm lần nữa.
export function buildBuyerNavGroups({
  activeRfqCount,
  unreadCount,
}: {
  activeRfqCount?: number;
  unreadCount?: number;
}): SidebarNavGroup[] {
  return [
    { items: [{ icon: '🏠', label: 'Dashboard', href: '/dashboard' }] },
    {
      label: 'Mua hàng',
      items: [
        { icon: '📝', label: 'Gửi RFQ mới', href: '/rfq/new' },
        { icon: '📋', label: 'RFQ của tôi', href: '/rfq', count: activeRfqCount || undefined },
        ...(features.cart ? [{ icon: '🛒', label: 'Giỏ hàng', href: '/cart' }] : []),
        { icon: '📦', label: 'Đơn hàng', href: '/orders' },
        ...(features.disputes ? [{ icon: '⚖️', label: 'Tranh chấp', href: '/disputes' }] : []),
      ],
    },
    {
      label: 'Kết nối',
      items: [
        { icon: '💬', label: 'Nhắn tin', href: '/messages' },
        { icon: '🔔', label: 'Thông báo', href: '/notifications', count: unreadCount || undefined },
      ],
    },
    {
      label: 'Tài khoản',
      items: [
        { icon: '🏢', label: 'Hồ sơ & xác minh', href: '/settings/profile' },
        { icon: '📍', label: 'Sổ địa chỉ', href: '/settings/addresses' },
        { icon: '💳', label: 'Membership & credit', href: '/settings/membership' },
        { icon: '⚙️', label: 'Cài đặt thông báo', href: '/settings/notifications' },
        { icon: '🔑', label: 'Tài khoản & bảo mật', href: '/settings/account' },
      ],
    },
  ];
}

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
