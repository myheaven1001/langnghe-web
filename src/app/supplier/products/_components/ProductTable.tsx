'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { StatusPill } from '@/components/ui';
import { formatVnDate, formatVnd } from '@/lib/format';

export interface ProductListRow {
  id: string;
  name: string;
  min_order_qty: number;
  status: string;
  /** Lý do sàn khoá sản phẩm (status = 'blocked'). */
  moderationNote?: string | null;
  updated_at: string;
  categories: { name: string } | null;
  minPrice: number | null;
  thumbUrl: string | null;
}

type BulkAction = 'adjust_price' | 'set_lead_time' | 'set_moq';

const BULK_PLACEHOLDER: Record<BulkAction, string> = {
  adjust_price: 'VD: 5 hoặc -10',
  set_lead_time: 'VD: 14',
  set_moq: 'VD: 50',
};

const BULK_CONFIRM = (percent: number, count: number) =>
  `${percent > 0 ? 'Tăng' : 'Giảm'} ${Math.abs(percent)}% mọi bậc giá của ${count} sản phẩm đã chọn? Giá mới được làm tròn tới 100đ.`;

function formatRelativeTime(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return formatVnDate(iso);
}

// Toggle Hiện/Ẩn/Xóa cập nhật trực tiếp products.status — RLS
// products_modify_supplier (FOR ALL, chủ sở hữu) đã cho phép, không cần
// RPC vì chỉ đổi 1 cột trên các dòng của chính supplier này.
export function ProductTable({ products }: { products: ProductListRow[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkAction>('adjust_price');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkMessage, setBulkMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const allChecked = products.length > 0 && selected.size === products.length;

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(products.map((p) => p.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function bulkSetStatus(status: 'active' | 'paused' | 'deleted') {
    setBusy(true);
    const { error } = await supabase
      .from('products')
      .update({ status })
      .in('id', Array.from(selected))
      // Sản phẩm bị sàn khoá không đổi trạng thái được — bỏ qua thay vì lỗi cả lô.
      .neq('status', 'blocked');
    setBusy(false);
    if (!error) {
      setSelected(new Set());
      router.refresh();
    }
  }

  // Sửa hàng loạt qua RPC bulk_update_products(): chỉ đụng sản phẩm của chính
  // xưởng, bỏ qua hàng bị sàn khoá; trả số sản phẩm đã đổi.
  async function bulkApply() {
    const value = Number(bulkValue.replace(',', '.'));
    if (bulkValue.trim() === '' || !Number.isFinite(value)) {
      setBulkMessage({ ok: false, text: 'Nhập một số.' });
      return;
    }
    if (bulkAction === 'adjust_price' && !confirm(BULK_CONFIRM(value, selected.size))) return;
    setBusy(true);
    setBulkMessage(null);
    const { data, error } = await supabase.rpc('bulk_update_products', {
      p_ids: Array.from(selected),
      p_action: bulkAction,
      p_value: value,
    });
    setBusy(false);
    if (error) {
      setBulkMessage({
        ok: false,
        text: error.message.includes('INVALID_INPUT')
          ? (error.details ?? 'Giá trị không hợp lệ.')
          : 'Không sửa được. Vui lòng thử lại.',
      });
      return;
    }
    const changed = Number(data ?? 0);
    setBulkMessage({
      ok: true,
      text:
        changed === selected.size
          ? `Đã sửa ${changed} sản phẩm.`
          : `Đã sửa ${changed}/${selected.size} sản phẩm — số còn lại bị bỏ qua (chưa có bảng giá, bị sàn khoá, hoặc MOQ mới nằm ngoài bảng giá).`,
    });
    setBulkValue('');
    router.refresh();
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#E5DDD1] bg-white px-3.5 py-2.5 text-xs">
          <span className="font-semibold">Sửa hàng loạt:</span>
          <select
            value={bulkAction}
            aria-label="Thao tác"
            onChange={(e) => {
              setBulkAction(e.target.value as BulkAction);
              setBulkMessage(null);
            }}
            className="border-brand-border min-h-9 rounded-md border-[1.5px] bg-white px-2 text-xs outline-none"
          >
            <option value="adjust_price">Tăng / giảm giá (%)</option>
            <option value="set_lead_time">Đặt thời gian sản xuất (ngày)</option>
            <option value="set_moq">Đặt số lượng tối thiểu</option>
          </select>
          <input
            value={bulkValue}
            inputMode="decimal"
            aria-label="Giá trị"
            onChange={(e) => setBulkValue(e.target.value)}
            placeholder={BULK_PLACEHOLDER[bulkAction]}
            className="border-brand-border focus:border-brand-red min-h-9 w-[130px] rounded-md border-[1.5px] px-2 text-xs outline-none"
          />
          <button
            type="button"
            disabled={busy}
            onClick={bulkApply}
            className="bg-brand-red hover:bg-brand-red-dark min-h-9 rounded-md px-3 text-xs font-semibold text-white disabled:opacity-60"
          >
            Áp dụng
          </button>
          {bulkMessage && (
            <span className={`w-full ${bulkMessage.ok ? 'text-brand-green' : 'text-brand-red'}`}>
              {bulkMessage.text}
            </span>
          )}
        </div>
      )}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-lg border border-[#FFD0D0] bg-[#FFF0F0] px-3.5 py-2.5 text-xs">
          <span>
            Đã chọn <strong className="text-brand-red">{selected.size}</strong> sản phẩm
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => bulkSetStatus('active')}
              className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink rounded-md border-[1.5px] bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            >
              👁 Hiện
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => bulkSetStatus('paused')}
              className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink rounded-md border-[1.5px] bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            >
              🙈 Ẩn
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm(`Xóa ${selected.size} sản phẩm đã chọn?`)) bulkSetStatus('deleted');
              }}
              className="text-brand-red rounded-md border-[1.5px] border-[#FFD0D0] bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            >
              🗑 Xóa
            </button>
          </div>
        </div>
      )}

      {/* Bảng kéo ngang trên điện thoại (kế hoạch 4.5). */}
      <div className="border-brand-border overflow-x-auto rounded-[10px] border bg-white">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="bg-brand-bg border-brand-border border-b">
              <th className="w-9 px-3.5 py-2.5">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th className="text-brand-light px-3.5 py-2.5 text-left text-xs font-bold tracking-[.05em] uppercase">
                Sản phẩm
              </th>
              <th className="text-brand-light px-3.5 py-2.5 text-left text-xs font-bold tracking-[.05em] uppercase">
                Giá / MOQ
              </th>
              <th className="text-brand-light px-3.5 py-2.5 text-left text-xs font-bold tracking-[.05em] uppercase">
                Cập nhật
              </th>
              <th className="text-brand-light px-3.5 py-2.5 text-left text-xs font-bold tracking-[.05em] uppercase">
                Trạng thái
              </th>
              <th className="w-[70px]" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-[#F2F0EC] last:border-b-0 hover:bg-[#FAFAF8]">
                <td className="px-3.5 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={(e) => toggleOne(p.id, e.target.checked)}
                  />
                </td>
                <td className="px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="bg-brand-bg flex h-[42px] w-[42px] shrink-0 items-center justify-center overflow-hidden rounded-lg text-lg">
                      {p.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- CDN URL từ product_media, không phải asset local next/image cần optimize
                        <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        '📦'
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-brand-ink max-w-[260px] truncate font-semibold">{p.name}</div>
                      <div className="text-brand-light mt-0.5 text-xs">
                        {p.categories?.name ?? 'Chưa phân loại'}
                      </div>
                      {p.status === 'blocked' && (
                        <div className="text-status-red mt-1 max-w-[260px] text-xs break-words whitespace-normal">
                          Sàn đã khoá: {p.moderationNote ?? 'liên hệ sàn để biết lý do'}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3.5 py-3">
                  {p.minPrice === null ? (
                    <span className="text-brand-light">—</span>
                  ) : (
                    <div>
                      <div className="font-semibold">{formatVnd(p.minPrice)}</div>
                      <div className="text-brand-light text-xs">
                        MOQ {p.min_order_qty.toLocaleString('vi-VN')}
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-3.5 py-3">{formatRelativeTime(p.updated_at)}</td>
                <td className="px-3.5 py-3">
                  <StatusPill domain="product" status={p.status} />
                </td>
                <td className="px-3.5 py-3">
                  <div className="flex justify-end gap-1.5">
                    {p.status !== 'blocked' && (
                      <Link
                        href={`/supplier/products/${p.id}/edit`}
                        title="Sửa"
                        className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink flex h-7 w-7 items-center justify-center rounded-md border-[1.5px] text-xs"
                      >
                        ✏️
                      </Link>
                    )}
                    {/* Trang sản phẩm cho chủ xưởng xem cả hàng nháp/tạm dừng (2.3). */}
                    {p.status !== 'deleted' && (
                      <Link
                        href={`/products/${p.id}`}
                        title={p.status === 'active' ? 'Xem trang sản phẩm' : 'Xem trước (chỉ bạn thấy)'}
                        className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink flex h-7 w-7 items-center justify-center rounded-md border-[1.5px] text-xs"
                      >
                        👁
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
