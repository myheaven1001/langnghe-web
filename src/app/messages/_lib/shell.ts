import { buildSupplierNavGroups } from '../../supplier/_lib/nav';
import type { HeaderProps, SidebarNavGroup } from '@/components/ui';

// AppShell header/nav cho cả 2 trang /messages* — trích ra vì cả inbox
// (5.1) và chat chi tiết (5.2) đều cần dựng đúng shell theo role
// (buyer dùng nav inline như các trang buyer khác, supplier dùng
// buildSupplierNavGroups như mọi trang /supplier/*).
export function buildMessagesShell({
  buyer,
  supplier,
  unreadCount,
  newRfqCount,
  unreadThreadCount,
}: {
  buyer: { company_name: string } | null;
  supplier: { shop_name: string } | null;
  unreadCount: number;
  newRfqCount: number;
  unreadThreadCount: number;
}): { header: HeaderProps; navGroups: SidebarNavGroup[] } {
  const header: HeaderProps = {
    icons: [
      { icon: '💬', title: 'Tin nhắn', badge: unreadThreadCount || undefined },
      { icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined },
    ],
    userName: buyer ? buyer.company_name : (supplier?.shop_name ?? ''),
    userRole: buyer ? 'Buyer' : 'Supplier',
  };

  const navGroups: SidebarNavGroup[] = buyer
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
              count: unreadThreadCount || undefined,
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

  return { header, navGroups };
}
