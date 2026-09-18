import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, Card, CardBody, CardHeader } from '@/components/ui';
import { formatVnDate } from '@/lib/format';
import { buildSupplierNavGroups } from '../../_lib/nav';
import { getNewRfqCount, getUnreadNotificationCount } from '../../_lib/counts';
import { WorkshopForm } from './_components/WorkshopForm';
import { VerificationUpload } from './_components/VerificationUpload';

export const metadata: Metadata = {
  title: 'Hồ sơ & xác minh xưởng — LàngNghề.vn',
};

const STATUS_BLOCK: Record<
  'none' | 'pending' | 'approved' | 'rejected',
  { icon: string; title: string; tone: 'green' | 'amber' | 'red' | 'gray' }
> = {
  none: { icon: '📋', title: 'Chưa xác minh', tone: 'gray' },
  pending: { icon: '⏳', title: 'Đang chờ duyệt', tone: 'amber' },
  approved: { icon: '✅', title: 'Đã xác minh', tone: 'green' },
  rejected: { icon: '❌', title: 'Bị từ chối', tone: 'red' },
};

const TONE_CLASSNAMES: Record<'green' | 'amber' | 'red' | 'gray', { block: string; title: string }> = {
  green: { block: 'bg-[#F0FBF5] border-[#B8E6D3]', title: 'text-status-green' },
  amber: { block: 'bg-[#FFF8F0] border-[#FFD6A8]', title: 'text-[#7A4D0E]' },
  red: { block: 'bg-[#FFF0F0] border-[#FFCDD2]', title: 'text-status-red' },
  gray: { block: 'bg-brand-bg border-brand-border', title: 'text-brand-sub' },
};

interface VerificationRow {
  id: string;
  attempt_number: number;
  status: string;
  business_license_url: string | null;
  rejection_reason: string | null;
  verified_at: string | null;
  created_at: string;
}

