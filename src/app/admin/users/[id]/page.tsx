import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, Card, CardBody, CardHeader, Pill, StatusPill } from '@/components/ui';
import { formatVnDate, formatVnDateTime } from '@/lib/format';
import { buildAdminNavGroups } from '../../_lib/nav';
import { UserAdminActions } from '../_components/UserAdminActions';
import { CreditForm, ScoreForm } from './_components/UserTools';

export const metadata: Metadata = {
  title: 'Chi tiết người dùng — LàngNghề.vn Admin',
};

const ROLE_LABEL: Record<string, string> = {
  buyer: 'Buyer',
  supplier: 'Nhà bán',
  both: 'Buyer & nhà bán',
  admin: 'Quản trị viên',
};

const AUDIT_LABEL: Record<string, string> = {
  'user.suspend': 'Khoá tài khoản',
  'user.reactivate': 'Mở khoá tài khoản',
  'user.adjust_score': 'Chỉnh điểm',
  'user.grant_credit': 'Cấp / trừ credit',
};

interface AuditRow {
  id: string;
  action: string;
  details: {
    reason?: string;
    amount?: number;
    profile_type?: string;
    old_trust?: number;
    new_trust?: number;
    old_risk?: number;
    new_risk?: number;
  } | null;
  created_at: string;
}

function auditSummary(row: AuditRow): string {
  const d = row.details ?? {};
  const parts: string[] = [];
  if (row.action === 'user.grant_credit' && d.amount != null) {
    parts.push(d.amount > 0 ? `+${d.amount} credit` : `${d.amount} credit`);
  }
  if (row.action === 'user.adjust_score') {
    if (d.old_trust !== d.new_trust) parts.push(`uy tín ${d.old_trust} → ${d.new_trust}`);
    if (d.old_risk !== d.new_risk) parts.push(`rủi ro ${d.old_risk} → ${d.new_risk}`);
    if (d.profile_type) parts.push(d.profile_type === 'buyer' ? 'hồ sơ buyer' : 'hồ sơ xưởng');
  }
  if (d.reason) parts.push(`lý do: ${d.reason}`);
  return parts.join(' · ');
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#F2F0EC] py-2 text-[13px] last:border-b-0">
      <span className="text-brand-sub shrink-0">{label}</span>
      <span className="text-brand-ink text-right font-semibold break-words">{value}</span>
    </div>
  );
}

