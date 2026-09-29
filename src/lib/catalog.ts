import type { SupabaseClient } from '@supabase/supabase-js';

// Danh sách sản phẩm có lọc/sắp xếp/phân trang dùng chung cho /search (2.5),
// /categories/[slug] và /shops/[id] (2.6). Bộ lọc nằm trên URL
// (?q=&cat=&min=&max=&moq=&verified=1&sort=&page=) — link chia sẻ được, nút
// Back hoạt động; dữ liệu từ RPC search_products / search_facets
// (20261005091500), chỉ sản phẩm công khai.

export const PAGE_SIZE = 24;

export const SORTS = [
  { value: 'relevance', label: 'Phù hợp nhất' },
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price_asc', label: 'Giá thấp → cao' },
  { value: 'price_desc', label: 'Giá cao → thấp' },
] as const;
export type SortValue = (typeof SORTS)[number]['value'];

export interface CatalogFilters {
  q: string;
  cat: string | null;
  min: number | null;
  max: number | null;
  moq: number | null;
  verified: boolean;
  sort: SortValue;
  page: number;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  minPrice: number | null;
  moq: number;
  shopName: string;
  villageOrigin: string | null;
  supplierVerified: boolean;
  acceptOem: boolean;
  categoryId: string | null;
}

export interface CatalogFacet {
  slug: string;
  name: string;
  icon: string | null;
  count: number;
}

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function positiveInt(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function parseCatalogFilters(sp: SearchParamsRecord): CatalogFilters {
  const sort = one(sp.sort);
  return {
    q: (one(sp.q) ?? '').trim().slice(0, 200),
    cat: one(sp.cat)?.trim() || null,
    min: positiveInt(one(sp.min)),
    max: positiveInt(one(sp.max)),
    moq: positiveInt(one(sp.moq)),
    verified: one(sp.verified) === '1',
    sort: SORTS.some((s) => s.value === sort) ? (sort as SortValue) : 'relevance',
    page: positiveInt(one(sp.page)) ?? 1,
  };
}

// URL cùng trang với bộ lọc hiện tại, ghi đè vài giá trị. Đổi bộ lọc bất kỳ
// (trừ page) → quay về trang 1.
export function catalogHref(
  basePath: string,
  current: CatalogFilters,
  patch: Partial<Record<keyof CatalogFilters, string | number | boolean | null>>,
): string {
  const merged: Record<string, string | number | boolean | null> = { ...current, ...patch };
  if (!('page' in patch)) merged.page = 1;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value === null || value === '' || value === false) continue;
    if (key === 'page' && value === 1) continue;
    if (key === 'sort' && value === 'relevance') continue;
    params.set(key, value === true ? '1' : String(value));
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  min_price: number | string | null;
  moq: number;
  shop_name: string;
  village_origin: string | null;
  supplier_verified: boolean;
  accept_oem: boolean;
  category_id: string | null;
  total_count: number | string;
}

export async function runCatalogSearch(
  supabase: SupabaseClient,
  filters: CatalogFilters,
  scope: { categorySlug?: string; supplierId?: string } = {},
): Promise<{ products: CatalogProduct[]; total: number; facets: CatalogFacet[]; failed: boolean }> {
  const common = {
    p_q: filters.q || null,
    p_min_price: filters.min,
    p_max_price: filters.max,
    p_max_moq: filters.moq,
    p_verified_only: filters.verified,
    p_supplier_id: scope.supplierId ?? null,
  };
  const [productsRes, facetsRes] = await Promise.all([
    supabase.rpc('search_products', {
      ...common,
      p_category_slug: scope.categorySlug ?? filters.cat,
      p_sort: filters.sort === 'relevance' && !filters.q ? 'newest' : filters.sort,
      p_limit: PAGE_SIZE,
      p_offset: (filters.page - 1) * PAGE_SIZE,
    }),
    supabase.rpc('search_facets', common),
  ]);

  const rows = (productsRes.data ?? []) as ProductRow[];
  return {
    products: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      imageUrl: r.image_url,
      minPrice: r.min_price != null ? Number(r.min_price) : null,
      moq: r.moq,
      shopName: r.shop_name,
      villageOrigin: r.village_origin,
      supplierVerified: r.supplier_verified,
      acceptOem: r.accept_oem,
      categoryId: r.category_id,
    })),
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
    facets: (
      (facetsRes.data ?? []) as {
        category_slug: string;
        category_name: string;
        icon: string | null;
        product_count: number | string;
      }[]
    ).map((f) => ({
      slug: f.category_slug,
      name: f.category_name,
      icon: f.icon,
      count: Number(f.product_count),
    })),
    failed: Boolean(productsRes.error),
  };
}
