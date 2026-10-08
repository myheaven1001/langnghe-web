import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui';
import type { BuyerAddress } from '@/lib/addresses';
import { safeNextPath } from '@/lib/safe-next';
import { AddressBook } from './_components/AddressBook';

export const metadata: Metadata = {
  title: 'Sổ địa chỉ — LàngNghề.vn',
};

// Sổ địa chỉ giao hàng (kế hoạch 3.2). Buyer đọc/ghi thẳng bảng
// buyer_addresses qua RLS; địa chỉ được chọn khi chấp nhận báo giá sẽ được
// chép vào đơn hàng. `?next=` (từ hộp thoại chấp nhận báo giá ở /rfq/[id])
// hiện nút quay lại sau khi đã có địa chỉ.
export default async function AddressBookPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);

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

  const [{ data: unreadCount }, { count: activeRfqCount }, { data: addressesData }] =
    await Promise.all([
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
      supabase
        .from('buyer_addresses')
        .select(
          'id, label, recipient_name, phone, address_line, ward, district, province, is_default',
        )
        .eq('buyer_id', buyer.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false }),
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
      navGroups={[
        { items: [{ icon: '🏠', label: 'Dashboard', href: '/dashboard' }] },
        {
          label: 'Mua hàng',
          items: [
            { icon: '📝', label: 'Gửi RFQ mới', href: '/rfq/new' },
            { icon: '📋', label: 'RFQ của tôi', href: '/rfq', count: activeRfqCount || undefined },
            { icon: '📦', label: 'Đơn hàng', href: '/orders' },
          ],
        },
        {
          label: 'Kết nối',
          items: [
            { icon: '💬', label: 'Nhắn tin', href: '/messages' },
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
            { icon: '📍', label: 'Sổ địa chỉ', href: '/settings/addresses' },
            { icon: '💳', label: 'Membership & credit', href: '/settings/membership' },
            { icon: '⚙️', label: 'Cài đặt thông báo', href: '/settings/notifications' },
            { icon: '🔑', label: 'Tài khoản & bảo mật', href: '/settings/account' },
          ],
        },
      ]}
    >
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-xs">
        <Link href="/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Sổ địa chỉ</span>
      </div>

      <div className="mb-[18px]">
        <div className="text-xl font-bold">Sổ địa chỉ giao hàng</div>
        <div className="text-brand-sub mt-1 text-[13px]">
          Địa chỉ bạn chọn khi chấp nhận báo giá sẽ được ghi vào đơn hàng để xưởng giao hàng.
        </div>
      </div>

      <AddressBook
        buyerId={buyer.id}
        addresses={(addressesData ?? []) as BuyerAddress[]}
        nextHref={next}
      />
    </AppShell>
  );
}