// Chi tiết một tài khoản cho admin (kế hoạch 4.10): hồ sơ buyer / xưởng,
// khoá – mở khoá, chỉnh điểm uy tín / rủi ro, cấp credit, và nhật ký các thao
// tác admin đã làm trên tài khoản này. Mọi thao tác đi qua hàm admin_*.
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/');

  const { data: target } = await supabase
    .from('users')
    .select('id, role, status')
    .eq('id', id)
    .maybeSingle();
  if (!target) notFound();

  const [
    { data: buyer },
    { data: supplier },
    { data: auditData },
    { count: unreadCount },
    { count: pendingVerificationCount },
  ] = await Promise.all([
    supabase
      .from('buyer_profiles')
      .select(
        'id, company_name, city, tax_code, trust_score, risk_score, credit_balance, quota_used_this_month, verified_at, created_at',
      )
      .eq('user_id', id)
      .maybeSingle(),
    supabase
      .from('supplier_profiles')
      .select(
        'id, shop_name, village_origin, craft_category, trust_score, risk_score, total_orders, verified_at, created_at',
      )
      .eq('user_id', id)
      .maybeSingle(),
    supabase
      .from('admin_audit_log')
      .select('id, action, details, created_at')
      .eq('entity_type', 'user')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false),
    supabase
      .from('verifications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  const [{ count: buyerOrderCount }, { count: buyerRfqCount }, { count: supplierProductCount }] =
    await Promise.all([
      buyer
        ? supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('buyer_id', buyer.id)
        : Promise.resolve({ count: null }),
      buyer
        ? supabase
            .from('rfq_requests')
            .select('id', { count: 'exact', head: true })
            .eq('buyer_id', buyer.id)
        : Promise.resolve({ count: null }),
      supplier
        ? supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('supplier_id', supplier.id)
            .neq('status', 'deleted')
        : Promise.resolve({ count: null }),
    ]);

  const audit = (auditData ?? []) as AuditRow[];
  const name =
    buyer?.company_name ?? supplier?.shop_name ?? (target.role === 'admin' ? 'Admin' : 'Không rõ');
  const isSelf = target.id === user.id;
  const canModerate = target.role !== 'admin' && !isSelf;

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
      <div className="text-brand-sub mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <Link href="/admin/users" className="hover:text-brand-red">
          Quản lý user
        </Link>
        <span>/</span>
        <span className="text-brand-light break-all">{name}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold break-words">{name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Pill tone="blue">{ROLE_LABEL[target.role] ?? target.role}</Pill>
            <StatusPill domain="user" status={target.status} />
            {(buyer?.verified_at || supplier?.verified_at) && (
              <Pill tone="green">✓ Đã xác minh</Pill>
            )}
          </div>
        </div>
        {canModerate && <UserAdminActions userId={target.id} status={target.status} name={name} />}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {buyer && (
            <Card>
              <CardHeader title={<>🛒 Hồ sơ buyer</>} />
              <CardBody padded>
                <InfoRow label="Công ty / cửa hàng" value={buyer.company_name} />
                {buyer.city && <InfoRow label="Khu vực" value={buyer.city} />}
                {buyer.tax_code && <InfoRow label="Mã số thuế" value={buyer.tax_code} />}
                <InfoRow label="Tham gia" value={formatVnDate(buyer.created_at)} />
                <InfoRow
                  label="Xác minh"
                  value={buyer.verified_at ? formatVnDate(buyer.verified_at) : 'Chưa xác minh'}
                />
                <InfoRow label="RFQ đã gửi" value={buyerRfqCount ?? 0} />
                <InfoRow label="Đơn hàng" value={buyerOrderCount ?? 0} />
                <InfoRow label="RFQ dùng trong tháng" value={buyer.quota_used_this_month} />
                <InfoRow
                  label="Điểm uy tín / rủi ro"
                  value={`${buyer.trust_score} / ${buyer.risk_score}`}
                />
              </CardBody>
            </Card>
          )}

          {supplier && (
            <Card>
              <CardHeader
                title={<>🏭 Hồ sơ xưởng</>}
                action={
                  <Link
                    href={`/shops/${supplier.id}`}
                    className="text-brand-red text-xs font-semibold hover:underline"
                  >
                    Xem gian hàng →
                  </Link>
                }
              />
              <CardBody padded>
                <InfoRow label="Tên xưởng" value={supplier.shop_name} />
                {supplier.village_origin && (
                  <InfoRow label="Làng nghề" value={supplier.village_origin} />
                )}
                {supplier.craft_category && (
                  <InfoRow label="Ngành nghề" value={supplier.craft_category} />
                )}
                <InfoRow label="Tham gia" value={formatVnDate(supplier.created_at)} />
                <InfoRow
                  label="Xác minh"
                  value={
                    supplier.verified_at ? formatVnDate(supplier.verified_at) : 'Chưa xác minh'
                  }
                />
                <InfoRow label="Sản phẩm" value={supplierProductCount ?? 0} />
                <InfoRow label="Đơn đã hoàn tất" value={supplier.total_orders} />
                <InfoRow
                  label="Điểm uy tín / rủi ro"
                  value={`${supplier.trust_score} / ${supplier.risk_score}`}
                />
              </CardBody>
            </Card>
          )}

          {!buyer && !supplier && (
            <div className="border-brand-border text-brand-sub mb-4 rounded-[10px] border bg-white px-4 py-6 text-center text-[13px]">
              Tài khoản này chưa có hồ sơ buyer hay xưởng
              {target.status === 'pending' ? ' (chưa hoàn tất đăng ký).' : '.'}
            </div>
          )}

          <Card>
            <CardHeader title={<>🧾 Nhật ký admin trên tài khoản này</>} />
            <CardBody padded>
              {audit.length === 0 ? (
                <div className="text-brand-light text-[13px]">Chưa có thao tác nào.</div>
              ) : (
                audit.map((row) => (
                  <div
                    key={row.id}
                    className="border-b border-[#F2F0EC] py-2.5 text-[13px] first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <div className="flex flex-wrap justify-between gap-x-3">
                      <strong>{AUDIT_LABEL[row.action] ?? row.action}</strong>
                      <span className="text-brand-light text-xs">
                        {formatVnDateTime(row.created_at)}
                      </span>
                    </div>
                    {auditSummary(row) && (
                      <div className="text-brand-sub mt-0.5 text-xs break-words">
                        {auditSummary(row)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        {/* CÔNG CỤ */}
        <div className="min-w-0">
          {buyer && (
            <>
              <Card>
                <CardHeader title={<>🎟️ Credit RFQ</>} />
                <CardBody padded>
                  <CreditForm buyerId={buyer.id} balance={buyer.credit_balance} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title={<>📊 Điểm của buyer</>} />
                <CardBody padded>
                  <ScoreForm
                    profileType="buyer"
                    profileId={buyer.id}
                    trustScore={buyer.trust_score}
                    riskScore={buyer.risk_score}
                  />
                </CardBody>
              </Card>
            </>
          )}
          {supplier && (
            <Card>
              <CardHeader title={<>📊 Điểm của xưởng</>} />
              <CardBody padded>
                <ScoreForm
                  profileType="supplier"
                  profileId={supplier.id}
                  trustScore={supplier.trust_score}
                  riskScore={supplier.risk_score}
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
