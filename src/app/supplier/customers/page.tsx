import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/ui';
import { StartChatButton } from '@/components/messages/StartChatButton';
import { formatVnd, formatVnDate } from '@/lib/format';
import { requireSupplier } from '../_lib/guard';

export const metadata: Metadata = {
  title: 'Khách hàng — LàngNghề.vn',
};

interface OrderRow {
  buyer_id: string;
  total: number;
  status: string;
  created_at: string;
  buyer_profiles: { id: string; company_name: string; city: string | null } | null;
}

interface Customer {
  id: string;
  name: string;
  city: string | null;
  orders: number;
  completed: number;
  revenue: number;
  lastOrderAt: string;
}

// Đơn đã được sàn xác nhận thanh toán trở đi mới tính vào doanh thu.
const PAID_STATUSES = ['confirmed', 'producing', 'shipped', 'delivered', 'completed'];

// Khách hàng của xưởng (bước 6 — Công cụ nhà bán): gom đơn theo buyer. Tính
// trên 2.000 đơn gần nhất — đủ cho quy mô hiện tại; khi vượt mức đó cần
// chuyển sang một hàm tổng hợp ở database.
export default async function SupplierCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const sp = await searchParams;
  const sort = sp.sort === 'recent' || sp.sort === 'orders' ? sp.sort : 'revenue';

  const { supabase, supplier, shell } = await requireSupplier();
  const { data } = await supabase
    .from('orders')
    .select('buyer_id, total, status, created_at, buyer_profiles(id, company_name, city)')
    .eq('supplier_id', supplier.id)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(2000);
  const orders = (data ?? []) as unknown as OrderRow[];

  const byBuyer = new Map<string, Customer>();
  for (const o of orders) {
    const c = byBuyer.get(o.buyer_id) ?? {
      id: o.buyer_id,
      name: o.buyer_profiles?.company_name ?? 'Buyer',
      city: o.buyer_profiles?.city ?? null,
      orders: 0,
      completed: 0,
      revenue: 0,
      // Đơn đã sắp mới → cũ nên dòng đầu gặp là đơn gần nhất.
      lastOrderAt: o.created_at,
    };
    c.orders += 1;
    if (o.status === 'completed') c.completed += 1;
    if (PAID_STATUSES.includes(o.status)) c.revenue += Number(o.total);
    byBuyer.set(o.buyer_id, c);
  }

  const customers = [...byBuyer.values()].sort((a, b) =>
    sort === 'recent'
      ? new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime()
      : sort === 'orders'
        ? b.orders - a.orders
        : b.revenue - a.revenue,
  );
  const repeat = customers.filter((c) => c.orders > 1).length;

  const sorts = [
    { key: 'revenue', label: 'Doanh thu' },
    { key: 'orders', label: 'Số đơn' },
    { key: 'recent', label: 'Mua gần đây' },
  ] as const;

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Khách hàng</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          {customers.length} khách đã đặt hàng · {repeat} khách mua từ 2 đơn trở lên
        </div>
      </div>

      <div className="border-brand-border mb-4 flex gap-1 overflow-x-auto border-b">
        {sorts.map((s) => (
          <Link
            key={s.key}
            href={s.key === 'revenue' ? '/supplier/customers' : `/supplier/customers?sort=${s.key}`}
            className={`border-b-2 px-3.5 py-2.5 text-[13px] font-semibold whitespace-nowrap ${
              s.key === sort
                ? 'border-brand-red text-brand-red'
                : 'text-brand-sub hover:text-brand-red border-transparent'
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {customers.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-12 text-center">
          <div className="mb-2.5 text-[32px]">🤝</div>
          <div className="mb-1.5 text-sm font-bold">Chưa có khách hàng nào</div>
          <div className="text-brand-sub text-[13px]">
            Buyer đặt đơn đầu tiên với xưởng sẽ xuất hiện ở đây.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {customers.map((c) => (
            <div
              key={c.id}
              className="border-brand-border flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border bg-white p-3.5 px-4"
            >
              <div className="min-w-0 flex-1 basis-[200px]">
                <div className="text-[13.5px] font-bold break-words">{c.name}</div>
                <div className="text-brand-sub text-xs">
                  {c.city ? `${c.city} · ` : ''}
                  Đơn gần nhất {formatVnDate(`${c.lastOrderAt}Z`)}
                </div>
              </div>
              <div className="text-xs">
                <div className="text-brand-sub">Số đơn</div>
                <div className="text-[13px] font-bold">
                  {c.orders}
                  <span className="text-brand-light font-normal"> ({c.completed} hoàn tất)</span>
                </div>
              </div>
              <div className="min-w-[110px] text-xs">
                <div className="text-brand-sub">Doanh thu</div>
                <div className="font-tight text-[15px] font-bold">{formatVnd(c.revenue)}</div>
              </div>
              <StartChatButton
                buyerId={c.id}
                className="border-brand-border text-brand-ink hover:border-brand-ink min-h-10 rounded-md border-[1.5px] bg-white px-3.5 text-xs font-semibold"
              >
                💬 Nhắn tin
              </StartChatButton>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
