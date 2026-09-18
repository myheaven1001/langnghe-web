// Hardcoded content transcribed from product_detail_page.html. The [id]
// route param isn't used to look anything up yet — every product page shows
// this same sample product until the real catalog is wired up.

export interface ImageThumb {
  emoji: string;
  isVideo?: boolean;
}

export const IMAGE_THUMBS: ImageThumb[] = [
  { emoji: '🏺' },
  { emoji: '🫙' },
  { emoji: '🍶' },
  { emoji: '🌸' },
  { emoji: '▶️', isVideo: true },
];

export const IMAGE_TAGS = ['✓ Xưởng đã xác minh', 'OEM / In logo', 'Đặt hàng theo mẫu'] as const;

export interface PriceTier {
  qtyLabel: string;
  price: number;
  priceLabel: string;
  save?: string;
  badge?: { label: string; tone: 'good' | 'best' };
  note: string;
}

export const PRICE_TIERS: PriceTier[] = [
  {
    qtyLabel: '20 – 49 cái',
    price: 38000,
    priceLabel: '38.000đ',
    note: '💡 Đặt 50–199 cái → giá 32.000đ/cái (tiết kiệm 16%)',
  },
  {
    qtyLabel: '50 – 199 cái',
    price: 32000,
    priceLabel: '32.000đ',
    save: '↓ Tiết kiệm 16%',
    badge: { label: 'Phổ biến', tone: 'good' },
    note: '💡 Đặt 500+ cái → giá chỉ còn 23.000đ (tiết kiệm 39%)',
  },
  {
    qtyLabel: '200 – 499 cái',
    price: 27000,
    priceLabel: '27.000đ',
    save: '↓ Tiết kiệm 29%',
    badge: { label: 'Tốt', tone: 'good' },
    note: '💡 Đặt 500+ cái → giá chỉ còn 23.000đ (tiết kiệm 39%)',
  },
  {
    qtyLabel: '500+ cái',
    price: 23000,
    priceLabel: '23.000đ',
    save: '↓ Tiết kiệm 39%',
    badge: { label: 'Tốt nhất', tone: 'best' },
    note: '✅ Đang áp dụng mức giá tốt nhất!',
  },
];

export const DEFAULT_TIER_INDEX = 1;
export const DEFAULT_QTY = 50;
export const MIN_QTY = 20;
export const QTY_STEP = 10;

export interface SpecItem {
  label: string;
  value: string;
  highlight?: boolean;
}

export const SPECS: SpecItem[] = [
  { label: 'MOQ tối thiểu', value: '20 cái', highlight: true },
  { label: 'Lead time', value: '7–10 ngày làm việc' },
  { label: 'Kích thước', value: 'Cao 25cm · Miệng 8cm' },
  { label: 'Chất liệu', value: 'Gốm đất nung cao cấp' },
  { label: 'OEM / In logo', value: 'Từ 200 cái', highlight: true },
  { label: 'Đặt theo mẫu', value: 'Có (trao đổi trực tiếp)', highlight: true },
  { label: 'Đóng gói', value: 'Thùng carton xốp chèn' },
  { label: 'Xuất khẩu', value: 'Có (CO/CQ đầy đủ)', highlight: true },
];

export interface VariantGroupData {
  title: string;
  options: string[];
  defaultIndex: number;
}

export const VARIANT_GROUPS: VariantGroupData[] = [
  {
    title: 'Màu men:',
    options: ['Men rạn trắng', 'Men lam xanh', 'Men nâu mộc', 'Men đen mờ', 'Đặt màu riêng'],
    defaultIndex: 0,
  },
  {
    title: 'Kích thước:',
    options: ['15cm (+0đ)', '25cm (giá cơ bản)', '35cm (+8.000đ)', '45cm (+15.000đ)'],
    defaultIndex: 1,
  },
];

export const SUPPLIER = {
  name: 'Xưởng Gốm Thiên Phú',
  avatar: '🏺',
  rating: 4.9,
  responseTime: 'Phản hồi trong 2h',
  yearsOnPlatform: '5 năm trên sàn',
  location: 'Bát Tràng, Gia Lâm, Hà Nội',
  established: 2005,
};

