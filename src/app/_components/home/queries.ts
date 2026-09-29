import { createPublicClient } from '@/lib/supabase/public';
import type { CatalogProduct } from '@/lib/catalog';

// Dữ liệu trang chủ (kế hoạch 2.4) — đọc bằng quyền khách, trang được tạo
// sẵn và làm mới 5 phút/lần (revalidate trong src/app/page.tsx).

export interface HomeCategory {
  id: string;
  slug: string;
  name: string;
  icon: string;
}

// Cùng kiểu với thẻ sản phẩm dùng chung (src/components/catalog/ProductCard).
export type HomeProduct = CatalogProduct;

export interface HomeStats {
  suppliers: number;
  products: number;
  villages: number;
  categories: number;
  completedOrders: number;
}

export interface HomeData {
  categories: HomeCategory[];
  stats: HomeStats | null;
  newest: HomeProduct[];
  featured: HomeProduct[];
  // 2 ngành có nhiều sản phẩm nhất (≥ 3 sản phẩm), mỗi ngành 5 sản phẩm.
  categorySections: { category: HomeCategory; products: HomeProduct[] }[];
}

const CARD_COLUMNS =
  'id, slug, name, image_url, min_price, moq, shop_name, village_origin, supplier_verified, accept_oem, category_id';

interface CardRow {
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
}

function toProduct(r: CardRow): HomeProduct {
  return {
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
  };
}

// Lỗi đọc (database tạm lỗi, build trên CI không có database thật) → trang
// vẫn hiện, chỉ không có mục sản phẩm.
export async function getHomeData(): Promise<HomeData> {
  const empty: HomeData = {
    categories: [],
    stats: null,
    newest: [],
    featured: [],
    categorySections: [],
  };
  try {
    const supabase = createPublicClient();
    const [catRes, statsRes, newestRes, featuredRes] = await Promise.all([
      supabase
        .from('categories')
        .select('id, slug, name, icon')
        .eq('is_active', true)
        .order('sort_order'),
      supabase.rpc('public_stats'),
      supabase
        .from('product_cards')
        .select(CARD_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(60),
      supabase
        .from('product_cards')
        .select(CARD_COLUMNS)
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const categories: HomeCategory[] = (catRes.data ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      icon: c.icon ?? '📦',
    }));
    const recent = ((newestRes.data ?? []) as CardRow[]).map(toProduct);

    const byCategory = new Map<string, HomeProduct[]>();
    for (const p of recent) {
      if (!p.categoryId) continue;
      byCategory.set(p.categoryId, [...(byCategory.get(p.categoryId) ?? []), p]);
    }
    const categorySections = [...byCategory.entries()]
      .filter(([, products]) => products.length >= 3)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 2)
      .flatMap(([categoryId, products]) => {
        const category = categories.find((c) => c.id === categoryId);
        return category ? [{ category, products: products.slice(0, 5) }] : [];
      });

    const s = statsRes.data as Record<string, number> | null;
    return {
      categories,
      stats: s
        ? {
            suppliers: s.suppliers ?? 0,
            products: s.products ?? 0,
            villages: s.villages ?? 0,
            categories: s.categories ?? 0,
            completedOrders: s.completed_orders ?? 0,
          }
        : null,
      newest: recent.slice(0, 10),
      featured: ((featuredRes.data ?? []) as CardRow[]).map(toProduct),
      categorySections,
    };
  } catch {
    return empty;
  }
}
