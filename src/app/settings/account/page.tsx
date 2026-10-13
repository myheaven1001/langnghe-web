import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui';
import { AccountSecurity } from '@/components/account/AccountSecurity';
import { buildBuyerNavGroups } from '@/lib/buyer-nav';

export const metadata: Metadata = {
  title: 'Tài khoản & bảo mật — LàngNghề.vn',
};

// Tài khoản & bảo mật của buyer (kế hoạch 4.9): đổi mật khẩu, đổi email
// đăng nhập — xem components/account/AccountSecurity.
export default async function BuyerAccountPage() {
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

  const [{ data: unreadCount }, { count: activeRfqCount }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
      .then((r) => ({ data: r.count ?? 0 })),
    supabase
      .from('rfq_requests')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', buyer.id)
      .in('status', ['published', 'quoted', 'negotiating']),
  ]);

  return (
    <AppShell
      header={{
        icons: [
          { icon: '💬', title: 'Tin nhắn' },
          { icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined },
        ],
        userName: buyer.company_name,
        userRole: 'Buyer',
      }}
      navGroups={buildBuyerNavGroups({ activeRfqCount: activeRfqCount ?? 0, unreadCount: unreadCount ?? 0 })}
    >
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-xs">
        <Link href="/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Tài khoản & bảo mật</span>
      </div>

      <div className="mb-[18px]">
        <div className="text-xl font-bold">Tài khoản & bảo mật</div>
        <div className="text-brand-sub mt-1 text-[13px]">
          Đổi mật khẩu và email dùng để đăng nhập.
        </div>
      </div>

      <AccountSecurity email={user.email ?? ''} />
    </AppShell>
  );
}
