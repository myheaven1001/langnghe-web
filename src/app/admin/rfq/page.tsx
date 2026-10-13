import type { Metadata } from 'next';
import { AppShell, Pill, StatTile, StatusPill } from '@/components/ui';
import { formatVnDateTime } from '@/lib/format';
import { requireAdmin } from '../_lib/guard';

export const metadata: Metadata = {
  title: 'Giám sát RFQ — LàngNghề.vn',
};

// Một dòng của RPC admin_rfq_monitor() (20261005094300).
interface RfqMonitorRow {
  id: string;
  title: string;
  buyer_name: string;
  status: string;
  rfq_type: string;
  created_at: string;
  deadline_at: string | null;
  targets: number;
  quotes: number;
  hours_open: number;
  stale: boolean;
}

function waited(hours: number) {
  return hours < 48 ? `${hours} giờ` : `${Math.floor(hours / 24)} ngày`;
}

// Giám sát RFQ (bước 6 — Vận hành): các yêu cầu đang mở, cái chưa có báo giá
// lên đầu. "Cần can thiệp" = mở quá 48 giờ mà chưa xưởng nào báo giá — admin
// gọi / nhắn xưởng phù hợp hoặc báo buyer điều chỉnh yêu cầu.
export default async function AdminRfqMonitorPage() {
  const { supabase, shell } = await requireAdmin();
  const { data, error } = await supabase.rpc('admin_rfq_monitor', { p_limit: 200 });
  const rows = (data ?? []) as RfqMonitorRow[];

  const stale = rows.filter((r) => r.stale).length;
  const noQuote = rows.filter((r) => r.quotes === 0).length;

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-lg font-bold">Giám sát RFQ</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          Yêu cầu báo giá đang mở (tối đa 200), chưa có báo giá xếp trước, chờ lâu nhất lên đầu.
        </div>
      </div>

      {error && (
        <div className="border-status-red-soft bg-status-red-soft text-status-red mb-4 rounded-[10px] border px-4 py-3 text-[13px]">
          Không tải được danh sách. Vui lòng thử lại.
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="RFQ đang mở" value={String(rows.length)} />
        <StatTile label="Chưa có báo giá" value={String(noQuote)} />
        <StatTile label="Cần can thiệp (quá 48 giờ, 0 báo giá)" value={String(stale)} />
      </div>

      {rows.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-12 text-center text-[13px]">
          Không có RFQ nào đang mở.
        </div>
      ) : (
        <div className="border-brand-border overflow-x-auto rounded-[10px] border bg-white">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-brand-bg border-brand-border text-brand-light border-b text-left text-xs tracking-[.05em] uppercase">
                <th className="px-3.5 py-2.5">Yêu cầu</th>
                <th className="px-3.5 py-2.5">Trạng thái</th>
                <th className="px-3.5 py-2.5">Mời / báo giá</th>
                <th className="px-3.5 py-2.5">Đã chờ</th>
                <th className="px-3.5 py-2.5">Hạn báo giá</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-[#F2F0EC] last:border-b-0 ${r.stale ? 'bg-[#FFF8F0]' : ''}`}
                >
                  <td className="max-w-[320px] px-3.5 py-3">
                    <div className="font-semibold break-words">{r.title}</div>
                    <div className="text-brand-sub text-xs break-words">
                      #{r.id.slice(0, 8).toUpperCase()} · {r.buyer_name}
                      {r.rfq_type === 'multi' ? ' · gửi nhiều xưởng' : ''}
                    </div>
                  </td>
                  <td className="px-3.5 py-3">
                    <StatusPill domain="rfq" status={r.status} />
                  </td>
                  <td className="px-3.5 py-3 whitespace-nowrap">
                    {r.targets} mời ·{' '}
                    <strong className={r.quotes === 0 ? 'text-brand-red' : ''}>
                      {r.quotes} báo giá
                    </strong>
                  </td>
                  <td className="px-3.5 py-3 whitespace-nowrap">
                    {waited(r.hours_open)}
                    {r.stale && (
                      <span className="ml-1.5">
                        <Pill tone="red">Cần can thiệp</Pill>
                      </span>
                    )}
                  </td>
                  <td className="text-brand-sub px-3.5 py-3 text-xs whitespace-nowrap">
                    {r.deadline_at ? formatVnDateTime(r.deadline_at) : 'Không nêu'}
                    <div>Gửi {formatVnDateTime(r.created_at)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
