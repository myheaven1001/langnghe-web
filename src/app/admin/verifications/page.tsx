import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, Card, CardBody } from '@/components/ui';
import { formatVnDate } from '@/lib/format';
import { buildAdminNavGroups } from '../_lib/nav';
import { VerificationActions } from './_components/VerificationActions';

export const metadata: Metadata = {
  title: 'Duyệt xác minh — LàngNghề.vn Admin',
};

const TABS = [
  { key: 'all', label: 'Chờ duyệt' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'reverify', label: 'Xác minh lại' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface VerificationRow {
  id: string;
  entity_id: string;
  entity_type: 'buyer' | 'supplier';
  attempt_number: number;
  tax_code: string | null;
  business_license_url: string | null;
  id_card_url: string | null;
  created_at: string;
}

interface BuyerProfileInfo {
  id: string;
  company_name: string;
  city: string | null;
}

interface SupplierProfileInfo {
  id: string;
  shop_name: string;
  village_origin: string | null;
  craft_category: string | null;
}

function buildVerificationsUrl(params: { type: TabKey; id?: string }) {
  const search = new URLSearchParams();
  if (params.type !== 'all') search.set('type', params.type);
  if (params.id) search.set('id', params.id);
  const qs = search.toString();
  return qs ? `/admin/verifications?${qs}` : '/admin/verifications';
}

function daysWaiting(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function countPending(supabase: SupabaseServerClient, filter: TabKey) {
  let query = supabase
    .from('verifications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (filter === 'buyer' || filter === 'supplier') query = query.eq('entity_type', filter);
  if (filter === 'reverify') query = query.gt('attempt_number', 1);
  return query;
}

export default async function AdminVerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string }>;
}) {
  const sp = await searchParams;
  const type: TabKey = TABS.some((t) => t.key === sp.type) ? (sp.type as TabKey) : 'all';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Route is already gated to role = 'admin' in middleware — re-checked
  // here same as /admin (see src/app/admin/page.tsx).
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/');

  let listQuery = supabase
    .from('verifications')
    .select(
      'id, entity_id, entity_type, attempt_number, tax_code, business_license_url, id_card_url, created_at',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50);
  if (type === 'buyer' || type === 'supplier') listQuery = listQuery.eq('entity_type', type);
  if (type === 'reverify') listQuery = listQuery.gt('attempt_number', 1);

  const [{ count: unreadCount }, tabCounts, { data: queueData }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false),
    Promise.all(TABS.map((t) => countPending(supabase, t.key))),
    listQuery,
  ]);

  const queue = (queueData ?? []) as VerificationRow[];

  const buyerIds = queue.filter((v) => v.entity_type === 'buyer').map((v) => v.entity_id);
  const supplierIds = queue.filter((v) => v.entity_type === 'supplier').map((v) => v.entity_id);

  const [{ data: buyerProfilesData }, { data: supplierProfilesData }] = await Promise.all([
    buyerIds.length > 0
      ? supabase.from('buyer_profiles').select('id, company_name, city').in('id', buyerIds)
      : Promise.resolve({ data: [] as BuyerProfileInfo[] }),
    supplierIds.length > 0
      ? supabase
          .from('supplier_profiles')
          .select('id, shop_name, village_origin, craft_category')
          .in('id', supplierIds)
      : Promise.resolve({ data: [] as SupplierProfileInfo[] }),
  ]);

  const buyerById = new Map((buyerProfilesData ?? []).map((b) => [b.id, b as BuyerProfileInfo]));
  const supplierById = new Map(
    (supplierProfilesData ?? []).map((s) => [s.id, s as SupplierProfileInfo]),
  );

  function nameFor(v: VerificationRow) {
    return v.entity_type === 'buyer'
      ? (buyerById.get(v.entity_id)?.company_name ?? 'Không rõ')
      : (supplierById.get(v.entity_id)?.shop_name ?? 'Không rõ');
  }

  const selectedId = queue.some((v) => v.id === sp.id) ? sp.id : queue[0]?.id;
  const selected = queue.find((v) => v.id === selectedId) ?? null;

  let signedLicenseUrl: string | null = null;
  let signedIdCardUrl: string | null = null;
  let previousRejection: { created_at: string; rejection_reason: string | null } | null = null;

  if (selected) {
    const [licenseSigned, idCardSigned, prevAttempt] = await Promise.all([
      selected.business_license_url
        ? supabase.storage
            .from('verification-documents')
            .createSignedUrl(selected.business_license_url, 300)
        : Promise.resolve({ data: null }),
      selected.id_card_url
        ? supabase.storage.from('verification-documents').createSignedUrl(selected.id_card_url, 300)
        : Promise.resolve({ data: null }),
      selected.attempt_number > 1
        ? supabase
            .from('verifications')
            .select('created_at, rejection_reason')
            .eq('entity_id', selected.entity_id)
            .eq('entity_type', selected.entity_type)
            .eq('status', 'rejected')
            .lt('attempt_number', selected.attempt_number)
            .order('attempt_number', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    signedLicenseUrl = licenseSigned.data?.signedUrl ?? null;
    signedIdCardUrl = idCardSigned.data?.signedUrl ?? null;
    previousRejection = prevAttempt.data ?? null;
  }

  const documents = selected
    ? (
        [
          selected.business_license_url && {
            label: 'Giấy phép kinh doanh',
            icon: '📄',
            url: signedLicenseUrl,
            path: selected.business_license_url,
          },
          selected.id_card_url && {
            label: 'CCCD chủ sở hữu',
            icon: '🪪',
            url: signedIdCardUrl,
            path: selected.id_card_url,
          },
        ] as const
      ).filter((d): d is { label: string; icon: string; url: string | null; path: string } => !!d)
    : [];

  const infoItems = !selected
    ? []
    : selected.entity_type === 'buyer'
      ? [
          { label: 'Tên công ty', value: buyerById.get(selected.entity_id)?.company_name ?? '—' },
          { label: 'Mã số thuế', value: selected.tax_code ?? '—' },
          { label: 'Thành phố', value: buyerById.get(selected.entity_id)?.city ?? '—' },
          { label: 'Lần xác minh', value: `#${selected.attempt_number}` },
        ]
      : [
          { label: 'Tên xưởng', value: supplierById.get(selected.entity_id)?.shop_name ?? '—' },
          { label: 'Mã số thuế', value: selected.tax_code ?? '—' },
          {
            label: 'Làng nghề',
            value: supplierById.get(selected.entity_id)?.village_origin ?? '—',
          },
          {
            label: 'Ngành hàng',
            value: supplierById.get(selected.entity_id)?.craft_category ?? '—',
          },
        ];

  return (
    <AppShell
      header={{
        icons: [{ icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined }],
        userName: user.email ?? 'Admin',
        userRole: 'Quản trị viên',
        userInitial: 'A',
      }}
      navGroups={buildAdminNavGroups({ pendingVerificationCount: tabCounts[0]?.count ?? 0 })}
    >
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/admin" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Duyệt xác minh</span>
      </div>

      <div className="mb-[18px]">
        <div className="text-xl font-bold">Duyệt xác minh</div>
        <div className="text-brand-sub mt-1 text-[12.5px]">
          {tabCounts[0]?.count ?? 0} hồ sơ đang chờ duyệt — GPKD, CCCD của buyer &amp; supplier
        </div>
      </div>

      <div className="border-brand-border mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((tab, i) => {
          const isActive = tab.key === type;
          return (
            <Link
              key={tab.key}
              href={buildVerificationsUrl({ type: tab.key })}
              className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[12.5px] font-semibold whitespace-nowrap ${
                isActive
                  ? 'border-brand-forest text-brand-forest'
                  : 'text-brand-sub hover:text-brand-forest border-transparent'
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${
                  isActive ? 'bg-status-green-soft text-brand-forest' : 'bg-brand-bg text-brand-sub'
                }`}
              >
                {tabCounts[i]?.count ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      {queue.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-[50px] text-center">
          <div className="mb-2.5 text-[32px]">✅</div>
          <div className="mb-1.5 text-sm font-bold">Không có hồ sơ nào đang chờ ở mục này</div>
          <div className="text-brand-sub text-xs">Hàng đợi trống — quay lại sau.</div>
        </div>
      ) : (
        <div className="grid grid-cols-[340px_1fr] items-start gap-4">
          {/* QUEUE LIST */}
          <div className="border-brand-border overflow-hidden rounded-[10px] border bg-white">
            {queue.map((v) => {
              const waited = daysWaiting(v.created_at);
              const isActive = v.id === selected?.id;
              return (
                <Link
                  key={v.id}
                  href={buildVerificationsUrl({ type, id: v.id })}
                  className={`flex gap-2.5 border-b border-[#F2F0EC] p-3.5 last:border-b-0 ${
                    isActive
                      ? 'border-l-brand-forest border-l-[3px] bg-[#F0FBF5]'
                      : 'hover:bg-[#FAFAF8]'
                  }`}
                >
                  <div className="bg-brand-bg flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] text-base">
                    {v.entity_type === 'supplier' ? '🏭' : '🛒'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-bold">
                      {nameFor(v)}{' '}
                      <span
                        className={`rounded px-1.5 py-px text-[9px] font-bold ${
                          v.entity_type === 'supplier'
                            ? 'text-brand-clay bg-[#FDF1E9]'
                            : 'bg-status-blue-soft text-status-blue'
                        }`}
                      >
                        {v.entity_type === 'supplier' ? 'Supplier' : 'Buyer'}
                      </span>
                    </div>
                    <div className="text-brand-light mt-0.5 text-[11px]">
                      {v.attempt_number > 1
                        ? 'Xác minh lại — bản cập nhật'
                        : `GPKD nộp ${formatVnDate(v.created_at)}`}
                    </div>
                    <span className="text-brand-orange mt-0.5 block text-[9.5px] font-semibold">
                      ⏳ Chờ {waited <= 0 ? '<1' : waited} ngày
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* DETAIL PANEL */}
          {selected && (
            <Card>
              <CardBody padded>
                <div className="border-brand-border mb-4 flex items-center gap-3.5 border-b pb-4">
                  <div className="bg-brand-bg flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[11px] text-2xl">
                    {selected.entity_type === 'supplier' ? '🏭' : '🛒'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-base font-bold">
                      {nameFor(selected)}
                      <span
                        className={`rounded px-1.5 py-px text-[9px] font-bold ${
                          selected.entity_type === 'supplier'
                            ? 'text-brand-clay bg-[#FDF1E9]'
                            : 'bg-status-blue-soft text-status-blue'
                        }`}
                      >
                        {selected.entity_type === 'supplier' ? 'Supplier' : 'Buyer'}
                      </span>
                    </div>
                  </div>
                  <div className="bg-brand-bg text-brand-sub shrink-0 rounded-full px-2.5 py-1 text-[11px]">
                    Lần xác minh #{selected.attempt_number}
                  </div>
                </div>

                {previousRejection && (
                  <div className="mb-4 rounded-lg border border-[#FFD0D0] bg-[#FFF0F0] p-3 text-[12px] text-[#C62828]">
                    <strong className="mb-0.5 block">
                      Lần xác minh trước đã bị từ chối ({formatVnDate(previousRejection.created_at)}
                      )
                    </strong>
                    {previousRejection.rejection_reason ?? 'Không có lý do chi tiết.'}
                  </div>
                )}

                <div className="mb-[18px] grid grid-cols-2 gap-3.5">
                  {infoItems.map((item) => (
                    <div key={item.label} className="bg-brand-bg rounded-lg px-3.5 py-2.5">
                      <div className="text-brand-light mb-0.5 text-[10.5px]">{item.label}</div>
                      <div className="text-[13px] font-bold">{item.value}</div>
                    </div>
                  ))}
                </div>

                <div className="text-brand-sub mb-2.5 text-xs font-bold tracking-[.05em] uppercase">
                  Tài liệu đính kèm
                </div>
                {documents.length === 0 ? (
                  <div className="text-brand-light mb-4 text-xs">Không có tài liệu nào.</div>
                ) : (
                  documents.map((doc) => (
                    <div
                      key={doc.path}
                      className="border-brand-border mb-2.5 flex items-center gap-3 rounded-lg border-[1.5px] p-3"
                    >
                      <div className="bg-brand-bg flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg">
                        {doc.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-semibold">{doc.label}</div>
                        <div className="text-brand-light truncate text-[11px]">
                          {doc.path.split('/').pop()}
                        </div>
                      </div>
                      {doc.url ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-status-blue border-brand-border hover:border-status-blue shrink-0 rounded-md border-[1.5px] px-3 py-1.5 text-[11.5px] font-semibold"
                        >
                          👁 Xem
                        </a>
                      ) : (
                        <span className="text-brand-light shrink-0 text-[11px]">
                          Không thể tải file
                        </span>
                      )}
                    </div>
                  ))
                )}

                <VerificationActions
                  verificationId={selected.id}
                  displayName={nameFor(selected)}
                  adminUserId={user.id}
                  redirectTo={buildVerificationsUrl({ type })}
                />
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}
