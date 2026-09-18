import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, StatusPill } from '@/components/ui';
import { formatVnDate } from '@/lib/format';
import { buildAdminNavGroups } from '../_lib/nav';
import { AdminUserFilterBar } from './_components/AdminUserFilterBar';
import { UserAdminActions } from './_components/UserAdminActions';

export const metadata: Metadata = {
  title: 'Quản lý user — LàngNghề.vn Admin',
};

// users.status không có timestamp riêng (public.users chỉ có id/role/status
// — xem 20260905120100_users_and_auth.sql) và "buyer/supplier/admin" nằm ở
// 3 bảng khác nhau, nên không paginate/sort được thẳng bằng 1 câu query
// Postgrest. Ở quy mô hiện tại (dev/MVP, không phải 9.658 user như mock),
// fetch hết rồi merge/lọc/sort/paginate trong JS đơn giản hơn nhiều so với
// cố ép 1 query DB làm tất cả — nếu số user thật lớn hẳn sau này thì đây là
// chỗ cần viết lại thành query DB-side.
const PAGE_SIZE = 15;

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'admin', label: 'Admin' },
  { key: 'suspended', label: 'Tạm khóa' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const SORTS = [
  { key: 'newest', label: 'Mới nhất' },
  { key: 'trust_asc', label: 'Trust score thấp nhất' },
] as const;
type SortKey = (typeof SORTS)[number]['key'];

interface DisplayUser {
  id: string;
  role: string;
  status: string;
  name: string;
  icon: string;
  trustScore: number | null;
  riskScore: number | null;
  joinedAt: string | null;
}

function buildUsersUrl(params: { tab: TabKey; q: string; sort: SortKey; page?: number }) {
  const search = new URLSearchParams();
  if (params.tab !== 'all') search.set('tab', params.tab);
  if (params.q) search.set('q', params.q);
  if (params.sort !== 'newest') search.set('sort', params.sort);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  const qs = search.toString();
  return qs ? `/admin/users?${qs}` : '/admin/users';
}

function trustBarColor(score: number) {
  if (score >= 70) return '#00A650';
  if (score >= 40) return '#FF6A00';
  return '#C62828';
}

const ROLE_TAG: Record<string, { label: string; className: string }> = {
  buyer: { label: 'Buyer', className: 'bg-status-blue-soft text-status-blue' },
  supplier: { label: 'Supplier', className: 'bg-[#FDF1E9] text-brand-clay' },
  admin: { label: 'Admin', className: 'bg-status-purple-soft text-status-purple' },
  both: { label: 'Buyer & Supplier', className: 'bg-status-gray-soft text-status-gray' },
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; sort?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : 'all';
  const q = (sp.q ?? '').trim().toLowerCase();
  const sort: SortKey = SORTS.some((s) => s.key === sp.sort) ? (sp.sort as SortKey) : 'newest';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Route is already gated to role = 'admin' in middleware — re-checked
  // here same as the other /admin/* pages.
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/');

  const [
    { count: unreadCount },
    { count: pendingVerificationCount },
    { data: usersData },
    { data: buyersData },
    { data: suppliersData },
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
    supabase.from('users').select('id, role, status'),
    supabase
      .from('buyer_profiles')
      .select('user_id, company_name, trust_score, risk_score, created_at'),
    supabase
      .from('supplier_profiles')
      .select('user_id, shop_name, trust_score, risk_score, created_at'),
  ]);

  const buyerByUserId = new Map((buyersData ?? []).map((b) => [b.user_id, b]));
  const supplierByUserId = new Map((suppliersData ?? []).map((s) => [s.user_id, s]));

  const allUsers: DisplayUser[] = (usersData ?? []).map((u) => {
    if (u.role === 'admin') {
      return {
        id: u.id,
        role: u.role,
        status: u.status,
        name: 'Admin',
        icon: '⚙️',
        trustScore: null,
        riskScore: null,
        joinedAt: null,
      };
    }
    const buyer = buyerByUserId.get(u.id);
    const supplier = supplierByUserId.get(u.id);
    const profile = buyer ?? supplier;
    return {
      id: u.id,
      role: u.role,
      status: u.status,
      name: buyer?.company_name ?? supplier?.shop_name ?? 'Không rõ',
      icon: supplier && !buyer ? '🏭' : '🛒',
      trustScore: profile?.trust_score ?? null,
      riskScore: profile?.risk_score ?? null,
      joinedAt: profile?.created_at ?? null,
    };
  });

  const tabCounts: Record<TabKey, number> = {
    all: allUsers.length,
    buyer: allUsers.filter((u) => u.role === 'buyer' || u.role === 'both').length,
    supplier: allUsers.filter((u) => u.role === 'supplier' || u.role === 'both').length,
    admin: allUsers.filter((u) => u.role === 'admin').length,
    suspended: allUsers.filter((u) => u.status === 'suspended').length,
  };

  let filtered = allUsers;
  if (tab === 'buyer') filtered = filtered.filter((u) => u.role === 'buyer' || u.role === 'both');
  else if (tab === 'supplier')
    filtered = filtered.filter((u) => u.role === 'supplier' || u.role === 'both');
  else if (tab === 'admin') filtered = filtered.filter((u) => u.role === 'admin');
  else if (tab === 'suspended') filtered = filtered.filter((u) => u.status === 'suspended');

  if (q) filtered = filtered.filter((u) => u.name.toLowerCase().includes(q));

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'trust_asc') {
      const av = a.trustScore ?? Infinity;
      const bv = b.trustScore ?? Infinity;
      return av - bv;
    }
    const at = a.joinedAt ? new Date(a.joinedAt).getTime() : -Infinity;
    const bt = b.joinedAt ? new Date(b.joinedAt).getTime() : -Infinity;
    return bt - at;
  });

  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const from = (page - 1) * PAGE_SIZE;
  const pageItems = sorted.slice(from, from + PAGE_SIZE);

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
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/admin" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Quản lý user</span>
      </div>

      <div className="mb-[18px]">
        <div className="text-xl font-bold">Quản lý user</div>
        <div className="text-brand-sub mt-1 text-[12.5px]">
          {tabCounts.all} người dùng · {tabCounts.suspended} đang tạm khóa
        </div>
      </div>

      <div className="border-brand-border mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => {
          const isActive = t.key === tab;
          return (
            <Link
              key={t.key}
              href={buildUsersUrl({ tab: t.key, q, sort })}
              className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[12.5px] font-semibold whitespace-nowrap ${
                isActive
                  ? 'border-brand-forest text-brand-forest'
                  : 'text-brand-sub hover:text-brand-forest border-transparent'
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${
                  isActive ? 'bg-status-green-soft text-brand-forest' : 'bg-brand-bg text-brand-sub'
                }`}
              >
                {tabCounts[t.key]}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <AdminUserFilterBar tab={tab} q={q} sort={sort} sorts={SORTS} />
        <span className="text-brand-sub mb-3.5 shrink-0 text-xs">{totalCount} kết quả</span>
      </div>

      {pageItems.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-[50px] text-center">
          <div className="mb-2.5 text-[32px]">🔍</div>
          <div className="mb-1.5 text-sm font-bold">Không có người dùng nào ở mục này</div>
        </div>
      ) : (
        <div className="border-brand-border overflow-hidden rounded-[10px] border bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-brand-bg border-brand-border border-b">
                {['Người dùng', 'Vai trò', 'Trạng thái', 'Trust score', 'Tham gia', ''].map((h) => (
                  <th
                    key={h}
                    className="text-brand-light px-3.5 py-2.5 text-left text-[10.5px] font-bold tracking-[.05em] uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((u) => {
                const roleTag = ROLE_TAG[u.role] ?? {
                  label: u.role,
                  className: 'bg-status-gray-soft text-status-gray',
                };
                const canModerate = u.role !== 'admin';
                return (
                  <tr
                    key={u.id}
                    className="border-b border-[#F2F0EC] last:border-b-0 hover:bg-[#FAFAF8]"
                  >
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="bg-brand-bg flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-base">
                          {u.icon}
                        </div>
                        <span className="text-[12.5px] font-semibold">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      <span
                        className={`rounded px-2 py-1 text-[10px] font-bold ${roleTag.className}`}
                      >
                        {roleTag.label}
                      </span>
                    </td>
                    <td className="px-3.5 py-3">
                      <StatusPill domain="user" status={u.status} />
                    </td>
                    <td className="px-3.5 py-3">
                      {u.trustScore === null ? (
                        <span className="text-brand-light">—</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="bg-brand-bg h-[5px] w-11 overflow-hidden rounded">
                            <div
                              className="h-full rounded"
                              style={{
                                width: `${u.trustScore}%`,
                                background: trustBarColor(u.trustScore),
                              }}
                            />
                          </div>
                          <span className="text-[12px] font-semibold">{u.trustScore}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-[12px]">
                      {u.joinedAt ? (
                        formatVnDate(u.joinedAt)
                      ) : (
                        <span className="text-brand-light">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      {canModerate && (
                        <UserAdminActions userId={u.id} status={u.status} name={u.name} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-[22px] flex items-center justify-center gap-1.5">
          <Link
            href={buildUsersUrl({ tab, q, sort, page: page - 1 })}
            aria-disabled={page <= 1}
            className={`border-brand-border flex h-8 w-8 items-center justify-center rounded-md border text-[13px] ${
              page <= 1
                ? 'text-brand-light pointer-events-none opacity-40'
                : 'text-brand-sub hover:border-brand-clay hover:text-brand-ink bg-white'
            }`}
          >
            ‹
          </Link>
          <span className="text-brand-sub px-2 text-xs">
            Trang {page}/{totalPages}
          </span>
          <Link
            href={buildUsersUrl({ tab, q, sort, page: page + 1 })}
            aria-disabled={page >= totalPages}
            className={`border-brand-border flex h-8 w-8 items-center justify-center rounded-md border text-[13px] ${
              page >= totalPages
                ? 'text-brand-light pointer-events-none opacity-40'
                : 'text-brand-sub hover:border-brand-clay hover:text-brand-ink bg-white'
            }`}
          >
            ›
          </Link>
        </div>
      )}
    </AppShell>
  );
}
