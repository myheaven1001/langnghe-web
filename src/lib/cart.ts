// Giỏ hàng (kế hoạch 5.4–5.5). Phần tính giá ở đây chỉ để HIỂN THỊ — lúc đặt,
// checkout_cart() tính lại toàn bộ phía server theo đúng quy tắc này và giá
// trình duyệt không được dùng:
//   - bậc giá áp theo TỔNG số lượng của một sản phẩm trong giỏ (cộng mọi biến thể);
//   - đơn giá một dòng = giá của bậc + chênh lệch giá của biến thể;
//   - tổng số lượng phải ≥ MOQ; chỉ "hàng có sẵn" mới bị giới hạn tồn kho.
import type { createClient } from '@/lib/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface CartTier {
  min_qty: number;
  max_qty: number | null;
  unit_price: number;
}

export type CartProblem =
  | 'unavailable'
  | 'variant_required'
  | 'variant_unavailable'
  | 'below_moq'
  | 'no_price'
  | 'out_of_stock';

export interface CartLine {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  name: string;
  variantLabel: string | null;
  imageUrl: string | null;
  supplierId: string | null;
  moq: number;
  /** Tổng số lượng của sản phẩm này trong giỏ (mọi biến thể). */
  productQty: number;
  unitPrice: number | null;
  lineTotal: number | null;
  /** Tồn kho còn lại nếu là hàng có sẵn; null = làm theo đơn, không giới hạn. */
  stock: number | null;
  problem: CartProblem | null;
}

export interface CartGroup {
  supplierId: string | null;
  supplierName: string;
  lines: CartLine[];
  subtotal: number;
}

export interface Cart {
  groups: CartGroup[];
  lineCount: number;
  total: number;
  /** Có dòng nào chưa đặt được (hết hàng, dưới MOQ…). */
  hasProblems: boolean;
}

export const CART_PROBLEM_TEXT: Record<CartProblem, string> = {
  unavailable: 'Sản phẩm không còn bán — hãy bỏ khỏi giỏ.',
  variant_required: 'Sản phẩm này cần chọn biến thể — bỏ dòng này và thêm lại từ trang sản phẩm.',
  variant_unavailable: 'Biến thể này không còn bán — hãy bỏ khỏi giỏ.',
  below_moq: 'Chưa đủ số lượng tối thiểu của sản phẩm.',
  no_price: 'Sản phẩm chưa có giá cho số lượng này — hãy gửi yêu cầu báo giá.',
  out_of_stock: 'Vượt quá tồn kho.',
};

export function tierPriceForQty(tiers: CartTier[], qty: number): number | null {
  const match = tiers
    .filter((t) => t.min_qty <= qty && (t.max_qty == null || t.max_qty >= qty))
    .sort((a, b) => b.min_qty - a.min_qty)[0];
  return match ? Number(match.unit_price) : null;
}

// Mã lỗi từ cart_set_item() / checkout_cart() → câu tiếng Việt. `details` là
// tên sản phẩm gây lỗi (nếu hàm có gửi).
export function cartErrorMessage(message: string, details?: string | null): string {
  const about = details ? ` (${details})` : '';
  if (message.includes('CART_EMPTY')) return 'Giỏ hàng đang trống.';
  if (message.includes('CART_LIMIT_REACHED')) return 'Giỏ hàng tối đa 100 dòng.';
  if (message.includes('INVALID_QUANTITY')) return 'Số lượng không hợp lệ.';
  if (message.includes('PRODUCT_NOT_AVAILABLE')) return `Sản phẩm không còn bán${about}.`;
  if (message.includes('VARIANT_REQUIRED')) return `Vui lòng chọn biến thể${about}.`;
  if (message.includes('VARIANT_NOT_AVAILABLE')) return `Biến thể không còn bán${about}.`;
  if (message.includes('BELOW_MIN_ORDER_QTY')) return `Chưa đủ số lượng tối thiểu${about}.`;
  if (message.includes('PRICE_NOT_AVAILABLE')) {
    return `Sản phẩm chưa có giá cho số lượng này${about} — hãy gửi yêu cầu báo giá.`;
  }
  if (message.includes('OUT_OF_STOCK')) return `Không đủ hàng trong kho${about}.`;
  if (message.includes('ADDRESS_REQUIRED')) return 'Bạn chưa có địa chỉ giao hàng.';
  if (message.includes('ADDRESS_NOT_FOUND'))
    return 'Không tìm thấy địa chỉ đã chọn. Tải lại trang.';
  if (message.includes('NOT_A_BUYER')) return 'Chỉ tài khoản người mua đặt hàng được.';
  if (message.includes('ACCOUNT_SUSPENDED')) return 'Tài khoản của bạn đang bị tạm khóa.';
  if (message.includes('NOT_AUTHENTICATED')) return 'Vui lòng đăng nhập lại.';
  return 'Có lỗi xảy ra. Vui lòng thử lại.';
}

