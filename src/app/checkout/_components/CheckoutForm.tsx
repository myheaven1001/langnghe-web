'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, Textarea } from '@/components/ui';
import { formatAddressLine, type BuyerAddress } from '@/lib/addresses';
import { cartErrorMessage } from '@/lib/cart';
import { formatVnd } from '@/lib/format';

// Bước đặt hàng (kế hoạch 5.5): chọn địa chỉ + ghi chú rồi gọi RPC
// checkout_cart(). Hàm tự kiểm tra lại giỏ, tính lại giá, tách mỗi xưởng một
// đơn và xoá giỏ trong MỘT transaction — lỗi ở dòng nào thì không đơn nào
// được tạo. Trình duyệt không gửi giá lên.
export function CheckoutForm({
  addresses,
  total,
  orderCount,
}: {
  addresses: BuyerAddress[];
  total: number;
  orderCount: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [addressId, setAddressId] = useState(
    (addresses.find((a) => a.is_default) ?? addresses[0])?.id ?? '',
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!addressId) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('checkout_cart', {
      p_address_id: addressId,
      p_note: note,
    });
    if (error) {
      setBusy(false);
      setError(cartErrorMessage(error.message, error.details));
      return;
    }
    const ids = ((data as { order_ids?: string[] } | null)?.order_ids ?? []).join(',');
    // Giữ nút ở trạng thái bận tới khi chuyển trang (tránh bấm đặt lần hai).
    router.push(`/checkout/success?orders=${encodeURIComponent(ids)}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="border-brand-border rounded-[10px] border bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">📍 Giao hàng đến</h2>
          <Link
            href={`/settings/addresses?next=${encodeURIComponent('/checkout')}`}
            className="text-brand-red text-xs font-semibold"
          >
            {addresses.length > 0 ? 'Sửa sổ địa chỉ' : '+ Thêm địa chỉ'}
          </Link>
        </div>
        {addresses.length === 0 ? (
          <div className="text-brand-sub text-[13px]">
            Bạn chưa có địa chỉ giao hàng. Thêm địa chỉ rồi quay lại để đặt hàng.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {addresses.map((a) => (
              <label
                key={a.id}
                className={`flex min-h-12 cursor-pointer gap-2.5 rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] ${
                  addressId === a.id ? 'border-brand-green bg-[#F2FBF6]' : 'border-brand-border'
                }`}
              >
                <input
                  type="radio"
                  name="address"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={addressId === a.id}
                  onChange={() => setAddressId(a.id)}
                />
                <span className="min-w-0">
                  <span className="font-semibold break-words">
                    {a.recipient_name} — {a.phone}
                  </span>
                  {a.label && <span className="text-brand-sub"> · {a.label}</span>}
                  <span className="text-brand-sub block break-words">{formatAddressLine(a)}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="border-brand-border rounded-[10px] border bg-white p-4">
        <Field
          label="Ghi chú cho xưởng"
          hint="Không bắt buộc. Mọi xưởng trong lần đặt này đều thấy."
        >
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder="VD: Giao giờ hành chính, đóng thùng chống vỡ"
          />
        </Field>
      </section>

      {error && (
        <div className="border-status-red-soft bg-status-red-soft text-status-red rounded-lg border px-3 py-2.5 text-[13px]">
          {error}{' '}
          <Link href="/cart" className="font-semibold underline">
            Về giỏ hàng
          </Link>
        </div>
      )}

      <section className="border-brand-border rounded-[10px] border bg-white p-4">
        <div className="flex justify-between text-[15px] font-bold">
          <span>Tổng {orderCount} đơn</span>
          <span>{formatVnd(total)}</span>
        </div>
        <div className="text-brand-sub mt-1.5 text-xs leading-relaxed">
          Bạn chưa cần chuyển tiền. Xưởng xác nhận nhận đơn trước; khi đó trang đơn hàng sẽ hiện
          thông tin chuyển khoản. Số tiền cuối cùng do hệ thống tính lại lúc đặt theo bảng giá hiện
          hành.
        </div>
        <Button size="lg" block className="mt-3" disabled={busy || !addressId} onClick={submit}>
          {busy ? 'Đang đặt hàng...' : `Đặt ${orderCount} đơn hàng`}
        </Button>
      </section>
    </div>
  );
}
