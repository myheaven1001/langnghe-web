import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/ui';
import { requireSupplier } from '../../_lib/guard';
import { ImportClient } from './_components/ImportClient';

export const metadata: Metadata = {
  title: 'Nhập sản phẩm hàng loạt — LàngNghề.vn',
};

// Nhập nhiều sản phẩm từ bảng tính (bước 6 — Công cụ nhà bán). Công cụ cho
// máy tính; trên điện thoại vẫn dùng được nhưng bảng xem trước phải kéo ngang.
export default async function ProductImportPage() {
  const { supabase, shell } = await requireSupplier();
  const { data: categories } = await supabase
    .from('categories')
    .select('slug, name')
    .eq('is_active', true)
    .order('name');

  return (
    <AppShell {...shell}>
      <div className="text-brand-sub mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <Link href="/supplier/products" className="hover:text-brand-red">
          Quản lý sản phẩm
        </Link>
        <span>/</span>
        <span className="text-brand-light">Nhập hàng loạt</span>
      </div>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Nhập sản phẩm hàng loạt</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          Đưa nhiều sản phẩm lên một lần từ Excel hoặc Google Sheets. Ảnh và biến thể thêm sau ở
          từng sản phẩm.
        </div>
      </div>
      <ImportClient categories={categories ?? []} />
    </AppShell>
  );
}
