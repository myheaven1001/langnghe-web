// Hardcoded content transcribed from supplier_shop_page.html. The [id]
// route param isn't used to look anything up yet — every shop page shows
// this same sample supplier until the real catalog is wired up.

import type { ProductListing } from '@/components/ui';

export const SHOP = {
  emoji: '🏺',
  name: 'Xưởng Gốm Thiên Phú',
  village: '📍 Bát Tràng, Gia Lâm, Hà Nội · Thành lập 2005 · 20 năm kinh nghiệm',
  followerCount: '1.240 người theo dõi',
  onlineStatus: '● Đang online',
  // The prototype states "56 sản phẩm" in the metrics strip, the "Tất cả
  // (56)" filter chip, AND the toolbar result count — SHOP_PRODUCTS below
  // only has a small hardcoded sample (8), so this needs its own constant
  // rather than being derived from SHOP_PRODUCTS.length.
  totalProductCount: 56,
};

export interface ShopBadge {
  label: string;
  tone: 'verified' | 'premium' | 'export';
}

export const SHOP_BADGES: ShopBadge[] = [
  { label: '✓ Đã xác minh GPKD', tone: 'verified' },
  { label: '⭐ Premium Supplier', tone: 'premium' },
  { label: '🌏 Xuất khẩu quốc tế', tone: 'export' },
];

export interface ShopMetric {
  num: string;
  label: string;
  sub: string;
}

export const SHOP_METRICS: ShopMetric[] = [
  { num: '4.9', label: '⭐ Đánh giá', sub: '284 đơn hàng' },
  { num: '97%', label: 'Tỷ lệ phản hồi', sub: 'Trung bình 2 giờ' },
  { num: '95%', label: 'Giao đúng hạn', sub: '20 năm kinh nghiệm' },
  { num: '88', label: 'Trust Score', sub: '/100 điểm' },
  { num: '56', label: 'Sản phẩm', sub: '8 danh mục' },
  { num: '3.840', label: 'Đã bán', sub: 'Tổng sản phẩm' },
];

export const SHOP_NAV_TABS = [
  '🏠 Gian hàng',
  '📦 Tất cả sản phẩm',
  '🏺 Gốm gia dụng',
  '🌸 Gốm decor',
  '🎁 Gốm quà tặng',
  '🌏 OEM & Xuất khẩu',
  '⭐ Đánh giá (284)',
  'ℹ️ Về xưởng',
];

export interface AboutRow {
  label: string;
  value: string;
  highlight?: boolean;
}

export const ABOUT_ROWS: AboutRow[] = [
  { label: 'Địa chỉ', value: 'Bát Tràng, Gia Lâm, HN' },
  { label: 'Thành lập', value: '2005 (20 năm)' },
  { label: 'Số thợ', value: '35 thợ lành nghề' },
  { label: 'Công suất', value: '5.000 sp/tháng' },
  { label: 'MOQ', value: 'Từ 20 cái', highlight: true },
  { label: 'OEM', value: 'Từ 200 cái ✓', highlight: true },
  { label: 'Lead time', value: '7–15 ngày' },
  { label: 'Xuất khẩu', value: 'EU, Nhật, Mỹ ✓', highlight: true },
];

export interface Certification {
  icon: string;
  name: string;
  note: string;
}

export const CERTIFICATIONS: Certification[] = [
  { icon: '📜', name: 'GPKD đã xác minh', note: 'Bộ Công Thương, 2005' },
  { icon: '🌱', name: 'Chứng nhận thân thiện MT', note: 'ISO 14001:2015' },
  { icon: '🌏', name: 'CO/CQ xuất khẩu', note: 'Form D, Form E, Form B' },
  { icon: '🏅', name: 'Làng nghề truyền thống', note: 'Bộ Văn hóa, 2018' },
];

export interface CountedOption {
  label: string;
  count: number;
}

export const FILTER_CATEGORIES: CountedOption[] = [
  { label: 'Tất cả', count: 56 },
  { label: 'Gốm gia dụng', count: 18 },
  { label: 'Gốm decor', count: 14 },
  { label: 'Gốm quà tặng', count: 12 },
  { label: 'OEM xuất khẩu', count: 8 },
  { label: 'Bộ sản phẩm', count: 4 },
];

export const FEATURE_OPTIONS = ['OEM / In logo', 'Đặt theo mẫu', 'Xuất khẩu được', 'Có video'];

export const MOQ_OPTIONS = ['Dưới 50 cái', '50 – 200 cái', '200 cái trở lên'];

export const BANNER = {
  title: 'Xưởng Gốm Thiên Phú — Bát Tràng 700 năm',
  sub: 'Chuyên gốm men rạn, men ngọc, men lam truyền thống. 35 thợ lành nghề, công suất 5.000 sản phẩm/tháng. OEM từ 200 cái, xuất khẩu EU/Nhật/Mỹ.',
  tags: ['🏺 Gốm men rạn', '🎨 Men ngọc', '💙 Men lam', '🖨 In logo OEM', '🌏 Xuất khẩu', '📐 Theo mẫu riêng'],
};

export interface Achievement {
  icon: string;
  title: string;
  sub: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { icon: '🏆', title: 'Top 10 gốm sứ', sub: 'Bán chạy tháng 11/2025' },
  { icon: '⭐', title: '4.9/5.0 đánh giá', sub: 'Từ 284 đơn hoàn thành' },
  { icon: '⚡', title: 'Phản hồi siêu nhanh', sub: 'Trung bình 2 giờ' },
  { icon: '🌏', title: 'Xuất khẩu 15 nước', sub: 'EU, Nhật, Mỹ, Úc...' },
  { icon: '🔄', title: '80% mua lại', sub: 'Tỷ lệ khách trở lại' },
];

