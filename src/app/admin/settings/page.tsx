import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui';
import { buildAdminNavGroups } from '../_lib/nav';
import { SettingsForm, type PaymentAccount, type SupportContact } from './_components/SettingsForm';

export const metadata: Metadata = { title: 'Cài đặt sàn — Admin LàngNghề.vn' };

// Cài đặt sàn (kế hoạch 3.1): tài khoản nhận tiền, số ngày tự hoàn tất đơn,
// kênh hỗ trợ — bảng platform_settings, lưu qua RPC admin_set_setting() (ghi
// admin_audit_log). 5 thao tác gần nhất trong nhật ký hiện ở cuối trang.
export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/');

  const [
    { data: settings },
    { data: audit },
    { count: pendingVerificationCount },
    { count: unreadCount },
  ] = await Promise.all([
    supabase.from('platform_settings').select('key, value, updated_at'),
    supabase
      .from('admin_audit_log')
      .select('id, action, entity_id, created_at')
      .eq('entity_type', 'setting')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('verifications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false),
  ]);

  const byKey = new Map((settings ?? []).map((s) => [s.key as string, s.value]));
  const payment = (byKey.get('payment_account') ?? {}) as Partial<PaymentAccount>;
  const support = (byKey.get('support_contact') ?? {}) as Partial<SupportContact>;

  return (
    <AppShell
      header={{
        icons: [{ icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined }],
        userName: user.email ?? 'Admin',
        userRole: 'Quản trị viên',
        userInitial: 'A',
      }}
      navGroups={buildAdminNavGroups({ pendingVerificationCount: pendingVerificationCount ?? 0 })}
    >
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-xs">
        <Link href="/admin" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Cài đặt sàn</span>
      </div>
      <h1 className="mb-4 text-lg font-bold">Cài đặt sàn</h1>

      <SettingsForm
        payment={{
          bank_name: payment.bank_name ?? '',
          account_number: payment.account_number ?? '',
          account_holder: payment.account_holder ?? '',
          branch: payment.branch ?? '',
          note: payment.note ?? '',
        }}
        autoCompleteDays={Number(byKey.get('order_auto_complete_days') ?? 7)}
        support={{
          phone: support.phone ?? '',
          zalo: support.zalo ?? '',
          email: support.email ?? '',
          hours: support.hours ?? '',
        }}
      />

      <div className="border-brand-border rounded-[10px] border bg-white">
        <div className="border-brand-border border-b px-[18px] py-3.5 text-sm font-bold">
          Thay đổi gần đây
        </div>
        {(audit ?? []).length === 0 ? (
          <div className="text-brand-sub px-[18px] py-4 text-xs">Chưa có thay đổi nào.</div>
        ) : (
          <ul className="divide-brand-border divide-y text-xs">
            {(audit ?? []).map((a) => (
              <li key={a.id} className="flex justify-between gap-3 px-[18px] py-2.5">
                <span>
                  Sửa <strong>{SETTING_LABEL[a.entity_id ?? ''] ?? a.entity_id}</strong>
                </span>
                <span className="text-brand-sub shrink-0">
                  {new Date(a.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

const SETTING_LABEL: Record<string, string> = {
  payment_account: 'tài khoản nhận tiền',
  order_auto_complete_days: 'số ngày tự hoàn tất đơn',
  support_contact: 'kênh hỗ trợ',
};