function trustLabel(score: number) {
  if (score >= 80) return 'Rất tốt';
  if (score >= 50) return 'Tốt';
  return 'Cần cải thiện';
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default async function SupplierProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: supplier } = await supabase
    .from('supplier_profiles')
    .select(
      'id, shop_name, village_origin, tax_code, craft_category, founding_year, monthly_capacity, trust_score, created_at',
    )
    .eq('user_id', user.id)
    .single();

  if (!supplier) redirect('/');

  const [
    newRfqCount,
    unreadCount,
    { data: categories },
    { data: verificationsData },
    { count: targetedCount },
    { count: totalQuotesCount },
    { count: acceptedQuotesCount },
    { count: totalOrdersCount },
  ] = await Promise.all([
    getNewRfqCount(supabase, supplier.id),
    getUnreadNotificationCount(supabase, user.id),
    supabase.from('categories').select('id, name').order('sort_order'),
    supabase
      .from('verifications')
      .select('id, attempt_number, status, business_license_url, rejection_reason, verified_at, created_at')
      .eq('entity_id', supplier.id)
      .eq('entity_type', 'supplier')
      .order('attempt_number', { ascending: false }),
    supabase.from('rfq_targets').select('id', { count: 'exact', head: true }).eq('supplier_id', supplier.id),
    supabase.from('rfq_quotes').select('id', { count: 'exact', head: true }).eq('supplier_id', supplier.id),
    supabase
      .from('rfq_quotes')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', supplier.id)
      .eq('status', 'accepted'),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('supplier_id', supplier.id),
  ]);

  const verifications = (verificationsData ?? []) as VerificationRow[];
  const latest = verifications[0] ?? null;
  const nextAttemptNumber = (latest?.attempt_number ?? 0) + 1;
  const statusKey = (latest?.status as 'pending' | 'approved' | 'rejected' | undefined) ?? 'none';
  const statusInfo = STATUS_BLOCK[statusKey];
  const toneClasses = TONE_CLASSNAMES[statusInfo.tone];

  const responseRate = targetedCount ? Math.round(((totalQuotesCount ?? 0) / targetedCount) * 100) : null;
  const winRate = totalQuotesCount ? Math.round(((acceptedQuotesCount ?? 0) / totalQuotesCount) * 100) : null;

  let docName: string | null = null;
  let docSize: string | null = null;
  let docSignedUrl: string | null = null;
  if (latest?.business_license_url) {
    const path = latest.business_license_url;
    docName = path.split('/').pop()!.replace(/^\d+-/, '');
    const folder = path.slice(0, path.lastIndexOf('/'));
    const fileName = path.slice(path.lastIndexOf('/') + 1);

    const [{ data: listing }, { data: signed }] = await Promise.all([
      supabase.storage.from('verification-documents').list(folder),
      supabase.storage.from('verification-documents').createSignedUrl(path, 300),
    ]);
    const entry = listing?.find((f) => f.name === fileName);
    if (entry?.metadata?.size) docSize = formatBytes(entry.metadata.size as number);
    docSignedUrl = signed?.signedUrl ?? null;
  }

  const ringCircumference = 2 * Math.PI * 23;
  const ringOffset = ringCircumference * (1 - supplier.trust_score / 100);

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
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/supplier/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Hồ sơ & xác minh xưởng</span>
      </div>

      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-bold">Hồ sơ & xác minh xưởng</div>
          <div className="text-brand-sub mt-1 text-[12.5px]">
            Quản lý thông tin xưởng và trạng thái xác minh gian hàng của bạn.
          </div>
        </div>
        {statusKey === 'approved' && (
          <span className="bg-status-green-soft text-status-green inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold">
            ✓ Xưởng đã xác minh
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]">
        {/* LEFT */}
        <div>
          <Card>
            <CardHeader title={<>🏭 Thông tin xưởng sản xuất</>} />
            <CardBody padded>
              <WorkshopForm
                userId={user.id}
                categories={categories ?? []}
                shopName={supplier.shop_name}
                villageOrigin={supplier.village_origin}
                taxCode={supplier.tax_code}
                craftCategory={supplier.craft_category}
                foundingYear={supplier.founding_year}
                monthlyCapacity={supplier.monthly_capacity}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<>🛡️ Xác minh doanh nghiệp</>} />
            <CardBody padded>
              <div className={`mb-4 flex items-center gap-3 rounded-lg border p-3.5 ${toneClasses.block}`}>
                <div className="text-2xl">{statusInfo.icon}</div>
                <div>
                  <div className={`text-[13.5px] font-bold ${toneClasses.title}`}>{statusInfo.title}</div>
                  <div className="text-brand-sub mt-0.5 text-[11.5px] leading-relaxed">
                    {statusKey === 'none' &&
                      'Tải lên giấy phép kinh doanh để xác minh gian hàng và hiển thị huy hiệu "Đã xác minh" với buyer.'}
                    {statusKey === 'pending' &&
                      `Giấy tờ đã gửi lúc ${formatVnDate(latest!.created_at)}. Đội kiểm duyệt sẽ xem xét trong 1–2 ngày làm việc.`}
                    {statusKey === 'approved' &&
                      `Hồ sơ xưởng đã được duyệt${latest?.verified_at ? ` vào ${formatVnDate(latest.verified_at)}` : ''}. Gian hàng hiển thị huy hiệu "Đã xác minh" công khai với buyer.`}
                    {statusKey === 'rejected' &&
                      `Lý do: ${latest?.rejection_reason ?? 'không rõ'}. Vui lòng tải lên giấy tờ mới để xác minh lại.`}
                  </div>
                </div>
              </div>

              {latest?.business_license_url && (
                <div className="border-brand-border mb-3.5 flex items-center gap-3 rounded-lg border-[1.5px] p-2.5 px-3.5">
                  <div className="bg-brand-bg flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-base">
                    📄
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold">{docName}</div>
                    <div className="text-brand-light mt-0.5 text-[11px]">
                      Tải lên {formatVnDate(latest.created_at)}
                      {docSize ? ` · ${docSize}` : ''}
                    </div>
                  </div>
                  {docSignedUrl && (
                    <a
                      href={docSignedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-blue shrink-0 text-[11.5px] font-semibold"
                    >
                      Xem file
                    </a>
                  )}
                </div>
              )}

              {statusKey === 'approved' && (
                <div className="text-brand-light mb-3 text-[11px]">
                  Nếu thông tin doanh nghiệp thay đổi, vui lòng tải lên giấy tờ mới để xác minh lại.
                </div>
              )}

              <VerificationUpload supplierId={supplier.id} nextAttemptNumber={nextAttemptNumber} />
            </CardBody>
          </Card>

          {verifications.length > 0 && (
            <Card>
              <CardHeader title={<>🕒 Lịch sử xác minh</>} />
              <CardBody padded>
                <div className="flex flex-col">
                  {verifications.map((v, i) => (
                    <div key={v.id} className="relative flex gap-3 pb-4 last:pb-0">
                      {i < verifications.length - 1 && (
                        <div className="bg-brand-border absolute top-6 left-[10px] bottom-0 w-[1.5px]" />
                      )}
                      <div
                        className={`z-10 flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full text-[10px] text-white ${
                          v.status === 'approved'
                            ? 'bg-brand-green'
                            : v.status === 'rejected'
                              ? 'bg-brand-red'
                              : 'bg-brand-light'
                        }`}
                      >
                        {v.status === 'approved' ? '✓' : v.status === 'rejected' ? '✕' : '…'}
                      </div>
                      <div className="flex-1">
                        <div className="text-[12.5px] font-bold">
                          Lần xác minh #{v.attempt_number} —{' '}
                          {v.status === 'approved'
                            ? 'Đã duyệt'
                            : v.status === 'rejected'
                              ? 'Bị từ chối'
                              : 'Đang chờ duyệt'}
                        </div>
                        {v.rejection_reason && (
                          <div className="text-brand-sub mt-0.5 text-[11.5px] leading-relaxed">
                            Lý do: {v.rejection_reason}
                          </div>
                        )}
                        <div className="text-brand-light mt-0.5 text-[10.5px]">{formatVnDate(v.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        {/* RIGHT RAIL */}
        <div>
          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="mb-3.5 border-b border-[#F2F0EC] pb-3.5 text-center">
              {statusKey === 'approved' && (
                <span className="bg-status-green-soft text-status-green mb-2.5 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold">
                  ✓ Đã xác minh
                </span>
              )}
              <div className="flex items-center justify-center gap-3">
                <div className="relative h-14 w-14 shrink-0">
                  <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
                    <circle cx="28" cy="28" r="23" fill="none" stroke="#F0EFEC" strokeWidth="6" />
                    <circle
                      cx="28"
                      cy="28"
                      r="23"
                      fill="none"
                      stroke="#00A650"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                    />
                  </svg>
                  <div className="font-tight absolute inset-0 flex items-center justify-center text-sm font-bold">
                    {supplier.trust_score}
                  </div>
                </div>
                <div className="text-brand-sub text-left text-[11px] leading-relaxed">
                  Điểm uy tín
                  <br />
                  <strong className="text-brand-ink">{trustLabel(supplier.trust_score)}</strong>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-brand-bg rounded-lg px-2.5 py-2">
                <div className="font-tight text-[15px] font-bold">{totalOrdersCount ?? 0}</div>
                <div className="text-brand-sub mt-0.5 text-[10px]">Tổng đơn hàng</div>
              </div>
              <div className="bg-brand-bg rounded-lg px-2.5 py-2">
                <div className="font-tight text-[15px] font-bold">
                  {responseRate === null ? '—' : `${responseRate}%`}
                </div>
                <div className="text-brand-sub mt-0.5 text-[10px]">Tỷ lệ phản hồi</div>
              </div>
            </div>
          </div>

          <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Thông tin gian hàng
            </div>
            <div className="flex justify-between border-b border-[#F2F0EC] py-[7px] text-xs">
              <span className="text-brand-sub">Ngày tham gia</span>
              <span className="text-brand-ink text-right font-semibold">{formatVnDate(supplier.created_at)}</span>
            </div>
            {latest?.verified_at && (
              <div className="flex justify-between border-b border-[#F2F0EC] py-[7px] text-xs">
                <span className="text-brand-sub">Ngày xác minh</span>
                <span className="text-brand-ink text-right font-semibold">{formatVnDate(latest.verified_at)}</span>
              </div>
            )}
            <div className="flex justify-between py-[7px] text-xs">
              <span className="text-brand-sub">Tỷ lệ chốt báo giá</span>
              <span className="text-brand-ink text-right font-semibold">
                {winRate === null ? '—' : `${winRate}%`}
              </span>
            </div>
          </div>

          <div className="border-brand-border rounded-[10px] border bg-white p-4">
            <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
              Vì sao nên xác minh?
            </div>
            {[
              ['🏅', 'Huy hiệu "Đã xác minh" tăng tỷ lệ buyer chọn báo giá của bạn'],
              ['📈', 'Tăng điểm uy tín, được ưu tiên hiển thị trong tìm kiếm'],
              ['🔒', 'Đủ điều kiện nhận thanh toán qua Escrow an toàn'],
            ].map(([icon, text]) => (
              <div key={text} className="text-brand-sub mb-2.5 flex gap-2 text-xs leading-relaxed last:mb-0">
                <span className="shrink-0">{icon}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
