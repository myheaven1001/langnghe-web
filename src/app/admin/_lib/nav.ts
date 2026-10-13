import type { SidebarNavGroup } from '@/components/ui';

// Same nav on every /admin/* page — mirrors supplier/_lib/nav.ts so the 4
// Giai đoạn 6 admin pages don't each redeclare this array.
export function buildAdminNavGroups({
  pendingVerificationCount,
}: {
  pendingVerificationCount?: number;
}): SidebarNavGroup[] {
  return [
    { items: [{ icon: '🏠', label: 'Dashboard', href: '/admin' }] },
    {
      label: 'Vận hành',
      items: [
        {
          icon: '🛡️',
          label: 'Duyệt xác minh',
          href: '/admin/verifications',
          count: pendingVerificationCount || undefined,
        },
        { icon: '📦', label: 'Quản lý đơn hàng', href: '/admin/orders' },
        { icon: '⚖️', label: 'Tranh chấp & hoàn tiền', href: '/admin/disputes' },
        { icon: '💵', label: 'Tài chính & đối soát', href: '/admin/finance' },
        { icon: '📋', label: 'Giám sát RFQ', href: '/admin/rfq' },
        { icon: '👥', label: 'Quản lý user', href: '/admin/users' },
        { icon: '🗂️', label: 'Kiểm duyệt sản phẩm', href: '/admin/products' },
        { icon: '⭐', label: 'Kiểm duyệt đánh giá', href: '/admin/reviews' },
        { icon: '⚑', label: 'Báo cáo vi phạm', href: '/admin/reports' },
      ],
    },
    {
      label: 'Hệ thống',
      items: [
        { icon: '📈', label: 'Báo cáo toàn sàn', href: '/admin/analytics' },
        { icon: '🏷️', label: 'Danh mục ngành hàng', href: '/admin/categories' },
        { icon: '🧾', label: 'Nhật ký hoạt động', href: '/admin/audit' },
        { icon: '⚙️', label: 'Cài đặt sàn', href: '/admin/settings' },
      ],
    },
  ];
}
