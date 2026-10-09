import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, Card, CardHeader, CardBody, StatTile, TodoTile } from '@/components/ui';
import { formatVnd, formatVnDate } from '@/lib/format';
import { buildAdminNavGroups } from './_lib/nav';

export const metadata: Metadata = {
  title: 'Admin Dashboard — LàngNghề.vn',
};

// Kết quả của RPC admin_queue_counts() (20261005092900). Thiếu hàm (chưa chạy
// migration) thì mọi số hiện 0.
interface QueueCounts {
  pending_verifications: number;
  oldest_verification_days: number;
  orders_pending_payment: number;
  orders_with_receipt: number;
  open_disputes: number;
  suspended_users: number;
  pending_users: number;
  buyers: number;
  suppliers: number;
  new_profiles_month: number;
  paid_amount_month: number;
}

const EMPTY_COUNTS: QueueCounts = {
  pending_verifications: 0,
  oldest_verification_days: 0,
  orders_pending_payment: 0,
  orders_with_receipt: 0,
  open_disputes: 0,
  suspended_users: 0,
  pending_users: 0,
  buyers: 0,
  suppliers: 0,
  new_profiles_month: 0,
  paid_amount_month: 0,
};

function formatCompactVnd(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace('.0', '')} tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')} tr`;
  return formatVnd(n);
}

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

  const [{ count: unreadCount }, { data: countsData }, { data: pendingVerificationsData }] =
    await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false),
    supabase.rpc('admin_queue_counts'),
    supabase
      .from('verifications')
      .select('id, entity_id, entity_type, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5),
  ]);

  const counts = { ...EMPTY_COUNTS, ...((countsData ?? {}) as Partial<QueueCounts>) };
  const pendingVerificationCount = counts.pending_verifications;

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
        <div className="text-brand-sub mt-1 text-[13px]">Tổng quan vận hành sàn LàngNghề.vn.</div>
      </div>

      {/* HÀNG ĐỢI — việc đang chờ admin xử lý (kế hoạch 4.10) */}
      <div className="mb-4 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        <TodoTile
          href="/admin/orders?status=pending_payment&range=all"
          icon="💳"
          count={counts.orders_pending_payment}
          label="Đơn chờ xác nhận tiền"
          hint={
            counts.orders_with_receipt > 0
              ? `${counts.orders_with_receipt} đơn đã có biên lai`
              : undefined
          }
        />
        <TodoTile
          href="/admin/verifications"
          icon="🛡️"
          count={counts.pending_verifications}
          label="Hồ sơ chờ xác minh"
          hint={
            counts.pending_verifications > 0 && counts.oldest_verification_days >= 2
              ? `lâu nhất ${counts.oldest_verification_days} ngày`
              : undefined
          }
        />
        <TodoTile
          href="/admin/orders?status=disputed&range=all"
          icon="⚠️"
          count={counts.open_disputes}
          label="Tranh chấp đang mở"
        />
        <TodoTile
          href="/admin/users?tab=suspended"
          icon="🔒"
          count={counts.suspended_users}
          label="Tài khoản đang bị khoá"
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile
          value={formatCompactVnd(counts.paid_amount_month)}
          label="Tiền đã xác nhận tháng này"
        />
        <StatTile value={String(counts.new_profiles_month)} label="Hồ sơ mới tháng này" />
        <StatTile value={String(counts.buyers)} label="Buyer" />
        <StatTile value={String(counts.suppliers)} label="Nhà bán" />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
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
                        <div className="text-brand-ink truncate text-[13px] font-semibold">
                          {v.name} — {v.entity_type === 'supplier' ? 'Supplier' : 'Buyer'}
                        </div>
                        <div className="text-brand-light mt-0.5 text-xs">
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
              <div className="text-sm font-bold">{counts.buyers}</div>
            </div>
            <div className="flex justify-between border-b border-[#F2F0EC] py-2.5 text-xs">
              <div className="text-brand-sub flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-[#C4622D]" />
                Supplier
              </div>
              <div className="text-sm font-bold">{counts.suppliers}</div>
            </div>
            <div className="flex justify-between border-b border-[#F2F0EC] py-2.5 text-xs">
              <div className="text-brand-sub flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-[#888780]" />
                Chờ xác minh
              </div>
              <div className="text-sm font-bold">{counts.pending_users}</div>
            </div>
            <div className="flex justify-between py-2.5 text-xs">
              <div className="text-brand-sub flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-[#C62828]" />
                Tạm khóa
              </div>
              <div className="text-sm font-bold">{counts.suspended_users}</div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
