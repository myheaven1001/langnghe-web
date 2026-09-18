import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui';
import { buildSupplierNavGroups } from '../_lib/nav';
import { getNewRfqCount, getUnreadNotificationCount } from '../_lib/counts';
import { ProductFilterBar } from './_components/ProductFilterBar';
import { ProductTable, type ProductListRow } from './_components/ProductTable';

export const metadata: Metadata = {
  title: 'Quản lý sản phẩm — LàngNghề.vn',
};

const PAGE_SIZE = 20;

// product_status có 4 giá trị (draft/active/paused/deleted) — 'deleted' là
// soft-delete, không có tab riêng, luôn bị loại khỏi mọi tab kể cả "Tất cả".
const STATUS_TABS = [
  { key: 'all', label: 'Tất cả', statuses: ['draft', 'active', 'paused'] },
  { key: 'active', label: 'Đang bán', statuses: ['active'] },
  { key: 'draft', label: 'Nháp', statuses: ['draft'] },
  { key: 'paused', label: 'Tạm ẩn', statuses: ['paused'] },
] as const;

type StatusKey = (typeof STATUS_TABS)[number]['key'];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface ProductRow {
  id: string;
  name: string;
  min_order_qty: number;
  status: string;
  updated_at: string;
  categories: { name: string } | null;
  price_tiers: { unit_price: number }[] | null;
  product_media: { cdn_url: string | null; thumbnail_url: string | null; is_primary: boolean }[] | null;
}

function buildProductsUrl(params: { status: string; q: string; category: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.status !== 'all') search.set('status', params.status);
  if (params.q) search.set('q', params.q);
  if (params.category) search.set('category', params.category);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  const qs = search.toString();
  return qs ? `/supplier/products?${qs}` : '/supplier/products';
}

function countProducts(
  supabase: SupabaseServerClient,
  supplierId: string,
  statuses: readonly string[],
  category: string,
  q: string,
) {
  let query = supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', supplierId)
    .in('status', [...statuses]);
  if (category) query = query.eq('category_id', category);
  if (q) query = query.ilike('name', `%${q}%`);
  return query;
}

