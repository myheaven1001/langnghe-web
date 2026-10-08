import type { SidebarNavGroup } from '@/components/ui';

// Cùng 1 bộ nav cho mọi trang /supplier/* — tách ra đây để 8 trang Giai
// đoạn 4 không copy-paste cùng 1 mảng navGroups (và lệch nhau khi 1 trang
// sửa mà quên sửa trang khác), giống lý do buyer side đã có AppShell dùng
// chung nhưng chưa tách navGroups tới giờ mới cần vì buyer chỉ có 1 role.
export function buildSupplierNavGroups({
  newRfqCount,
  unreadCount,
}: {
  newRfqCount?: number;
  unreadCount?: number;
}): SidebarNavGroup[] {
  return [
    { items: [{ icon: '🏠', label: 'Dashboard', href: '/supplier/dashboard' }] },
    {
      label: 'Bán hàng',
      items: [
        { icon: '🗂️', label: 'Quản lý sản phẩm', href: '/supplier/products' },
        { icon: '➕', label: 'Thêm sản phẩm', href: '/supplier/products/new' },
        {
          icon: '📥',
          label: 'RFQ nhận được',
          href: '/supplier/rfq',
          count: newRfqCount || undefined,
        },
        { icon: '💰', label: 'Báo giá đã gửi', href: '/supplier/quotes' },
        { icon: '📦', label: 'Quản lý đơn hàng', href: '/supplier/orders' },
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
      label: 'Gian hàng',
      items: [
        // /supplier/shop chuyển tới /shops/<slug> của chính xưởng.
        { icon: '🏪', label: 'Xem gian hàng', href: '/supplier/shop' },
        { icon: '🏢', label: 'Hồ sơ & xác minh', href: '/supplier/settings/profile' },
        { icon: '📊', label: 'Analytics', href: '/supplier/analytics' },
        { icon: '⚙️', label: 'Cài đặt gian hàng', href: '/supplier/settings/shop' },
        { icon: '🔑', label: 'Tài khoản & bảo mật', href: '/supplier/settings/account' },
      ],
    },
  ];
}
