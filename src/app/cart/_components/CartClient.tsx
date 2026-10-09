'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ButtonLink } from '@/components/ui';
import { CART_PROBLEM_TEXT, cartErrorMessage, type Cart, type CartLine } from '@/lib/cart';
import { formatVnd } from '@/lib/format';

// Giỏ hàng (kế hoạch 5.5): sửa số lượng / bỏ dòng qua RPC cart_set_item() rồi
// tải lại dữ liệu server. Giá hiển thị do server tính (lib/cart.loadCart) và
// được tính lại lần nữa lúc đặt — sửa giá trong trình duyệt không có tác dụng.
export function CartClient({ cart }: { cart: Cart }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Số lượng đang gõ dở của từng dòng (chưa lưu).
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function setQuantity(line: CartLine, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 0) return;
    setBusyId(line.id);
    setError(null);
    const { error } = line.productId
      ? await supabase.rpc('cart_set_item', {
          p_product_id: line.productId,
          p_variant_id: line.variantId,
          p_quantity: quantity,
          p_mode: 'set',
        })
      : // Sản phẩm đã bị xoá hẳn: không còn id để gọi hàm → xoá dòng trực tiếp.
        await supabase.from('cart_items').delete().eq('id', line.id);
    setBusyId(null);
    if (error) {
      setError(cartErrorMessage(error.message, error.details));
      return;
    }
    setDrafts((d) => {
      const next = { ...d };
      delete next[line.id];
      return next;
    });
    router.refresh();
  }

  function commitDraft(line: CartLine) {
    const draft = drafts[line.id];
    if (draft === undefined) return;
    const value = Math.floor(Number(draft));
    if (!Number.isFinite(value) || value < 1 || value === line.quantity) {
      setDrafts((d) => {
        const next = { ...d };
        delete next[line.id];
        return next;
      });
      return;
    }
    void setQuantity(line, value);
  }

  if (cart.lineCount === 0) {
    return (
      <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-12 text-center">
        <div className="mb-2.5 text-[32px]">🛒</div>
        <div className="mb-1.5 text-sm font-bold">Giỏ hàng đang trống</div>
        <div className="text-brand-sub mb-4 text-[13px]">
          Thêm sản phẩm có sẵn giá từ trang sản phẩm để đặt hàng trực tiếp.
        </div>
        <ButtonLink href="/search">Xem sản phẩm</ButtonLink>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        {error && (
          <div className="border-status-red-soft bg-status-red-soft text-status-red rounded-lg border px-3 py-2 text-[13px]">
            {error}
          </div>
        )}

        {cart.groups.map((group) => (
          <section
            key={group.supplierId ?? 'none'}
            className="border-brand-border rounded-[10px] border bg-white"
          >
            <div className="border-brand-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-sm font-bold break-words">🏭 {group.supplierName}</h2>
              <span className="text-brand-sub text-xs">
                Tạm tính: <strong className="text-brand-ink">{formatVnd(group.subtotal)}</strong>
              </span>
            </div>

            {group.lines.map((line) => {
              const busy = busyId === line.id;
              return (
                <div
                  key={line.id}
                  className={`flex flex-wrap gap-3 border-b border-[#F2F0EC] px-4 py-3 last:border-b-0 ${
                    busy ? 'opacity-60' : ''
                  }`}
                >
                  <div className="bg-brand-bg flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg text-2xl">
                    {line.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- ảnh ở Supabase Storage
                      <img
                        src={line.imageUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      '📦'
                    )}
                  </div>

                  <div className="min-w-0 flex-1 basis-[180px]">
                    {line.productId ? (
                      <Link
                        href={`/products/${line.productId}`}
                        className="text-brand-ink hover:text-brand-red line-clamp-2 text-sm font-bold"
                      >
                        {line.name}
                      </Link>
                    ) : (
                      <div className="text-sm font-bold">{line.name}</div>
                    )}
                    {line.variantLabel && (
                      <div className="text-brand-sub text-xs break-words">{line.variantLabel}</div>
                    )}
                    <div className="text-brand-sub mt-0.5 text-xs">
                      {line.unitPrice != null
                        ? `${formatVnd(line.unitPrice)} / cái`
                        : 'Chưa có giá'}{' '}
                      · tối thiểu {line.moq.toLocaleString('vi-VN')}
                      {line.stock != null &&
                        ` · còn ${line.stock.toLocaleString('vi-VN')} trong kho`}
                    </div>
                    {line.problem && (
                      <div className="text-status-red mt-1 text-xs font-semibold">
                        {CART_PROBLEM_TEXT[line.problem]}
                        {line.problem === 'below_moq' &&
                          ` Hiện có ${line.productQty.toLocaleString('vi-VN')}/${line.moq.toLocaleString('vi-VN')}.`}
                      </div>
                    )}
                  </div>

                  <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end sm:justify-start">
                    <div className="border-brand-border flex items-center overflow-hidden rounded-lg border-[1.5px]">
                      <button
                        type="button"
                        aria-label="Giảm số lượng"
                        disabled={busy || line.quantity <= 1 || !line.productId}
                        onClick={() => setQuantity(line, line.quantity - 1)}
                        className="flex h-10 w-10 items-center justify-center text-lg disabled:opacity-40"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        aria-label="Số lượng"
                        disabled={busy || !line.productId}
                        value={drafts[line.id] ?? String(line.quantity)}
                        onChange={(e) => setDrafts((d) => ({ ...d, [line.id]: e.target.value }))}
                        onBlur={() => commitDraft(line)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                        className="border-brand-border h-10 w-[72px] border-x text-center font-semibold outline-none"
                      />
                      <button
                        type="button"
                        aria-label="Tăng số lượng"
                        disabled={busy || !line.productId}
                        onClick={() => setQuantity(line, line.quantity + 1)}
                        className="flex h-10 w-10 items-center justify-center text-lg disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-right">
                      <div className="font-tight text-[15px] font-bold">
                        {line.lineTotal != null && !line.problem ? formatVnd(line.lineTotal) : '—'}
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setQuantity(line, 0)}
                        className="text-brand-red min-h-8 text-xs font-semibold disabled:opacity-50"
                      >
                        Bỏ khỏi giỏ
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <aside className="border-brand-border min-w-0 rounded-[10px] border bg-white p-4 lg:sticky lg:top-[72px]">
        <div className="mb-3 text-sm font-bold">Tóm tắt</div>
        <div className="text-brand-sub flex justify-between py-1 text-[13px]">
          <span>Số xưởng</span>
          <span>{cart.groups.filter((g) => g.supplierId).length}</span>
        </div>
        <div className="text-brand-sub flex justify-between py-1 text-[13px]">
          <span>Số dòng hàng</span>
          <span>{cart.lineCount}</span>
        </div>
        <div className="border-brand-border mt-2 flex justify-between border-t pt-3 text-[15px] font-bold">
          <span>Tạm tính</span>
          <span>{formatVnd(cart.total)}</span>
        </div>
        <div className="text-brand-sub mt-2 text-xs leading-relaxed">
          Mỗi xưởng thành một đơn riêng. Xưởng xác nhận đơn trước, sau đó bạn mới chuyển khoản. Giá
          chưa gồm vận chuyển.
        </div>
        {cart.hasProblems ? (
          <div className="bg-status-amber-soft text-status-amber mt-3 rounded-lg px-3 py-2 text-xs font-semibold">
            Còn dòng hàng chưa đặt được — sửa hoặc bỏ các dòng được đánh dấu đỏ.
          </div>
        ) : (
          <ButtonLink href="/checkout" block size="lg" className="mt-3">
            Tiến hành đặt hàng
          </ButtonLink>
        )}
      </aside>
    </div>
  );
}
