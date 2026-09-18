import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui';
import { buildSupplierNavGroups } from '../../_lib/nav';
import { getNewRfqCount, getUnreadNotificationCount } from '../../_lib/counts';
import { ProductForm } from '../_components/ProductForm';

export const metadata: Metadata = {
  title: 'Thêm sản phẩm — LàngNghề.vn',
};

export default async function NewProductPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: supplier } = await supabase
    .from('supplier_profiles')
    .select('id, shop_name')
    .eq('user_id', user.id)
    .single();

  if (!supplier) redirect('/');

  const [newRfqCount, unreadCount, { data: categories }] = await Promise.all([
    getNewRfqCount(supabase, supplier.id),
    getUnreadNotificationCount(supabase, user.id),
    supabase.from('categories').select('id, name').order('sort_order'),
  ]);

  return (
    <AppShell
      header={{
        icons: [
          { icon: '💬', title: 'Tin nhắn' },
          { icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined },
        ],
        userName: supplier.shop_name,
        userRole: 'Supplier',
      }}
      navGroups={buildSupplierNavGroups({ newRfqCount, unreadCount })}
    >
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/supplier/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/supplier/products" className="text-brand-sub hover:text-brand-red">
          Quản lý sản phẩm
        </Link>
        <span>/</span>
        <span>Thêm sản phẩm</span>
      </div>

      <div className="mb-[18px]">
        <div className="text-xl font-bold">Thêm sản phẩm mới</div>
        <div className="text-brand-sub mt-1 text-[12.5px]">
          Điền đầy đủ thông tin để buyer dễ tìm thấy và tin tưởng đặt hàng.
        </div>
      </div>

      <ProductForm mode="create" supplierId={supplier.id} categories={categories ?? []} />
    </AppShell>
  );
}