interface CartRow {
  id: string;
  quantity: number;
  variant_id: string | null;
  products: {
    id: string;
    name: string;
    status: string;
    min_order_qty: number;
    is_ready_stock: boolean;
    stock_qty: number;
    supplier_id: string;
    price_tiers: CartTier[] | null;
    product_media:
      { cdn_url: string | null; thumbnail_url: string | null; is_primary: boolean }[] | null;
    product_variants: { id: string; is_active: boolean }[] | null;
  } | null;
  product_variants: {
    id: string;
    color: string | null;
    size: string | null;
    material: string | null;
    price_adjustment: number;
    stock_qty: number;
    is_active: boolean;
  } | null;
}

// Đọc giỏ của buyer và tính giá hiển thị. RLS: buyer chỉ đọc được giỏ của mình
// và chỉ thấy sản phẩm đang bán công khai — sản phẩm đã ngừng bán trả về null.
export async function loadCart(supabase: SupabaseServerClient, buyerId: string): Promise<Cart> {
  const { data } = await supabase
    .from('cart_items')
    .select(
      'id, quantity, variant_id, products(id, name, status, min_order_qty, is_ready_stock, stock_qty, supplier_id, price_tiers(min_qty, max_qty, unit_price), product_media(cdn_url, thumbnail_url, is_primary), product_variants(id, is_active)), product_variants(id, color, size, material, price_adjustment, stock_qty, is_active)',
    )
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: true });

  const rows = (data ?? []) as unknown as CartRow[];

  const productQty = new Map<string, number>();
  for (const row of rows) {
    if (row.products) {
      productQty.set(row.products.id, (productQty.get(row.products.id) ?? 0) + row.quantity);
    }
  }

  const supplierIds = [
    ...new Set(rows.map((r) => r.products?.supplier_id).filter(Boolean)),
  ] as string[];
  const { data: suppliers } = supplierIds.length
    ? await supabase.from('public_supplier_profiles').select('id, shop_name').in('id', supplierIds)
    : { data: [] as { id: string; shop_name: string }[] };
  const supplierName = new Map(
    (suppliers ?? []).map((s) => [s.id as string, s.shop_name as string]),
  );

  const lines: CartLine[] = rows.map((row) => {
    const p = row.products;
    const v = row.product_variants;
    const totalQty = p ? (productQty.get(p.id) ?? row.quantity) : row.quantity;
    const tier = p ? tierPriceForQty(p.price_tiers ?? [], totalQty) : null;
    const unitPrice = tier == null ? null : tier + Number(v?.price_adjustment ?? 0);
    const stock = p?.is_ready_stock ? (v ? v.stock_qty : p.stock_qty) : null;
    const media = p?.product_media ?? [];
    const thumb = media.find((m) => m.is_primary) ?? media[0];

    let problem: CartProblem | null = null;
    if (!p || p.status !== 'active' || !supplierName.has(p.supplier_id)) problem = 'unavailable';
    else if (!row.variant_id && (p.product_variants ?? []).some((x) => x.is_active)) {
      problem = 'variant_required';
    } else if (row.variant_id && (!v || !v.is_active)) problem = 'variant_unavailable';
    else if (totalQty < p.min_order_qty) problem = 'below_moq';
    else if (unitPrice == null || unitPrice < 0) problem = 'no_price';
    else if (stock != null && stock < row.quantity) problem = 'out_of_stock';

    return {
      id: row.id,
      productId: p?.id ?? '',
      variantId: row.variant_id,
      quantity: row.quantity,
      name: p?.name ?? 'Sản phẩm không còn bán',
      variantLabel: v ? [v.color, v.size, v.material].filter(Boolean).join(' · ') || null : null,
      imageUrl: thumb?.thumbnail_url ?? thumb?.cdn_url ?? null,
      supplierId: p?.supplier_id ?? null,
      moq: p?.min_order_qty ?? 1,
      productQty: totalQty,
      unitPrice,
      lineTotal: unitPrice == null ? null : unitPrice * row.quantity,
      stock,
      problem,
    };
  });

  const groupMap = new Map<string, CartGroup>();
  for (const line of lines) {
    const key = line.supplierId ?? 'none';
    const group = groupMap.get(key) ?? {
      supplierId: line.supplierId,
      supplierName: line.supplierId
        ? (supplierName.get(line.supplierId) ?? 'Xưởng')
        : 'Không còn bán',
      lines: [],
      subtotal: 0,
    };
    group.lines.push(line);
    group.subtotal += line.problem ? 0 : (line.lineTotal ?? 0);
    groupMap.set(key, group);
  }

  const groups = [...groupMap.values()];
  return {
    groups,
    lineCount: lines.length,
    total: groups.reduce((sum, g) => sum + g.subtotal, 0),
    hasProblems: lines.some((l) => l.problem !== null),
  };
}
