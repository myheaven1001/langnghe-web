import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui';
import { AccountSecurity } from '@/components/account/AccountSecurity';
import { buildSupplierNavGroups } from '../../_lib/nav';
import { getNewRfqCount, getUnreadNotificationCount } from '../../_lib/counts';

export const metadata: Metadata = {
  title: 'Tài khoản & bảo mật — LàngNghề.vn',
};

// Tài khoản & bảo mật của nhà bán: cùng form với buyer (kế hoạch 4.9) —
// /settings/account thuộc khu buyer nên nhà bán có trang riêng trong khu mình.
export default async function SupplierAccountPage() {
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

  return (
    <AppShell
      header={{
        icons: [
          { icon: '💬', title: 'Tin nhắn' },
          { icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined },
        ],
        userName: supplier.shop_name,
        userRole: 'Supplier',
      }}
      navGroups={buildSupplierNavGroups({ newRfqCount, unreadCount })}
    >
      <div className="text-brand-sub mb-2 flex items-center gap-1.5 text-xs">
        <Link href="/supplier/dashboard" className="hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-brand-light">Tài khoản & bảo mật</span>
      </div>

      <div className="mb-[18px]">
        <h1 className="text-xl font-bold">Tài khoản & bảo mật</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          Đổi mật khẩu và email dùng để đăng nhập.
        </div>
      </div>

      <AccountSecurity email={user.email ?? ''} />
    </AppShell>
  );
}
