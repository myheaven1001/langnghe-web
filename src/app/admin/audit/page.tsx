import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/ui';
import { formatVnDateTime } from '@/lib/format';
import { requireAdmin } from '../_lib/guard';

export const metadata: Metadata = {
  title: 'Nhật ký hoạt động — LàngNghề.vn Admin',
};

const PAGE_SIZE = 50;

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'order', label: 'Đơn hàng' },
  { key: 'user', label: 'Người dùng' },
  { key: 'verification', label: 'Xác minh' },
  { key: 'product', label: 'Sản phẩm' },
  { key: 'category', label: 'Danh mục' },
  { key: 'setting', label: 'Cài đặt' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const ACTION_LABEL: Record<string, string> = {
  'setting.update': 'Sửa cài đặt sàn',
  'order.confirm_payment': 'Xác nhận thanh toán',
  'order.cancel': 'Hủy đơn',
  'dispute.open': 'Ghi tranh chấp',
  'dispute.resolve': 'Giải quyết tranh chấp',
  'user.suspend': 'Khoá tài khoản',
  'user.reactivate': 'Mở khoá tài khoản',
  'user.adjust_score': 'Chỉnh điểm',
  'user.grant_credit': 'Cấp / trừ credit',
  'verification.approve': 'Duyệt xác minh',
  'verification.reject': 'Từ chối xác minh',
  'product.block': 'Khoá sản phẩm',
  'product.unblock': 'Mở khoá sản phẩm',
  'category.create': 'Thêm danh mục',
  'category.update': 'Sửa danh mục',
};

interface AuditRow {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

// Trang của đối tượng bị tác động (nếu có trang riêng).
function entityHref(row: AuditRow): string | null {
  if (!row.entity_id) return null;
  switch (row.entity_type) {
    case 'order':
      return `/admin/orders/${row.entity_id}`;
    case 'user':
      return `/admin/users/${row.entity_id}`;
    case 'product':
      return `/products/${row.entity_id}`;
    case 'setting':
      return '/admin/settings';
    case 'category':
      return '/admin/categories';
    case 'verification':
      return '/admin/verifications';
    default:
      return null;
  }
}

// Vài chi tiết đáng đọc nhất của mỗi dòng, viết gọn bằng lời.
function summary(row: AuditRow): string {
  const d = row.details ?? {};
  const text = (key: string) => (d[key] == null || d[key] === '' ? null : String(d[key]));
  const parts = [
    text('name'),
    text('amount') && `${Number(d.amount) > 0 ? '+' : ''}${text('amount')} credit`,
    text('paid_amount') && `đã nhận ${Number(d.paid_amount).toLocaleString('vi-VN')}đ`,
    d.old_trust !== d.new_trust &&
      text('new_trust') &&
      `uy tín ${text('old_trust')} → ${text('new_trust')}`,
    d.old_risk !== d.new_risk &&
      text('new_risk') &&
      `rủi ro ${text('old_risk')} → ${text('new_risk')}`,
    text('resolution') && `quyết định: ${text('resolution')}`,
    text('reason') && `lý do: ${text('reason')}`,
    text('note') && `ghi chú: ${text('note')}`,
  ].filter((part): part is string => !!part);
  return parts.join(' · ');
}

function buildUrl(tab: TabKey, page = 1) {
  const search = new URLSearchParams();
  if (tab !== 'all') search.set('type', tab);
  if (page > 1) search.set('page', String(page));
  const qs = search.toString();
  return qs ? `/admin/audit?${qs}` : '/admin/audit';
}

// Nhật ký hoạt động của admin (kế hoạch 4.11): mọi thao tác đi qua hàm
// admin_* đều ghi một dòng vào admin_audit_log; bảng này chỉ admin đọc được
// và không ai sửa / xoá được qua API.
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === sp.type) ? (sp.type as TabKey) : 'all';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const { supabase, userId, shell } = await requireAdmin();

  const from = (page - 1) * PAGE_SIZE;
  let query = supabase
    .from('admin_audit_log')
    .select('id, admin_id, action, entity_type, entity_id, details, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (tab !== 'all') query = query.eq('entity_type', tab);

  const { data, count } = await query;
  const rows = (data ?? []) as AuditRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Nhật ký hoạt động</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          {count ?? 0} thao tác của quản trị viên ở mục này. Nhật ký không sửa, không xoá được.
        </div>
      </div>

      <div className="border-brand-border mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={buildUrl(t.key)}
            className={`flex min-h-10 items-center border-b-2 px-3.5 text-[13px] font-semibold whitespace-nowrap ${
              t.key === tab
                ? 'border-brand-red text-brand-red'
                : 'text-brand-sub hover:text-brand-red border-transparent'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-12 text-center">
          <div className="mb-2.5 text-[32px]">🧾</div>
          <div className="text-sm font-bold">Chưa có thao tác nào ở mục này</div>
        </div>
      ) : (
        <div className="border-brand-border rounded-[10px] border bg-white px-4">
          {rows.map((row) => {
            const href = entityHref(row);
            const detail = summary(row);
            return (
              <div
                key={row.id}
                className="border-b border-[#F2F0EC] py-3 text-[13px] last:border-b-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <strong>{ACTION_LABEL[row.action] ?? row.action}</strong>
                  <span className="text-brand-light text-xs">
                    {formatVnDateTime(row.created_at)}
                  </span>
                </div>
                {detail && (
                  <div className="text-brand-sub mt-0.5 text-xs break-words">{detail}</div>
                )}
                <div className="text-brand-light mt-0.5 text-xs">
                  {row.admin_id === userId ? 'Bạn' : `Admin ${row.admin_id.slice(0, 8)}`}
                  {href && (
                    <>
                      {' · '}
                      <Link href={href} className="text-brand-blue">
                        Mở đối tượng →
                      </Link>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3 text-[13px]">
          {page > 1 ? (
            <Link href={buildUrl(tab, page - 1)} className="text-brand-red px-2 font-semibold">
              ‹ Mới hơn
            </Link>
          ) : (
            <span className="text-brand-light px-2">‹ Mới hơn</span>
          )}
          <span className="text-brand-sub">
            Trang {page}/{totalPages}
          </span>
          {page < totalPages ? (
            <Link href={buildUrl(tab, page + 1)} className="text-brand-red px-2 font-semibold">
              Cũ hơn ›
            </Link>
          ) : (
            <span className="text-brand-light px-2">Cũ hơn ›</span>
          )}
        </div>
      )}
    </AppShell>
  );
}
