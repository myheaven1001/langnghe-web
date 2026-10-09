import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/ui';
import type { BuyerAddress } from '@/lib/addresses';
import { requireBuyer } from '@/lib/buyer-shell';
import { loadCart } from '@/lib/cart';
import { features } from '@/lib/features';
import { formatVnd } from '@/lib/format';
import { CheckoutForm } from './_components/CheckoutForm';

export const metadata: Metadata = {
  title: 'Đặt hàng — LàngNghề.vn',
};

// Trang đặt hàng (kế hoạch 5.5): xem lại giỏ theo từng xưởng, chọn địa chỉ,
// đặt. Giỏ trống hoặc còn dòng lỗi thì quay về /cart.
export default async function CheckoutPage() {
  if (!features.cart) notFound();

  const { supabase, buyer, shell } = await requireBuyer();
  const [cart, { data: addressesData }] = await Promise.all([
    loadCart(supabase, buyer.id),
    supabase
      .from('buyer_addresses')
      .select(
        'id, label, recipient_name, phone, address_line, ward, district, province, is_default',
      )
      .eq('buyer_id', buyer.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);

  if (cart.lineCount === 0 || cart.hasProblems) redirect('/cart');

  return (
    <AppShell {...shell}>
      <div className="text-brand-sub mb-2 flex items-center gap-1.5 text-xs">
        <Link href="/cart" className="hover:text-brand-red">
          Giỏ hàng
        </Link>
        <span>/</span>
        <span className="text-brand-light">Đặt hàng</span>
      </div>
      <h1 className="mb-4 text-xl font-bold">Đặt hàng</h1>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          {cart.groups.map((group, i) => (
            <section
              key={group.supplierId}
              className="border-brand-border rounded-[10px] border bg-white"
            >
              <div className="border-brand-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="text-sm font-bold break-words">
                  Đơn {i + 1}: {group.supplierName}
                </h2>
                <strong className="text-sm">{formatVnd(group.subtotal)}</strong>
              </div>
              {group.lines.map((line) => (
                <div
                  key={line.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-[#F2F0EC] px-4 py-2.5 text-[13px] last:border-b-0"
                >
                  <div className="min-w-0 flex-1 basis-[180px]">
                    <div className="font-semibold break-words">{line.name}</div>
                    <div className="text-brand-sub text-xs">
                      {line.variantLabel ? `${line.variantLabel} · ` : ''}
                      {line.quantity.toLocaleString('vi-VN')} cái × {formatVnd(line.unitPrice ?? 0)}
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold">{formatVnd(line.lineTotal ?? 0)}</span>
                </div>
              ))}
            </section>
          ))}
        </div>

        <div className="min-w-0">
          <CheckoutForm
            addresses={(addressesData ?? []) as BuyerAddress[]}
            total={cart.total}
            orderCount={cart.groups.length}
          />
        </div>
      </div>
    </AppShell>
  );
}
