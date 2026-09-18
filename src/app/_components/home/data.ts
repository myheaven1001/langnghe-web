// Hardcoded content transcribed from langnghe_1688_style.html. Swap these
// for real Supabase queries once the marketplace data model is wired up —
// the shapes below (Product, CategoryGroup, ...) are meant to survive that
// change with minimal edits to the page/components.

export interface NavTabItem {
  icon: string;
  label: string;
}

export const NAV_TABS: NavTabItem[] = [
  { icon: '🏠', label: 'Trang chủ' },
  { icon: '🏺', label: 'Gốm sứ' },
  { icon: '🧺', label: 'Mây tre đan' },
  { icon: '🪵', label: 'Đồ gỗ mỹ nghệ' },
  { icon: '🎋', label: 'Lụa & thêu ren' },
  { icon: '🪔', label: 'Sơn mài' },
  { icon: '⚙️', label: 'Đúc đồng' },
  { icon: '🖼️', label: 'Tranh dân gian' },
  { icon: '🔥', label: 'Ưu đãi lô hàng' },
  { icon: '📦', label: 'Đặt hàng lớn' },
];

export interface CategoryGroup {
  icon: string;
  label: string;
  subcategories: string[];
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    icon: '🏺',
    label: 'Gốm sứ',
    subcategories: ['Gốm gia dụng', 'Gốm decor & trang trí', 'Gốm quà tặng', 'Gốm xuất khẩu OEM'],
  },
  {
    icon: '🧺',
    label: 'Mây tre đan',
    subcategories: ['Giỏ & túi xách', 'Nội thất mây tre', 'Đồ decor'],
  },
  {
    icon: '🪵',
    label: 'Đồ gỗ mỹ nghệ',
    subcategories: ['Tượng gỗ & đồ thờ', 'Nội thất gỗ', 'Gỗ quà tặng'],
  },
  {
    icon: '🎋',
    label: 'Lụa & thêu ren',
    subcategories: ['Vải lụa theo mét', 'Khăn & phụ kiện', 'Áo dài lụa'],
  },
  {
    icon: '🪔',
    label: 'Sơn mài & khảm trai',
    subcategories: ['Tranh sơn mài', 'Đồ khảm trai', 'Quà tặng sơn mài'],
  },
  {
    icon: '⚙️',
    label: 'Đúc đồng & kim loại',
    subcategories: ['Tượng đồng', 'Đồ thờ', 'Đồng hồ đúc'],
  },
  { icon: '🪨', label: 'Đá mỹ nghệ', subcategories: ['Đá cảnh', 'Tượng đá', 'Bếp đá'] },
  {
    icon: '🖼️',
    label: 'Tranh & giấy dân gian',
    subcategories: ['Tranh Đông Hồ', 'Tranh Hàng Trống'],
  },
  { icon: '👗', label: 'Thêu & may mặc', subcategories: ['Thổ cẩm', 'Áo thêu tay'] },
  { icon: '👜', label: 'Đồ da thủ công', subcategories: ['Túi xách da', 'Ví & phụ kiện'] },
];

export interface QuickCategoryItem {
  icon: string;
  label: string;
}

export const QUICK_CATEGORIES: QuickCategoryItem[] = [
  { icon: '🏺', label: 'Gốm sứ' },
  { icon: '🧺', label: 'Mây tre đan' },
  { icon: '🪵', label: 'Đồ gỗ' },
  { icon: '🎋', label: 'Lụa & thêu' },
  { icon: '🪔', label: 'Sơn mài' },
  { icon: '⚙️', label: 'Đúc đồng' },
  { icon: '🪨', label: 'Đá mỹ nghệ' },
  { icon: '🖼️', label: 'Tranh dân gian' },
];

export interface ProductTag {
  label: string;
  tone: 'verified' | 'oem' | 'hot' | 'sale';
}

export interface ProductRating {
  stars: string;
  value: number;
  count: number;
}

