// Dữ liệu trang sản phẩm (2.3) — server (page.tsx) đọc database rồi truyền
// xuống client dưới dạng các kiểu thuần dưới đây.

export interface ProductView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  moq: number;
  leadTimeDays: number | null;
  acceptOem: boolean;
  acceptCustom: boolean;
  status: string;
  category: { id: string; name: string; slug: string } | null;
}

export interface TierView {
  minQty: number;
  maxQty: number | null;
  unitPrice: number;
}

export interface VariantView {
  id: string;
  label: string;
  priceAdjustment: number;
  stockQty: number;
}

export interface MediaView {
  id: string;
  url: string;
  /** Biến thể mà ảnh minh hoạ; null = ảnh chung của sản phẩm (4.5). */
  variantId: string | null;
}

export interface SupplierView {
  id: string;
  slug: string | null;
  shopName: string;
  villageOrigin: string | null;
  craftCategory: string | null;
  rating: number | null;
  logoUrl: string | null;
  foundingYear: number | null;
  monthlyCapacity: number | null;
  responseRate: number | null;
  onTimeRate: number | null;
  totalOrders: number | null;
  verified: boolean;
}

export interface RelatedView {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  minPrice: number | null;
  moq: number;
}

// Ai đang xem trang — quyết định hiện nút nào.
//   guest  chưa đăng nhập → Gửi RFQ dẫn tới đăng nhập rồi quay lại
//   buyer  gửi RFQ được
//   owner  xưởng chủ sản phẩm → nút Sửa thay cho nút mua
//   other  xưởng khác / admin → không gửi RFQ
export type ViewerKind = 'guest' | 'buyer' | 'owner' | 'other';

export interface Viewer {
  kind: ViewerKind;
  loginHref: string;
  editHref: string;
}

// Bậc giá áp dụng cho số lượng qty (bậc cao nhất có min_qty ≤ qty).
export function tierIndexForQty(tiers: TierView[], qty: number): number {
  let index = 0;
  tiers.forEach((t, i) => {
    if (qty >= t.minQty) index = i;
  });
  return index;
}

export function qtyRangeLabel(tier: TierView): string {
  return tier.maxQty == null
    ? `${tier.minQty.toLocaleString('vi-VN')}+ cái`
    : `${tier.minQty.toLocaleString('vi-VN')} – ${tier.maxQty.toLocaleString('vi-VN')} cái`;
}

// % rẻ hơn so với bậc giá đầu tiên (đắt nhất).
export function savingPercent(tiers: TierView[], index: number): number {
  const first = tiers[0]?.unitPrice;
  const current = tiers[index]?.unitPrice;
  if (!first || !current || current >= first) return 0;
  return Math.round((1 - current / first) * 100);
}