export default async function SupplierProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; category?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status: StatusKey = STATUS_TABS.some((t) => t.key === sp.status) ? (sp.status as StatusKey) : 'all';
  const q = (sp.q ?? '').trim();
  const category = sp.category ?? '';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const activeTab = STATUS_TABS.find((t) => t.key === status)!;

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

  const from = (page - 1) * PAGE_SIZE;

  let listQuery = supabase
    .from('products')
    .select(
      'id, name, min_order_qty, status, updated_at, categories(name), price_tiers(unit_price), product_media(cdn_url, thumbnail_url, is_primary)',
    )
    .eq('supplier_id', supplier.id)
    .in('status', [...activeTab.statuses]);
  if (category) listQuery = listQuery.eq('category_id', category);
  if (q) listQuery = listQuery.ilike('name', `%${q}%`);
  listQuery = listQuery.order('updated_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);

  const [newRfqCount, unreadCount, { data: categories }, tabCounts, { data: productsData }] = await Promise.all([
    getNewRfqCount(supabase, supplier.id),
    getUnreadNotificationCount(supabase, user.id),
    supabase.from('categories').select('id, name').order('sort_order'),
    Promise.all(STATUS_TABS.map((tab) => countProducts(supabase, supplier.id, tab.statuses, category, q))),
    listQuery,
  ]);

  const products = ((productsData ?? []) as unknown as ProductRow[]).map<ProductListRow>((p) => {
    const prices = (p.price_tiers ?? []).map((t) => t.unit_price);
    const media = p.product_media ?? [];
    const primary = media.find((m) => m.is_primary) ?? media[0];
    return {
      id: p.id,
      name: p.name,
      min_order_qty: p.min_order_qty,
      status: p.status,
      updated_at: p.updated_at,
      categories: p.categories,
      minPrice: prices.length ? Math.min(...prices) : null,
      thumbUrl: primary?.thumbnail_url ?? primary?.cdn_url ?? null,
    };
  });

  const activeTabIndex = STATUS_TABS.findIndex((t) => t.key === status);
  const totalCount = tabCounts[activeTabIndex]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const allCount = tabCounts[0]?.count ?? 0;
  const activeCount = tabCounts[1]?.count ?? 0;
  const draftCount = tabCounts[2]?.count ?? 0;
  const pausedCount = tabCounts[3]?.count ?? 0;

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
        <span>Quản lý sản phẩm</span>
      </div>

      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-bold">Quản lý sản phẩm</div>
          <div className="text-brand-sub mt-1 text-[12.5px]">
            {allCount} sản phẩm · {activeCount} đang bán · {draftCount} nháp · {pausedCount} tạm ẩn
          </div>
        </div>
        <Link
          href="/supplier/products/new"
          className="bg-brand-red hover:bg-brand-red-dark rounded-md px-[18px] py-2.5 text-sm font-semibold whitespace-nowrap text-white"
        >
          + Thêm sản phẩm
        </Link>
      </div>

      <div className="border-brand-border mb-4 flex gap-1 overflow-x-auto border-b">
        {STATUS_TABS.map((tab, i) => {
          const isActive = tab.key === status;
          return (
            <Link
              key={tab.key}
              href={buildProductsUrl({ status: tab.key, q, category })}
              className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[12.5px] font-semibold whitespace-nowrap ${
                isActive
                  ? 'border-brand-red text-brand-red'
                  : 'text-brand-sub hover:text-brand-red border-transparent'
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${
                  isActive ? 'bg-status-red-soft text-brand-red' : 'bg-brand-bg text-brand-sub'
                }`}
              >
                {tabCounts[i]?.count ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <ProductFilterBar categories={categories ?? []} status={status} q={q} category={category} />
        <span className="text-brand-sub mb-3.5 shrink-0 text-xs">{totalCount} sản phẩm</span>
      </div>

      {products.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-[50px] text-center">
          <div className="mb-2.5 text-[32px]">📦</div>
          <div className="mb-1.5 text-sm font-bold">Không có sản phẩm nào ở mục này</div>
          <div className="text-brand-sub mb-[18px] text-xs">
            Thử chọn bộ lọc khác hoặc thêm sản phẩm mới.
          </div>
          <Link
            href="/supplier/products/new"
            className="bg-brand-red hover:bg-brand-red-dark inline-block rounded-md px-[18px] py-2.5 text-sm font-semibold text-white"
          >
            + Thêm sản phẩm
          </Link>
        </div>
      ) : (
        <ProductTable products={products} />
      )}

      {totalPages > 1 && (
        <div className="mt-[22px] flex items-center justify-center gap-1.5">
          <Link
            href={buildProductsUrl({ status, q, category, page: page - 1 })}
            aria-disabled={page <= 1}
            className={`border-brand-border flex h-8 w-8 items-center justify-center rounded-md border text-[13px] ${
              page <= 1
                ? 'text-brand-light pointer-events-none opacity-40'
                : 'text-brand-sub hover:border-brand-clay hover:text-brand-ink bg-white'
            }`}
          >
            ‹
          </Link>
          <span className="text-brand-sub px-2 text-xs">
            Trang {page}/{totalPages}
          </span>
          <Link
            href={buildProductsUrl({ status, q, category, page: page + 1 })}
            aria-disabled={page >= totalPages}
            className={`border-brand-border flex h-8 w-8 items-center justify-center rounded-md border text-[13px] ${
              page >= totalPages
                ? 'text-brand-light pointer-events-none opacity-40'
                : 'text-brand-sub hover:border-brand-clay hover:text-brand-ink bg-white'
            }`}
          >
            ›
          </Link>
        </div>
      )}
    </AppShell>
  );
}
