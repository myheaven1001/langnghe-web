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
        { icon: '👥', label: 'Quản lý user', href: '/admin/users' },
      ],
    },
  ];
}
