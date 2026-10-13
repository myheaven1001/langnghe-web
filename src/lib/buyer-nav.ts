import type { SidebarNavGroup } from '@/components/ui';
import { features } from '@/lib/features';

// Menu khu buyer — MỘT nơi duy nhất, mọi trang buyer (kể cả /messages và
// /notifications) dùng hàm này để các mục mới không bị sót ở trang cũ. Module
// thuần (không đụng server) nên client component cũng import được.
export function buildBuyerNavGroups({
  activeRfqCount,
  unreadCount,
  unreadMessageCount,
}: {
  activeRfqCount?: number;
  unreadCount?: number;
  unreadMessageCount?: number;
} = {}): SidebarNavGroup[] {
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
        { icon: '🧾', label: 'Lịch sử thanh toán', href: '/payments' },
        { icon: '♡', label: 'Sản phẩm đã lưu', href: '/saved' },
        { icon: '⭐', label: 'Đánh giá của tôi', href: '/reviews' },
      ],
    },
    {
      label: 'Kết nối',
      items: [
        {
          icon: '💬',
          label: 'Nhắn tin',
          href: '/messages',
          count: unreadMessageCount || undefined,
        },
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
