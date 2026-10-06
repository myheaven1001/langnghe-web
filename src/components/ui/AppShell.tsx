import type { ReactNode } from 'react';
import { inter, interTight } from '@/lib/fonts';
import type { HeaderProps } from './Header';
import { ShellFrame, type BottomNavItem } from './ShellFrame';
import type { SidebarNavGroup } from './Sidebar';

// Thanh điều hướng dưới cùng trên điện thoại cho nhà bán (kế hoạch 4.2): 4
// việc làm hằng ngày. Nhận diện khu nhà bán qua chính navGroups của trang
// (có mục /supplier/orders) nên 26 trang đang gọi AppShell không phải sửa;
// số đếm lấy lại từ mục tương ứng trong sidebar.
const SUPPLIER_BOTTOM_NAV = [
  { icon: '📦', label: 'Đơn hàng', href: '/supplier/orders' },
  { icon: '📥', label: 'RFQ', href: '/supplier/rfq' },
  { icon: '🗂️', label: 'Sản phẩm', href: '/supplier/products' },
  { icon: '💬', label: 'Tin nhắn', href: '/messages' },
];

function buildBottomNav(navGroups: SidebarNavGroup[]): BottomNavItem[] | undefined {
  const items = navGroups.flatMap((group) => group.items);
  if (!items.some((item) => item.href === '/supplier/orders')) return undefined;
  return SUPPLIER_BOTTOM_NAV.map((entry) => ({
    ...entry,
    count: items.find((item) => item.href === entry.href)?.count,
  }));
}

// Khung của mọi trang sau đăng nhập (buyer, nhà bán, admin): Header đỏ dính
// trên cùng + Sidebar + cột nội dung tối đa 1180px, căn giữa ở màn rộng.
// Mobile trước: dưới `lg` sidebar thành ngăn kéo mở bằng nút ☰, header thu
// gọn, nhà bán có thêm thanh điều hướng dưới cùng — xem ShellFrame.
export function AppShell({
  header,
  navGroups,
  children,
}: {
  header: HeaderProps;
  navGroups: SidebarNavGroup[];
  children: ReactNode;
}) {
  return (
    <div
      className={`${inter.variable} ${interTight.variable} bg-brand-bg text-brand-ink min-h-screen font-[family-name:var(--font-inter)] text-[13px]`}
    >
      <ShellFrame header={header} navGroups={navGroups} bottomNav={buildBottomNav(navGroups)}>
        {children}
      </ShellFrame>
    </div>
  );
}
