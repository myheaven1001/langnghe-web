import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui';
import { buildSupplierNavGroups } from '../../../_lib/nav';
import { getNewRfqCount, getUnreadNotificationCount } from '../../../_lib/counts';
import { ProductForm } from '../../_components/ProductForm';

export const metadata: Metadata = {
  title: 'Sửa sản phẩm — LàngNghề.vn',
};

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  const { data: product } = await supabase
    .from('products')
    .select(
      'id, name, category_id, description, accept_oem, accept_custom, min_order_qty, lead_time_days, status, price_tiers(min_qty, max_qty, unit_price), product_variants(id, color, size, material, stock_qty, price_adjustment, sku), product_media(id, r2_key, cdn_url, thumbnail_url, is_primary, sort_order)',
    )
    .eq('id', id)
    .eq('supplier_id', supplier.id)
    .maybeSingle();

  // Không tồn tại HOẶC không phải sản phẩm của supplier này (RLS đã chặn) —
  // cả 2 trường hợp trả 404 như nhau.
  if (!product) notFound();

  const [newRfqCount, unreadCount, { data: categories }] = await Promise.all([
    getNewRfqCount(supabase, supplier.id),
    getUnreadNotificationCount(supabase, user.id),
    supabase.from('categories').select('id, name').order('sort_order'),
  ]);

  const media = (product.product_media ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({
      id: m.id,
      path: m.r2_key,
      url: m.cdn_url ?? m.thumbnail_url ?? '',
      isPrimary: m.is_primary,
    }));

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
        <span className="truncate">{product.name}</span>
      </div>

      <div className="mb-[18px]">
        <div className="text-xl font-bold">Sửa sản phẩm</div>
        <div className="text-brand-sub mt-1 text-[12.5px]">
          Cập nhật thông tin — thay đổi hiển thị ngay cho buyer sau khi lưu.
        </div>
      </div>

      <ProductForm
        mode="edit"
        productId={product.id}
        supplierId={supplier.id}
        categories={categories ?? []}
        initial={{
          name: product.name,
          categoryId: product.category_id ?? '',
          description: product.description ?? '',
          acceptOem: product.accept_oem,
          acceptCustom: product.accept_custom,
          minOrderQty: String(product.min_order_qty),
          leadTimeDays: product.lead_time_days != null ? String(product.lead_time_days) : '',
          status: product.status,
          priceTiers: (product.price_tiers ?? []).map((t) => ({
            minQty: String(t.min_qty),
            maxQty: t.max_qty != null ? String(t.max_qty) : '',
            unitPrice: String(t.unit_price),
          })),
          variants: (product.product_variants ?? []).map((v) => ({
            color: v.color ?? '',
            size: v.size ?? '',
            material: v.material ?? '',
            stockQty: String(v.stock_qty),
            priceAdjustment: Number(v.price_adjustment) ? String(v.price_adjustment) : '',
            sku: v.sku ?? '',
          })),
          media,
        }}
      />
    </AppShell>
  );
}
