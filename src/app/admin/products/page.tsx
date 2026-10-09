import type { Metadata } from 'next';
import Form from 'next/form';
import Link from 'next/link';
import { AppShell, StatusPill } from '@/components/ui';
import { formatVnDate } from '@/lib/format';
import { requireAdmin } from '../_lib/guard';
import { ModerateProductButton } from './_components/ModerateProductButton';

export const metadata: Metadata = {
  title: 'Kiểm duyệt sản phẩm — LàngNghề.vn Admin',
};

const PAGE_SIZE = 20;

const TABS = [
  { key: 'active', label: 'Đang bán', statuses: ['active'] },
  { key: 'blocked', label: 'Đã khoá', statuses: ['blocked'] },
  { key: 'other', label: 'Nháp / tạm dừng', statuses: ['draft', 'paused'] },
] as const;
type TabKey = (typeof TABS)[number]['key'];

interface ProductRow {
  id: string;
  name: string;
  status: string;
  moderation_note: string | null;
  moderated_at: string | null;
  updated_at: string;
  supplier_profiles: { id: string; shop_name: string } | null;
  categories: { name: string } | null;
  product_media:
    { cdn_url: string | null; thumbnail_url: string | null; is_primary: boolean }[] | null;
}

function buildUrl(params: { tab: TabKey; q: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.tab !== 'active') search.set('tab', params.tab);
  if (params.q) search.set('q', params.q);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  const qs = search.toString();
  return qs ? `/admin/products?${qs}` : '/admin/products';
}

// Kiểm duyệt sản phẩm (kế hoạch 4.11): admin xem mọi sản phẩm (RLS
// products_select cho admin), khoá sản phẩm vi phạm kèm lý do, mở khoá lại.
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : 'active';
  const q = (sp.q ?? '').trim().slice(0, 100);
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const activeTab = TABS.find((t) => t.key === tab)!;

  const { supabase, shell } = await requireAdmin();

  const from = (page - 1) * PAGE_SIZE;
  let listQuery = supabase
    .from('products')
    .select(
      'id, name, status, moderation_note, moderated_at, updated_at, supplier_profiles(id, shop_name), categories(name), product_media(cdn_url, thumbnail_url, is_primary)',
      { count: 'exact' },
    )
    .in('status', [...activeTab.statuses])
    .order('updated_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  // Ký tự % và _ là ký tự đại diện của ilike; dấu phẩy/ngoặc phá cú pháp lọc.
  if (q) listQuery = listQuery.ilike('name', `%${q.replace(/[%_,()]/g, ' ')}%`);

  const [{ data, count }, { count: blockedCount }] = await Promise.all([
    listQuery,
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'blocked'),
  ]);

  const products = (data ?? []) as unknown as ProductRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Kiểm duyệt sản phẩm</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          {count ?? 0} sản phẩm ở mục này · {blockedCount ?? 0} sản phẩm đang bị khoá.
        </div>
      </div>

      <div className="border-brand-border mb-3 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={buildUrl({ tab: t.key, q })}
            className={`flex min-h-10 items-center border-b-2 px-3.5 text-[13px] font-semibold whitespace-nowrap ${
              t.key === tab
                ? 'border-brand-red text-brand-red'
                : 'text-brand-sub hover:text-brand-red border-transparent'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Form action="/admin/products" className="mb-4 flex max-w-[480px] gap-2">
        {tab !== 'active' && <input type="hidden" name="tab" value={tab} />}
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Tìm theo tên sản phẩm"
          aria-label="Tìm theo tên sản phẩm"
          className="border-brand-border focus:border-brand-red min-h-10 min-w-0 flex-1 rounded-lg border-[1.5px] bg-white px-3 text-sm outline-none"
        />
        <button
          type="submit"
          className="border-brand-border min-h-10 rounded-lg border-[1.5px] bg-white px-4 text-sm font-semibold"
        >
          Tìm
        </button>
      </Form>

      {products.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-12 text-center">
          <div className="mb-2.5 text-[32px]">📭</div>
          <div className="text-sm font-bold">Không có sản phẩm nào ở mục này</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {products.map((p) => {
            const media = p.product_media ?? [];
            const thumb = media.find((m) => m.is_primary) ?? media[0];
            const thumbUrl = thumb?.thumbnail_url ?? thumb?.cdn_url ?? null;
            return (
              <div
                key={p.id}
                className="border-brand-border flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[10px] border bg-white px-4 py-3"
              >
                <div className="bg-brand-bg flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg text-xl">
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ảnh ở Supabase Storage
                    <img
                      src={thumbUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    '📦'
                  )}
                </div>
                <div className="min-w-0 flex-1 basis-[220px]">
                  <Link
                    href={`/products/${p.id}`}
                    className="text-brand-ink hover:text-brand-red line-clamp-2 text-sm font-bold"
                  >
                    {p.name}
                  </Link>
                  <div className="text-brand-sub mt-0.5 text-xs">
                    {p.supplier_profiles ? (
                      <Link
                        href={`/shops/${p.supplier_profiles.id}`}
                        className="hover:text-brand-red"
                      >
                        {p.supplier_profiles.shop_name}
                      </Link>
                    ) : (
                      'Xưởng không rõ'
                    )}{' '}
                    · {p.categories?.name ?? 'Chưa phân loại'} · sửa {formatVnDate(p.updated_at)}
                  </div>
                  {p.status === 'blocked' && (
                    <div className="text-status-red mt-1 text-xs break-words">
                      Lý do khoá: {p.moderation_note ?? '—'}
                      {p.moderated_at ? ` (${formatVnDate(p.moderated_at)})` : ''}
                    </div>
                  )}
                </div>
                <StatusPill domain="product" status={p.status} />
                <div className="ml-auto shrink-0">
                  <ModerateProductButton
                    productId={p.id}
                    productName={p.name}
                    blocked={p.status === 'blocked'}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3 text-[13px]">
          {page > 1 ? (
            <Link
              href={buildUrl({ tab, q, page: page - 1 })}
              className="text-brand-red px-2 font-semibold"
            >
              ‹ Trước
            </Link>
          ) : (
            <span className="text-brand-light px-2">‹ Trước</span>
          )}
          <span className="text-brand-sub">
            Trang {page}/{totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={buildUrl({ tab, q, page: page + 1 })}
              className="text-brand-red px-2 font-semibold"
            >
              Sau ›
            </Link>
          ) : (
            <span className="text-brand-light px-2">Sau ›</span>
          )}
        </div>
      )}
    </AppShell>
  );
}