export const PRODUCT = {
  village: 'Bát Tràng, Gia Lâm, Hà Nội · Thành lập 2005',
  name: 'Bình hoa gốm men rạn truyền thống Bát Tràng cao 25cm — có thể in logo theo yêu cầu từ 200 cái',
  rating: 4.8,
  ratingCount: 142,
  soldCount: '3.840 cái',
  breadcrumb: [
    { label: 'Trang chủ', href: '/' },
    { label: 'Gốm sứ', href: '/search' },
    { label: 'Gốm decor & trang trí', href: '/search' },
    { label: 'Bình hoa gốm men rạn Bát Tràng cao 25cm' },
  ],
};

export const DESCRIPTION_FEATURES = [
  'Men rạn tự nhiên — vết rạn hình thành trong quá trình nung, mỗi bình là độc bản',
  'Đất nung từ làng gốm Bát Tràng 700 năm tuổi, chịu nhiệt tốt, không độc hại',
  'Bề mặt mịn, màu trắng ngà tự nhiên, không phai màu theo thời gian',
  'Phù hợp đặt hoa tươi, cành khô, trang trí nội thất, khách sạn, văn phòng',
  'Có thể khắc tên, in logo từ 200 cái (trao đổi trực tiếp với xưởng)',
];

export const DESCRIPTION_SPECS = [
  'Chiều cao: 25cm ± 0.5cm (thủ công nên có sai số nhỏ)',
  'Đường kính miệng: 8cm · Đường kính thân: 12cm',
  'Trọng lượng: ~420g/cái · Khối lượng đóng gói: ~620g',
  'Chịu nhiệt: đến 120°C · Rửa máy rửa bát: Có',
  'Đóng gói: 6 cái/thùng, chèn xốp PE đầy đủ, tỷ lệ vỡ < 0.5%',
];

export const ORDER_NOTES = [
  'Do làm thủ công, màu men và vết rạn sẽ có sự khác biệt nhỏ giữa các sản phẩm — đây là đặc trưng của gốm thủ công',
  'Đơn OEM (in logo) cần thêm 3–5 ngày sản xuất và tối thiểu 200 cái mỗi mẫu',
  'Có thể lấy mẫu trước (1–3 cái) với chi phí vận chuyển người mua chịu',
];

export interface PriceDetailRow {
  qtyLabel: string;
  unitPrice: string;
  exampleTotal: string;
  save: string;
  note: string;
  best?: boolean;
}

export const PRICE_DETAIL_ROWS: PriceDetailRow[] = [
  { qtyLabel: '20 – 49 cái', unitPrice: '38.000đ', exampleTotal: '760.000đ (20 cái)', save: '—', note: 'Giá tham khảo' },
  { qtyLabel: '50 – 199 cái', unitPrice: '32.000đ', exampleTotal: '1.600.000đ (50 cái)', save: 'Tiết kiệm 16%', note: 'Phổ biến nhất' },
  { qtyLabel: '200 – 499 cái', unitPrice: '27.000đ', exampleTotal: '5.400.000đ (200 cái)', save: 'Tiết kiệm 29%', note: 'Được in logo' },
  {
    qtyLabel: '500 cái trở lên',
    unitPrice: '23.000đ',
    exampleTotal: '11.500.000đ (500 cái)',
    save: 'Tiết kiệm 39%',
    note: '⭐ Giá tốt nhất · Xuất khẩu',
    best: true,
  },
];

export const SUPPLIER_INFO = [
  'Thành lập năm 2005 — 20 năm kinh nghiệm',
  'Quy mô: 35 thợ lành nghề',
  'Công suất: 5.000 sản phẩm/tháng',
  'Chuyên: gốm men rạn, men ngọc, men lam',
  'Đã xuất khẩu: EU, Nhật Bản, Mỹ',
];