export interface Product {
  id: string;
  emoji: string;
  imageLabel: string;
  name: string;
  price: string;
  unit: string;
  metaLine: string;
  tags: ProductTag[];
  discountBadge?: string;
  rating?: ProductRating;
}

export const FLASH_SALE_PRODUCTS: Product[] = [
  {
    id: 'flash-1',
    emoji: '🏺',
    imageLabel: 'Bát Tràng',
    name: 'Bình hoa gốm men rạn truyền thống',
    price: '26.600đ',
    unit: 'cái',
    metaLine: 'Giá gốc 38.000đ · MOQ 50 cái',
    discountBadge: '-30%',
    tags: [
      { label: '-30%', tone: 'sale' },
      { label: '✓ Xác minh', tone: 'verified' },
    ],
  },
  {
    id: 'flash-2',
    emoji: '🧺',
    imageLabel: 'Chương Mỹ',
    name: 'Giỏ mây đan thủ công size M quai da',
    price: '48.750đ',
    unit: 'cái',
    metaLine: 'Giá gốc 65.000đ · MOQ 100 cái',
    discountBadge: '-25%',
    tags: [
      { label: '-25%', tone: 'sale' },
      { label: 'OEM được', tone: 'oem' },
    ],
  },
  {
    id: 'flash-3',
    emoji: '🪵',
    imageLabel: 'Đồng Kỵ',
    name: 'Tượng Phật gỗ hương nguyên khối 30cm',
    price: '680.000đ',
    unit: 'cái',
    metaLine: 'Giá gốc 850.000đ · MOQ 5 cái',
    discountBadge: '-20%',
    tags: [
      { label: '-20%', tone: 'sale' },
      { label: '✓ Xác minh', tone: 'verified' },
    ],
  },
  {
    id: 'flash-4',
    emoji: '🎋',
    imageLabel: 'Vạn Phúc',
    name: 'Khăn lụa tơ tằm 100% thêu tay truyền thống',
    price: '80.750đ',
    unit: 'cái',
    metaLine: 'Giá gốc 95.000đ · MOQ 30 cái',
    discountBadge: '-15%',
    tags: [
      { label: '-15%', tone: 'sale' },
      { label: '🔥 Hot', tone: 'hot' },
    ],
  },
  {
    id: 'flash-5',
    emoji: '🪔',
    imageLabel: 'Hạ Thái',
    name: 'Tranh sơn mài phong cảnh làng quê 40x60cm',
    price: '224.000đ',
    unit: 'cái',
    metaLine: 'Giá gốc 280.000đ · MOQ 10 cái',
    discountBadge: '-20%',
    tags: [
      { label: '-20%', tone: 'sale' },
      { label: '✓ Xác minh', tone: 'verified' },
    ],
  },
];

