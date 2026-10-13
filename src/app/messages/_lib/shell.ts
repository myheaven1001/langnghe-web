import { buildSupplierNavGroups } from '../../supplier/_lib/nav';
import type { HeaderProps, SidebarNavGroup } from '@/components/ui';
import { buildBuyerNavGroups } from '@/lib/buyer-nav';

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
    ? buildBuyerNavGroups({ unreadCount, unreadMessageCount: unreadThreadCount })
    : buildSupplierNavGroups({ newRfqCount, unreadCount });

  return { header, navGroups };
}