export const SUPPLIER_METRICS = [
  'Tỷ lệ phản hồi RFQ: 97% trong 4 giờ',
  'Tỷ lệ giao đúng hạn: 95.2%',
  'Đơn hàng hoàn thành: 284 đơn',
  'Điểm trust score: 88/100',
  'Gói membership: Premium ⭐',
];

export interface RatingBar {
  stars: number;
  percent: number;
  count: number;
}

export const RATING_BARS: RatingBar[] = [
  { stars: 5, percent: 78, count: 111 },
  { stars: 4, percent: 15, count: 21 },
  { stars: 3, percent: 5, count: 7 },
  { stars: 2, percent: 2, count: 2 },
  { stars: 1, percent: 1, count: 1 },
];

export interface Review {
  id: string;
  avatarInitial: string;
  avatarGradient: string;
  name: string;
  stars: string;
  date: string;
  content: string;
  orderNote: string;
}

export const REVIEWS: Review[] = [
  {
    id: 'rv-1',
    avatarInitial: 'L',
    avatarGradient: 'bg-[linear-gradient(135deg,#1677FF,#69B1FF)]',
    name: 'Chị Lan — Shop Decor Hà Nội',
    stars: '★★★★★',
    date: '15/11/2025',
    content:
      'Đặt 200 cái bình men rạn, giao 9 ngày đúng hẹn. Hàng đẹp hơn ảnh, men rạn tự nhiên rất độc. Đóng gói chắc chắn, không vỡ cái nào. Khách mua lại nhiều, đã đặt thêm đơn 300 cái.',
    orderNote: 'Đã mua: 200 cái · Màu men rạn trắng · 25cm',
  },
  {
    id: 'rv-2',
    avatarInitial: 'M',
    avatarGradient: 'bg-[linear-gradient(135deg,#C4622D,#E53333)]',
    name: 'Anh Minh — Công ty quà tặng Sao Việt',
    stars: '★★★★★',
    date: '03/11/2025',
    content:
      'Đặt 500 cái in logo cho sự kiện cuối năm. Xưởng tư vấn nhiệt tình, gửi file mẫu để duyệt trước khi sản xuất. Hàng ra đúng như mong đợi, sếp khen logo in nét và đẹp. Sẽ là đối tác lâu dài.',
    orderNote: 'Đã mua: 500 cái OEM · In logo công ty · 25cm',
  },
  {
    id: 'rv-3',
    avatarInitial: 'H',
    avatarGradient: 'bg-[linear-gradient(135deg,#1A3A2A,#2d5a3d)]',
    name: 'Chị Hoa — Khách sạn Bamboo Retreat',
    stars: '★★★★☆',
    date: '28/10/2025',
    content:
      'Mua 80 bình trang trí phòng khách sạn. Chất lượng ổn, màu men đẹp. Chỉ có 2 cái vỡ miệng nhỏ, xưởng đã bồi thường thêm 3 cái vào lần sau không cần hỏi. Dịch vụ hậu mãi tốt.',
    orderNote: 'Đã mua: 80 cái · Màu men lam xanh · 25cm',
  },
];

export interface RelatedProduct {
  id: string;
  emoji: string;
  name: string;
  price: string;
  moq: string;
}

export const RELATED_PRODUCTS: RelatedProduct[] = [
  { id: 'rel-1', emoji: '🫙', name: 'Hũ gốm đựng trà men đen mờ Bát Tràng', price: '45.000đ', moq: 'MOQ 50 cái' },
  { id: 'rel-2', emoji: '🍶', name: 'Bình rượu gốm cổ điển nắp gỗ', price: '55.000đ', moq: 'MOQ 30 cái' },
  { id: 'rel-3', emoji: '☕', name: 'Cốc uống cafe gốm in logo theo yêu cầu', price: '28.000đ', moq: 'MOQ 200 cái' },
  { id: 'rel-4', emoji: '🌸', name: 'Bình cắm hoa gốm hoa văn truyền thống', price: '72.000đ', moq: 'MOQ 30 cái' },
  { id: 'rel-5', emoji: '🏺', name: 'Ấm trà gốm men ngọc bộ 6 món cao cấp', price: '210.000đ', moq: 'MOQ 10 bộ' },
];