export const FEATURED_PRODUCTS: Product[] = [
  {
    id: 'feat-1',
    emoji: '⚙️',
    imageLabel: 'Ý Yên, Nam Định',
    name: 'Chuông đồng thủ công đúc nguyên khối',
    price: '320.000đ',
    unit: 'cái',
    metaLine: 'MOQ 10 cái · Lead time 15 ngày',
    tags: [{ label: '✓ Xác minh', tone: 'verified' }],
    rating: { stars: '★★★★★', value: 4.9, count: 67 },
  },
  {
    id: 'feat-2',
    emoji: '🏺',
    imageLabel: 'Phù Lãng, Bắc Ninh',
    name: 'Bát ăn gốm men mộc Phù Lãng set 6 chiếc',
    price: '145.000đ',
    unit: 'set',
    metaLine: 'MOQ 20 set · Lead time 7 ngày',
    tags: [
      { label: 'OEM được', tone: 'oem' },
      { label: '🔥 Bán chạy', tone: 'hot' },
    ],
    rating: { stars: '★★★★★', value: 4.8, count: 134 },
  },
  {
    id: 'feat-3',
    emoji: '🪨',
    imageLabel: 'Ninh Vân, Ninh Bình',
    name: 'Tượng rồng đá xanh mỹ nghệ cao 40cm',
    price: '1.200.000đ',
    unit: 'cái',
    metaLine: 'MOQ 2 cái · Lead time 30 ngày',
    tags: [{ label: '✓ Xác minh', tone: 'verified' }],
    rating: { stars: '★★★★☆', value: 4.6, count: 28 },
  },
  {
    id: 'feat-4',
    emoji: '🖼️',
    imageLabel: 'Đông Hồ, Bắc Ninh',
    name: 'Tranh dân gian Đông Hồ bộ 4 bức',
    price: '85.000đ',
    unit: 'bộ',
    metaLine: 'MOQ 50 bộ · Lead time 5 ngày',
    tags: [
      { label: '🔥 Bán chạy', tone: 'hot' },
      { label: 'OEM được', tone: 'oem' },
    ],
    rating: { stars: '★★★★★', value: 4.9, count: 89 },
  },
  {
    id: 'feat-5',
    emoji: '👗',
    imageLabel: 'Mỹ Nghiệp, Ninh Thuận',
    name: 'Vải thổ cẩm Chăm truyền thống theo mét',
    price: '180.000đ',
    unit: 'm',
    metaLine: 'MOQ 10m · Lead time 14 ngày',
    tags: [{ label: '✓ Xác minh', tone: 'verified' }],
    rating: { stars: '★★★★★', value: 5.0, count: 42 },
  },
];

export const CERAMIC_PRODUCTS: Product[] = [
  {
    id: 'ceramic-1',
    emoji: '🏺',
    imageLabel: 'Bát Tràng',
    name: 'Ấm trà gốm men ngọc bộ 6 món',
    price: '210.000đ',
    unit: 'bộ',
    metaLine: 'MOQ 10 bộ',
    tags: [{ label: '✓ Xác minh', tone: 'verified' }],
  },
  {
    id: 'ceramic-2',
    emoji: '🫙',
    imageLabel: 'Bát Tràng',
    name: 'Hũ gốm đựng trà men đen mờ',
    price: '45.000đ',
    unit: 'cái',
    metaLine: 'MOQ 100 cái',
    tags: [{ label: 'OEM được', tone: 'oem' }],
  },
  {
    id: 'ceramic-3',
    emoji: '🍶',
    imageLabel: 'Phù Lãng',
    name: 'Bình rượu gốm cổ điển nắp gỗ',
    price: '55.000đ',
    unit: 'cái',
    metaLine: 'MOQ 50 cái',
    tags: [{ label: '🔥 Hot', tone: 'hot' }],
  },
  {
    id: 'ceramic-4',
    emoji: '🌸',
    imageLabel: 'Chu Đậu',
    name: 'Bình cắm hoa gốm hoa văn truyền thống',
    price: '72.000đ',
    unit: 'cái',
    metaLine: 'MOQ 30 cái',
    tags: [{ label: '✓ Xác minh', tone: 'verified' }],
  },
  {
    id: 'ceramic-5',
    emoji: '☕',
    imageLabel: 'Bát Tràng',
    name: 'Cốc uống cafe gốm in logo theo yêu cầu',
    price: '28.000đ',
    unit: 'cái',
    metaLine: 'MOQ 200 cái',
    tags: [{ label: 'OEM được', tone: 'oem' }],
  },
];

export interface TrustItem {
  icon: string;
  title: string;
  sub: string;
}

export const TRUST_ITEMS: TrustItem[] = [
  { icon: '🔒', title: 'Thanh toán Escrow', sub: 'Tiền an toàn đến khi nhận hàng' },
  { icon: '✅', title: 'Xưởng xác minh', sub: 'Kiểm tra GPKD & CCCD' },
  { icon: '💬', title: 'Báo giá trong 4h', sub: 'Gửi RFQ hoàn toàn miễn phí' },
  { icon: '🚚', title: 'Giao hàng toàn quốc', sub: 'GHN, GHTK, Viettel Post' },
  { icon: '🆓', title: 'Miễn phí cho buyer', sub: 'Không thu phí giao dịch' },
];
