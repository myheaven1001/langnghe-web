import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell, Card, CardBody, Pill } from '@/components/ui';
import { ReportResolveButtons } from '@/components/engagement/ProductEngagement';
import { formatVnDateTime } from '@/lib/format';
import { requireAdmin } from '../_lib/guard';

export const metadata: Metadata = {
  title: 'Báo cáo vi phạm — LàngNghề.vn',
};

interface ReportRow {
  id: string;
  reporter_id: string;
  target_type: 'product' | 'supplier' | 'review';
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

const REASON_LABEL: Record<string, string> = {
  fake: 'Hàng giả / lấy ảnh nơi khác',
  wrong_info: 'Thông tin sai',
  prohibited: 'Hàng cấm',
  ip: 'Vi phạm thương hiệu',
  spam: 'Spam',
  abuse: 'Xúc phạm, quấy rối',
  other: 'Khác',
};

const TARGET_LABEL: Record<string, string> = {
  product: 'Sản phẩm',
  supplier: 'Gian hàng',
  review: 'Đánh giá',
};

const TABS = [
  { key: 'open', label: 'Chờ xử lý' },
  { key: 'closed', label: 'Đã đóng' },
] as const;

// Báo cáo vi phạm (bước 6). Admin mở đối tượng bị báo, xử lý bằng công cụ sẵn
// có (gỡ sản phẩm, ẩn đánh giá, khoá tài khoản) rồi đóng báo cáo ở đây.
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab === 'closed' ? 'closed' : 'open';

  const { supabase, shell } = await requireAdmin();
  let query = supabase
    .from('content_reports')
    .select(
      'id, reporter_id, target_type, target_id, reason, details, status, resolution_note, created_at, resolved_at',
    )
    .order('created_at', { ascending: tab === 'open' })
    .limit(100);
  query = tab === 'open' ? query.eq('status', 'open') : query.neq('status', 'open');
  const { data } = await query;
  const reports = (data ?? []) as ReportRow[];

  // Tên hiển thị của đối tượng bị báo.
  const idsOf = (type: string) => [
    ...new Set(reports.filter((r) => r.target_type === type).map((r) => r.target_id)),
  ];
  const productIds = idsOf('product');
  const supplierIds = idsOf('supplier');
  const [{ data: products }, { data: suppliers }] = await Promise.all([
    productIds.length
      ? supabase.from('products').select('id, name').in('id', productIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supplierIds.length
      ? supabase.from('supplier_profiles').select('id, shop_name').in('id', supplierIds)
      : Promise.resolve({ data: [] as { id: string; shop_name: string }[] }),
  ]);
  const productName = new Map((products ?? []).map((p) => [p.id as string, p.name as string]));
  const shopName = new Map((suppliers ?? []).map((s) => [s.id as string, s.shop_name as string]));

  function target(r: ReportRow): { name: string; href: string } {
    if (r.target_type === 'product') {
      return {
        name: productName.get(r.target_id) ?? 'Sản phẩm đã xoá',
        href: `/admin/products?q=${encodeURIComponent(productName.get(r.target_id) ?? '')}`,
      };
    }
    if (r.target_type === 'supplier') {
      return { name: shopName.get(r.target_id) ?? 'Xưởng', href: `/shops/${r.target_id}` };
    }
    return { name: 'Đánh giá', href: '/admin/reviews' };
  }

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-lg font-bold">Báo cáo vi phạm</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          Mở mục bị báo cáo, xử lý nếu có vi phạm (gỡ sản phẩm, ẩn đánh giá, khoá tài khoản) rồi
          đóng báo cáo.
        </div>
      </div>

      <div className="border-brand-border mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'open' ? '/admin/reports' : '/admin/reports?tab=closed'}
            className={`border-b-2 px-3.5 py-2.5 text-[13px] font-semibold whitespace-nowrap ${
              t.key === tab
                ? 'border-brand-forest text-brand-forest'
                : 'text-brand-sub hover:text-brand-forest border-transparent'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardBody padded>
          {reports.length === 0 ? (
            <div className="text-brand-sub text-[13px]">Không có báo cáo nào ở mục này.</div>
          ) : (
            reports.map((r) => {
              const t = target(r);
              return (
                <div
                  key={r.id}
                  className="border-b border-[#F2F0EC] py-3.5 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Pill tone="gray">{TARGET_LABEL[r.target_type]}</Pill>
                    <Link
                      href={t.href}
                      className="text-brand-blue min-w-0 text-[13px] font-bold break-words"
                    >
                      {t.name} →
                    </Link>
                    <span className="text-brand-light ml-auto text-xs">
                      {formatVnDateTime(r.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 text-[13px]">
                    <strong>{REASON_LABEL[r.reason] ?? r.reason}</strong>
                    {r.details && (
                      <span className="text-brand-sub break-words whitespace-pre-line">
                        {' '}
                        — {r.details}
                      </span>
                    )}
                  </div>
                  <div className="text-brand-light mt-0.5 text-xs">
                    Người báo:{' '}
                    <Link href={`/admin/users/${r.reporter_id}`} className="hover:text-brand-red">
                      xem tài khoản
                    </Link>
                  </div>
                  {r.status === 'open' ? (
                    <div className="mt-2">
                      <ReportResolveButtons reportId={r.id} />
                    </div>
                  ) : (
                    <div className="text-brand-sub mt-1.5 text-xs break-words">
                      <Pill tone={r.status === 'resolved' ? 'green' : 'gray'}>
                        {r.status === 'resolved' ? 'Đã xử lý' : 'Không vi phạm'}
                      </Pill>{' '}
                      {r.resolved_at ? formatVnDateTime(r.resolved_at) : ''}
                      {r.resolution_note ? ` · ${r.resolution_note}` : ''}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardBody>
      </Card>
    </AppShell>
  );
}
