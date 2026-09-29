import Link from 'next/link';
import type { ReactNode } from 'react';
import { ProductCard } from './ProductCard';
import { SortSelect } from './SortSelect';
import { catalogHref, PAGE_SIZE, type CatalogFilters, type CatalogProduct } from '@/lib/catalog';

// Thanh công cụ (tiêu đề + số kết quả + sắp xếp), lưới thẻ sản phẩm, phân
// trang bằng link (?page=) — dùng chung cho tìm kiếm, danh mục, gian hàng.
export function CatalogResults({
  basePath,
  filters,
  products,
  total,
  heading,
  empty,
}: {
  basePath: string;
  filters: CatalogFilters;
  products: CatalogProduct[];
  total: number;
  heading: ReactNode;
  empty: ReactNode;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);

  // Tối đa 5 số trang quanh trang hiện tại.
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="border-brand-border flex flex-wrap items-center gap-2.5 rounded border bg-white px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">{heading}</div>
          <div className="text-brand-sub mt-0.5 text-xs">
            {total > 0 ? `${total.toLocaleString('vi-VN')} sản phẩm` : 'Không có sản phẩm phù hợp'}
          </div>
        </div>
        <div className="ml-auto">
          <SortSelect basePath={basePath} filters={filters} />
        </div>
      </div>

      {products.length === 0 ? (
        <div className="border-brand-border rounded border bg-white px-5 py-10 text-center">
          {empty}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1" aria-label="Phân trang">
          {page > 1 && (
            <Link
              href={catalogHref(basePath, filters, { page: page - 1 })}
              className="border-brand-border text-brand-sub hover:border-brand-red hover:text-brand-red flex h-8 w-8 items-center justify-center rounded-[3px] border bg-white"
              aria-label="Trang trước"
            >
              ‹
            </Link>
          )}
          {pages.map((p) => (
            <Link
              key={p}
              href={catalogHref(basePath, filters, { page: p })}
              aria-current={p === page ? 'page' : undefined}
              className={`flex h-8 min-w-8 items-center justify-center rounded-[3px] border px-2 text-[13px] ${
                p === page
                  ? 'border-brand-red bg-brand-red font-semibold text-white'
                  : 'border-brand-border text-brand-ink hover:border-brand-red bg-white'
              }`}
            >
              {p}
            </Link>
          ))}
          {page < totalPages && (
            <Link
              href={catalogHref(basePath, filters, { page: page + 1 })}
              className="border-brand-border text-brand-sub hover:border-brand-red hover:text-brand-red flex h-8 w-8 items-center justify-center rounded-[3px] border bg-white"
              aria-label="Trang sau"
            >
              ›
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
