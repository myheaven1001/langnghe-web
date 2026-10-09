import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/ui';
import { requireBuyer } from '@/lib/buyer-shell';
import { loadCart } from '@/lib/cart';
import { features } from '@/lib/features';
import { CartClient } from './_components/CartClient';

export const metadata: Metadata = {
  title: 'Giỏ hàng — LàngNghề.vn',
};

// Giỏ hàng (kế hoạch 5.5). Ẩn sau cờ NEXT_PUBLIC_FEATURE_CART: tắt cờ thì
// trang trả 404.
export default async function CartPage() {
  if (!features.cart) notFound();

  const { supabase, buyer, shell } = await requireBuyer();
  const cart = await loadCart(supabase, buyer.id);

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Giỏ hàng</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          Đặt hàng trực tiếp các sản phẩm đã có bảng giá. Cần giá riêng hoặc làm theo mẫu thì gửi
          yêu cầu báo giá.
        </div>
      </div>
      <CartClient cart={cart} />
    </AppShell>
  );
}
