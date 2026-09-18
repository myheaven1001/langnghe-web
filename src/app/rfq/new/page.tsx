import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui';
import RfqCreateForm from './RfqCreateForm';

export const metadata: Metadata = {
  title: 'Gửi yêu cầu báo giá (RFQ) — LàngNghề.vn',
};

const PLAN_LABEL: Record<string, string> = {
  free: '🆓 Gói Miễn phí',
  basic: '📦 Gói Cơ bản',
  premium: '⭐ Gói Premium',
};

export default async function RfqNewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: buyer }, { data: categories }, { data: membership }] = await Promise.all([
    supabase
      .from('buyer_profiles')
      .select('id, quota_used_this_month, quota_reset_at, credit_balance, company_name')
      .eq('user_id', user!.id)
      .single(),
    supabase.from('categories').select('id, name, slug').order('sort_order'),
    supabase
      .from('user_memberships')
      .select('membership_plans(name)')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!buyer) {
    return (
      <AppShell
        header={{ userName: user!.email ?? 'Bạn', userRole: 'Chưa có hồ sơ buyer' }}
        navGroups={[{ items: [{ icon: '🏠', label: 'Trang chủ', href: '/' }] }]}
      >
        <div className="rounded-[10px] border border-[#E0DDD8] bg-white p-6 text-center text-sm text-[#666]">
          Trang này chỉ dành cho tài khoản buyer. Nếu bạn nghĩ đây là nhầm lẫn, vui lòng liên hệ hỗ
          trợ.
        </div>
      </AppShell>
    );
  }

  const planName =
    (membership?.membership_plans as unknown as { name: string } | null)?.name ?? 'free';
  const { data: quota } = await supabase
    .from('rfq_quota_configs')
    .select('monthly_quota, multi_rfq_allowed, max_suppliers_per_rfq')
    .eq('plan_name', planName)
    .maybeSingle();

  return (
    <AppShell
      header={{
        userName: buyer.company_name,
        userRole: PLAN_LABEL[planName] ?? planName,
        icons: [
          { icon: '💬', title: 'Tin nhắn' },
          { icon: '🔔', title: 'Thông báo' },
        ],
      }}
      navGroups={[
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
            { icon: '💬', label: 'Nhắn tin', href: '/messages' },
            { icon: '🔔', label: 'Thông báo', href: '/notifications' },
          ],
        },
        {
          label: 'Tài khoản',
          items: [
            { icon: '🏢', label: 'Hồ sơ & xác minh', href: '/settings/profile' },
            { icon: '💳', label: 'Membership & credit', href: '/settings/membership' },
          ],
        },
      ]}
    >
      <RfqCreateForm
        categories={categories ?? []}
        quotaUsed={buyer.quota_used_this_month}
        quotaResetAt={buyer.quota_reset_at}
        creditBalance={buyer.credit_balance}
        planLabel={PLAN_LABEL[planName] ?? planName}
        monthlyQuota={quota?.monthly_quota ?? null}
        multiRfqAllowed={quota?.multi_rfq_allowed ?? false}
        maxSuppliersPerRfq={quota?.max_suppliers_per_rfq ?? 1}
      />
    </AppShell>
  );
}
