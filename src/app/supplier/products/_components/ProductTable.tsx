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
  updated_at: string;
  categories: { name: string } | null;
  minPrice: number | null;
  thumbUrl: string | null;
}

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
      .in('id', Array.from(selected));
    setBusy(false);
    if (!error) {
      setSelected(new Set());
      router.refresh();
    }
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-[#FFD0D0] bg-[#FFF0F0] px-3.5 py-2.5 text-xs">
          <span>
            Đã chọn <strong className="text-brand-red">{selected.size}</strong> sản phẩm
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => bulkSetStatus('active')}
              className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink rounded-md border-[1.5px] bg-white px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-60"
            >
              👁 Hiện
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => bulkSetStatus('paused')}
              className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink rounded-md border-[1.5px] bg-white px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-60"
            >
              🙈 Ẩn
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm(`Xóa ${selected.size} sản phẩm đã chọn?`)) bulkSetStatus('deleted');
              }}
              className="text-brand-red rounded-md border-[1.5px] border-[#FFD0D0] bg-white px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-60"
            >
              🗑 Xóa
            </button>
          </div>
        </div>
      )}

      <div className="border-brand-border overflow-hidden rounded-[10px] border bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-brand-bg border-brand-border border-b">
              <th className="w-9 px-3.5 py-2.5">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th className="text-brand-light px-3.5 py-2.5 text-left text-[10.5px] font-bold tracking-[.05em] uppercase">
                Sản phẩm
              </th>
              <th className="text-brand-light px-3.5 py-2.5 text-left text-[10.5px] font-bold tracking-[.05em] uppercase">
                Giá / MOQ
              </th>
              <th className="text-brand-light px-3.5 py-2.5 text-left text-[10.5px] font-bold tracking-[.05em] uppercase">
                Cập nhật
              </th>
              <th className="text-brand-light px-3.5 py-2.5 text-left text-[10.5px] font-bold tracking-[.05em] uppercase">
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
                      <div className="text-brand-light mt-0.5 text-[11px]">
                        {p.categories?.name ?? 'Chưa phân loại'}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3.5 py-3">
                  {p.minPrice === null ? (
                    <span className="text-brand-light">—</span>
                  ) : (
                    <div>
                      <div className="font-semibold">{formatVnd(p.minPrice)}</div>
                      <div className="text-brand-light text-[10.5px]">
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
                    <Link
                      href={`/supplier/products/${p.id}/edit`}
                      title="Sửa"
                      className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink flex h-7 w-7 items-center justify-center rounded-md border-[1.5px] text-xs"
                    >
                      ✏️
                    </Link>
                    {p.status === 'active' && (
                      <Link
                        href={`/products/${p.id}`}
                        title="Xem"
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
