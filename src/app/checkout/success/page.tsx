import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell, ButtonLink, StatusPill } from '@/components/ui';
import { requireBuyer } from '@/lib/buyer-shell';
import { features } from '@/lib/features';
import { formatVnd } from '@/lib/format';
import { orderCode } from '@/lib/orders';

export const metadata: Metadata = {
  title: 'Đã đặt hàng — LàngNghề.vn',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Trang sau khi đặt hàng (kế hoạch 5.5): liệt kê các đơn vừa tạo. Id lấy từ
// URL nhưng đơn được đọc lại từ database theo buyer đang đăng nhập — sửa URL
// không xem được đơn của người khác.
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orders?: string }>;
}) {
  if (!features.cart) notFound();

  const ids = ((await searchParams).orders ?? '')
    .split(',')
    .filter((id) => UUID.test(id))
    .slice(0, 20);

  const { supabase, buyer, shell } = await requireBuyer();
  const { data } = ids.length
    ? await supabase
        .from('orders')
        .select('id, total, status, supplier_profiles(shop_name)')
        .in('id', ids)
        .eq('buyer_id', buyer.id)
    : { data: [] };
  const orders = (data ?? []) as unknown as {
    id: string;
    total: number;
    status: string;
    supplier_profiles: { shop_name: string } | null;
  }[];

  return (
    <AppShell {...shell}>
      <div className="mx-auto max-w-[560px]">
        <div className="border-brand-border rounded-[10px] border bg-white px-5 py-8 text-center">
          <div className="mb-2 text-[40px]">🎉</div>
          <h1 className="text-xl font-bold">
            {orders.length > 0 ? `Đã đặt ${orders.length} đơn hàng` : 'Không tìm thấy đơn vừa đặt'}
          </h1>
          <div className="text-brand-sub mt-2 text-[13px] leading-relaxed">
            {orders.length > 0
              ? 'Xưởng sẽ xác nhận nhận đơn. Khi xưởng nhận, bạn được thông báo và trang đơn hàng hiện thông tin chuyển khoản.'
              : 'Mở danh sách đơn hàng để kiểm tra.'}
          </div>
        </div>

        {orders.length > 0 && (
          <div className="border-brand-border mt-4 rounded-[10px] border bg-white">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex min-h-[60px] flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#F2F0EC] px-4 py-3 last:border-b-0 hover:bg-[#FAFAF8]"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold break-words">
                    {order.supplier_profiles?.shop_name ?? 'Xưởng'}
                  </span>
                  <span className="text-brand-sub text-xs">
                    {orderCode(order.id)} · {formatVnd(order.total)}
                  </span>
                </span>
                <StatusPill domain="order" status={order.status} />
              </Link>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <ButtonLink href="/orders" className="sm:flex-1">
            Xem đơn hàng của tôi
          </ButtonLink>
          <ButtonLink href="/search" variant="secondary" className="sm:flex-1">
            Tiếp tục mua hàng
          </ButtonLink>
        </div>
      </div>
    </AppShell>
  );
}
