import type { Metadata } from 'next';
import { AppShell } from '@/components/ui';
import { requireAdmin } from '../_lib/guard';
import { CategoryManager, type CategoryRow } from './_components/CategoryManager';

export const metadata: Metadata = {
  title: 'Danh mục ngành hàng — LàngNghề.vn Admin',
};

// Quản lý danh mục ngành hàng (kế hoạch 4.11): cây cha–con 2 tầng, ẩn thay
// vì xoá. Số sản phẩm đếm các sản phẩm chưa bị xoá gắn trực tiếp với danh mục.
export default async function AdminCategoriesPage() {
  const { supabase, shell } = await requireAdmin();

  const [{ data: categoriesData }, { data: productsData }] = await Promise.all([
    supabase.from('categories').select('id, parent_id, name, slug, icon, sort_order, is_active'),
    supabase
      .from('products')
      .select('category_id')
      .neq('status', 'deleted')
      .not('category_id', 'is', null),
  ]);

  const counts = new Map<string, number>();
  for (const p of productsData ?? []) {
    const key = p.category_id as string;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const categories: CategoryRow[] = (categoriesData ?? []).map((c) => ({
    ...c,
    productCount: counts.get(c.id) ?? 0,
  }));

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Danh mục ngành hàng</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          {categories.length} danh mục · {categories.filter((c) => !c.is_active).length} đang ẩn.
          Danh mục ẩn không hiện trên trang chủ; sản phẩm thuộc danh mục đó vẫn còn.
        </div>
      </div>

      <CategoryManager categories={categories} />
    </AppShell>
  );
}