export const TOOLBAR_CHIPS = ['Tất cả (56)', 'Gốm gia dụng', 'Gốm decor', 'Quà tặng', 'OEM', '🔥 Đang sale'];

export const SORT_OPTIONS = [
  'Bán chạy nhất',
  'Giá thấp → cao',
  'Giá cao → thấp',
  'Mới nhất',
  'Đánh giá cao nhất',
];

export const SHOP_PRODUCTS: ProductListing[] = [
  {
    id: 'shop-1',
    emoji: '🏺',
    name: 'Bình hoa gốm men rạn truyền thống cao 25cm',
    price: '32.000đ',
    unit: 'cái',
    moq: 'MOQ 50 cái',
    leadTime: 'Lead 7 ngày',
    tiers: [
      { label: '50c', price: '32k' },
      { label: '200c', price: '27k' },
      { label: '500c', price: '23k↓', best: true },
    ],
    supplier: 'Đã bán 1.240',
    rating: { value: 4.9 },
    saleBadge: '-16%',
    tags: [{ label: 'OEM', tone: 'oem' }],
  },
  {
    id: 'shop-2',
    emoji: '☕',
    name: 'Cốc cafe gốm in logo theo yêu cầu 300ml',
    price: '28.000đ',
    unit: 'cái',
    moq: 'MOQ 200 cái',
    leadTime: 'Lead 10 ngày',
    tiers: [
      { label: '200c', price: '28k' },
      { label: '500c', price: '24k' },
      { label: '1000c', price: '20k↓', best: true },
    ],
    supplier: 'Đã bán 3.840',
    rating: { value: 4.8 },
    tags: [{ label: 'OEM', tone: 'oem' }],
  },
  {
    id: 'shop-3',
    emoji: '🫖',
    name: 'Ấm trà gốm men ngọc bộ 6 món cao cấp',
    price: '210.000đ',
    unit: 'bộ',
    moq: 'MOQ 10 bộ',
    leadTime: 'Lead 7 ngày',
    tiers: [
      { label: '10b', price: '210k' },
      { label: '50b', price: '185k' },
      { label: '100b', price: '160k↓', best: true },
    ],
    supplier: 'Đã bán 420',
    rating: { value: 4.9 },
    tags: [{ label: '✓ XM', tone: 'verified' }],
  },
  {
    id: 'shop-4',
    emoji: '🫙',
    name: 'Hũ đựng trà gốm men đen mờ nắp gỗ',
    price: '45.000đ',
    unit: 'cái',
    moq: 'MOQ 50 cái',
    leadTime: 'Lead 5 ngày',
    tiers: [
      { label: '50c', price: '45k' },
      { label: '200c', price: '38k' },
      { label: '500c', price: '32k↓', best: true },
    ],
    supplier: 'Đã bán 680',
    rating: { value: 4.7 },
    saleBadge: '-20%',
    tags: [],
  },
  {
    id: 'shop-5',
    emoji: '🌸',
    name: 'Bình cắm hoa gốm hoa văn truyền thống 30cm',
    price: '72.000đ',
    unit: 'cái',
    moq: 'MOQ 30 cái',
    leadTime: 'Lead 7 ngày',
    tiers: [
      { label: '30c', price: '72k' },
      { label: '100c', price: '62k' },
      { label: '300c', price: '54k↓', best: true },
    ],
    supplier: 'Đã bán 290',
    rating: { value: 4.8 },
    tags: [],
  },
  {
    id: 'shop-6',
    emoji: '🍶',
    name: 'Bình rượu gốm cổ điển nắp gỗ 500ml',
    price: '55.000đ',
    unit: 'cái',
    moq: 'MOQ 30 cái',
    leadTime: 'Lead 7 ngày',
    tiers: [
      { label: '30c', price: '55k' },
      { label: '100c', price: '47k' },
      { label: '300c', price: '40k↓', best: true },
    ],
    supplier: 'Đã bán 510',
    rating: { value: 4.9 },
    tags: [{ label: 'OEM', tone: 'oem' }],
  },
  {
    id: 'shop-7',
    emoji: '🎁',
    name: 'Bộ quà tặng gốm cao cấp hộp gỗ 3 món',
    price: '185.000đ',
    unit: 'bộ',
    moq: 'MOQ 20 bộ',
    leadTime: 'Lead 10 ngày',
    tiers: [
      { label: '20b', price: '185k' },
      { label: '50b', price: '165k' },
      { label: '100b', price: '145k↓', best: true },
    ],
    supplier: 'Đã bán 175',
    rating: { value: 5.0 },
    saleBadge: '-10%',
    tags: [{ label: 'OEM', tone: 'oem' }],
  },
  {
    id: 'shop-8',
    emoji: '🏺',
    name: 'Tượng đầu rồng gốm men lam phong thủy',
    price: '95.000đ',
    unit: 'cái',
    moq: 'MOQ 20 cái',
    leadTime: 'Lead 14 ngày',
    tiers: [
      { label: '20c', price: '95k' },
      { label: '50c', price: '82k' },
      { label: '100c', price: '70k↓', best: true },
    ],
    supplier: 'Đã bán 220',
    rating: { value: 4.8 },
    tags: [],
  },
];
