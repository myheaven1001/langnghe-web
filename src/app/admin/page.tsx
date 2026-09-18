import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, Card, CardHeader, CardBody, StatCard } from '@/components/ui';
import { formatVnd, formatVnDate, monthStartIso } from '@/lib/format';
import { buildAdminNavGroups } from './_lib/nav';

export const metadata: Metadata = {
  title: 'Admin Dashboard — LàngNghề.vn',
};

interface PendingVerificationRow {
  id: string;
  entity_id: string;
  entity_type: 'buyer' | 'supplier';
  created_at: string;
  name: string;
}

function daysWaiting(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Route is already gated to role = 'admin' in middleware (src/lib/supabase/
  // middleware.ts) — re-checked here in case this component is ever rendered
  // outside that middleware path, mirroring the buyer/supplier dashboards'
  // own profile guard.
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/');

  const monthStart = monthStartIso();

  const [
    { count: unreadCount },
    { count: pendingVerificationCount },
    { count: suspendedUserCount },
    { count: pendingUserCount },
    { count: buyerCount },
    { count: supplierCount },
    { count: newBuyerProfilesCount },
    { count: newSupplierProfilesCount },
    { data: monthOrdersData },
    { data: pendingVerificationsData },
  ] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false),
    supabase
      .from('verifications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .in('role', ['buyer', 'both']),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .in('role', ['supplier', 'both']),
    supabase
      .from('buyer_profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart),
    supabase
      .from('supplier_profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart),
    supabase
      .from('orders')
      .select('total_amount')
      .neq('status', 'cancelled')
      .gte('created_at', monthStart),
    supabase
      .from('verifications')
      .select('id, entity_id, entity_type, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5),
  ]);

  const gmvThisMonth = (monthOrdersData ?? []).reduce((sum, o) => sum + (o.total_amount ?? 0), 0);
  const newProfilesThisMonth = (newBuyerProfilesCount ?? 0) + (newSupplierProfilesCount ?? 0);

  const pendingVerifications = pendingVerificationsData ?? [];
  const buyerIds = pendingVerifications
    .filter((v) => v.entity_type === 'buyer')
    .map((v) => v.entity_id);
  const supplierIds = pendingVerifications
    .filter((v) => v.entity_type === 'supplier')
    .map((v) => v.entity_id);

  const [{ data: buyerNames }, { data: supplierNames }] = await Promise.all([
    buyerIds.length > 0
      ? supabase.from('buyer_profiles').select('id, company_name').in('id', buyerIds)
      : Promise.resolve({ data: [] as { id: string; company_name: string }[] }),
    supplierIds.length > 0
      ? supabase.from('supplier_profiles').select('id, shop_name').in('id', supplierIds)
      : Promise.resolve({ data: [] as { id: string; shop_name: string }[] }),
  ]);

  const nameById = new Map<string, string>([
    ...(buyerNames ?? []).map((b) => [b.id, b.company_name] as const),
    ...(supplierNames ?? []).map((s) => [s.id, s.shop_name] as const),
  ]);

  const verificationQueue: PendingVerificationRow[] = pendingVerifications.map((v) => ({
    id: v.id,
    entity_id: v.entity_id,
    entity_type: v.entity_type as 'buyer' | 'supplier',
    created_at: v.created_at,
    name: nameById.get(v.entity_id) ?? 'Không rõ',
  }));

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
      <div className="mb-5">
        <div className="text-xl font-bold">Admin Dashboard</div>
        <div className="text-brand-sub mt-1 text-[12.5px]">Tổng quan vận hành sàn LàngNghề.vn.</div>
      </div>

      <div className="mb-[18px] grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon="💰"
          iconTone="green"
          value={
            gmvThisMonth >= 1_000_000
              ? `${(gmvThisMonth / 1_000_000).toFixed(0)}tr`
              : formatVnd(gmvThisMonth)
          }
          label="GMV tháng này"
        />
        <StatCard
          icon="👥"
          iconTone="blue"
          value={newProfilesThisMonth}
          label="Hồ sơ mới tháng này"
        />
        <StatCard
          icon="🛡️"
          iconTone="amber"
          value={pendingVerificationCount ?? 0}
          label="Hồ sơ chờ xác minh"
          delta={pendingVerificationCount ? `${pendingVerificationCount} chờ` : undefined}
          deltaTone="new"
        />
        <StatCard
          icon="🔒"
          iconTone="red"
          value={suspendedUserCount ?? 0}
          label="Tài khoản bị khóa"
        />
      </div>

      <div className="grid grid-cols-[1fr_300px] items-start gap-4">
        {/* LEFT */}
        <div>
          <Card>
            <CardHeader
              title={<>🛡️ Hồ sơ chờ xác minh</>}
              action={
                <Link
                  href="/admin/verifications"
                  className="text-brand-red text-xs font-semibold hover:underline"
                >
                  Xem tất cả →
                </Link>
              }
            />
            <CardBody>
              {verificationQueue.length === 0 ? (
                <div className="text-brand-light px-[18px] py-8 text-center text-xs">
                  Không có hồ sơ nào đang chờ xác minh.
                </div>
              ) : (
                verificationQueue.map((v) => {
                  const waited = daysWaiting(v.created_at);
                  return (
                    <div
                      key={v.id}
                      className="flex items-center gap-3 border-b border-[#F2F0EC] px-[18px] py-[11px] last:border-b-0"
                    >
                      <div className="bg-brand-bg flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[7px] text-base">
                        {v.entity_type === 'supplier' ? '🏭' : '🛒'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-brand-ink truncate text-[12.5px] font-semibold">
                          {v.name} — {v.entity_type === 'supplier' ? 'Supplier' : 'Buyer'}
                        </div>
                        <div className="text-brand-light mt-0.5 text-[11px]">
                          Nộp {formatVnDate(v.created_at)} · chờ {waited <= 0 ? '<1' : waited} ngày
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>
        </div>

        {/* RIGHT RAIL */}
        <div>
          <div className="border-brand-border rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Phân bổ người dùng
            </div>
            <div className="flex justify-between border-b border-[#F2F0EC] py-2.5 text-xs">
              <div className="text-brand-sub flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-[#1D9E75]" />
                Buyer
              </div>
              <div className="text-sm font-bold">{buyerCount ?? 0}</div>
            </div>
            <div className="flex justify-between border-b border-[#F2F0EC] py-2.5 text-xs">
              <div className="text-brand-sub flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-[#C4622D]" />
                Supplier
              </div>
              <div className="text-sm font-bold">{supplierCount ?? 0}</div>
            </div>
            <div className="flex justify-between border-b border-[#F2F0EC] py-2.5 text-xs">
              <div className="text-brand-sub flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-[#888780]" />
                Chờ xác minh
              </div>
              <div className="text-sm font-bold">{pendingUserCount ?? 0}</div>
            </div>
            <div className="flex justify-between py-2.5 text-xs">
              <div className="text-brand-sub flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-[#C62828]" />
                Tạm khóa
              </div>
              <div className="text-sm font-bold">{suspendedUserCount ?? 0}</div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
