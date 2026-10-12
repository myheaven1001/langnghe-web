import type { Metadata } from 'next';
import { AppShell, ButtonLink } from '@/components/ui';
import { ProductCard } from '@/components/catalog/ProductCard';
import { requireBuyer } from '@/lib/buyer-shell';
import type { CatalogProduct } from '@/lib/catalog';

export const metadata: Metadata = {
  title: 'Sản phẩm đã lưu — LàngNghề.vn',
};

interface CardRow {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  min_price: number | null;
  moq: number;
  shop_name: string;
  village_origin: string | null;
  supplier_verified: boolean;
  accept_oem: boolean;
  category_id: string | null;
}

// Sản phẩm đã lưu (bước 6). Thẻ lấy từ product_cards nên sản phẩm đã ngừng
// bán / xưởng đã ẩn tự biến mất khỏi lưới; số còn lại được ghi chú bên dưới.
export default async function SavedProductsPage() {
  const { supabase, userId, shell } = await requireBuyer();

  const { data: savedData } = await supabase
    .from('saved_products')
    .select('product_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(500);
  const ids = (savedData ?? []).map((s) => s.product_id as string);

  const { data: cardsData } = ids.length
    ? await supabase
        .from('product_cards')
        .select(
          'id, slug, name, image_url, min_price, moq, shop_name, village_origin, supplier_verified, accept_oem, category_id',
        )
        .in('id', ids)
    : { data: [] as CardRow[] };

  const byId = new Map(((cardsData ?? []) as CardRow[]).map((c) => [c.id, c]));
  // Giữ thứ tự "lưu gần nhất trước".
  const products: CatalogProduct[] = ids
    .map((id) => byId.get(id))
    .filter((c): c is CardRow => !!c)
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      imageUrl: c.image_url,
      minPrice: c.min_price != null ? Number(c.min_price) : null,
      moq: c.moq,
      shopName: c.shop_name,
      villageOrigin: c.village_origin,
      supplierVerified: c.supplier_verified,
      acceptOem: c.accept_oem,
      categoryId: c.category_id,
    }));
  const unavailable = ids.length - products.length;

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Sản phẩm đã lưu</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          {products.length} sản phẩm. Mở sản phẩm và bấm &quot;♥ Đã lưu&quot; để bỏ lưu.
        </div>
      </div>

      {products.length === 0 ? (
        <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-12 text-center">
          <div className="mb-2.5 text-[32px]">♡</div>
          <div className="mb-1.5 text-sm font-bold">Chưa lưu sản phẩm nào</div>
          <div className="text-brand-sub mb-4 text-[13px]">
            Bấm &quot;♡ Lưu sản phẩm&quot; ở trang sản phẩm để xem lại sau.
          </div>
          <ButtonLink href="/search">Xem sản phẩm</ButtonLink>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

      {unavailable > 0 && (
        <div className="text-brand-light mt-3 text-xs">
          {unavailable} sản phẩm đã lưu hiện không còn bán nên không hiển thị.
        </div>
      )}
    </AppShell>
  );
}
