'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cartErrorMessage } from '@/lib/cart';

// "Thêm vào giỏ" / "Mua ngay" trên trang sản phẩm (kế hoạch 5.5) — chỉ hiện
// với buyer khi cờ giỏ hàng bật và sản phẩm có bảng giá. Gọi RPC
// cart_set_item(): chỉ gửi sản phẩm, biến thể, số lượng — không gửi giá.
export function AddToCartButtons({
  productId,
  variantId,
  qty,
}: {
  productId: string;
  variantId: string | null;
  qty: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState<'add' | 'buy' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(mode: 'add' | 'buy') {
    setBusy(mode);
    setMessage(null);
    const { error } = await supabase.rpc('cart_set_item', {
      p_product_id: productId,
      p_variant_id: variantId,
      p_quantity: qty,
      p_mode: 'add',
    });
    if (error) {
      setBusy(null);
      setMessage({ ok: false, text: cartErrorMessage(error.message, error.details) });
      return;
    }
    if (mode === 'buy') {
      router.push('/cart');
      return;
    }
    setBusy(null);
    setMessage({ ok: true, text: `Đã thêm ${qty.toLocaleString('vi-VN')} cái vào giỏ.` });
  }

  return (
    <div className="mb-3">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => add('add')}
          className="border-brand-red text-brand-red min-h-10 flex-1 rounded-md border-[1.5px] bg-white text-sm font-semibold disabled:opacity-60"
        >
          {busy === 'add' ? 'Đang thêm...' : '🛒 Thêm vào giỏ'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => add('buy')}
          className="bg-brand-orange min-h-10 flex-1 rounded-md text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy === 'buy' ? 'Đang xử lý...' : 'Mua ngay'}
        </button>
      </div>
      {message && (
        <div
          role="status"
          className={`mt-1.5 text-xs ${message.ok ? 'text-status-green font-semibold' : 'text-brand-red'}`}
        >
          {message.text}{' '}
          {message.ok && (
            <Link href="/cart" className="underline">
              Xem giỏ hàng
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
