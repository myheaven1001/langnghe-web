// Hardcoded content transcribed from category_listing_page.html. The [slug]
// route param isn't used to look anything up yet — every category page
// shows this same "Gốm sứ" sample until the real catalog is wired up.

import type { ProductListing } from '@/components/ui';

export const CATEGORY = {
  emoji: '🏺',
  name: 'Gốm sứ',
  sub: 'Bát Tràng, Phù Lãng, Chu Đậu — Gốm thủ công truyền thống Việt Nam 700 năm',
  stats: [
    { num: '248', label: 'Sản phẩm' },
    { num: '86', label: 'Nhà cung cấp' },
    { num: '4', label: 'Làng nghề' },
    { num: 'MOQ 20', label: 'Tối thiểu' },
  ],
};

export interface CountedOption {
  label: string;
  count: number;
}

export const SUB_CATS_BAR: CountedOption[] = [
  { label: 'Tất cả', count: 248 },
  { label: 'Gốm gia dụng', count: 84 },
  { label: 'Gốm decor', count: 67 },
  { label: 'Gốm quà tặng', count: 54 },
  { label: 'OEM xuất khẩu', count: 32 },
  { label: 'Bộ ấm trà', count: 18 },
];

export const VILLAGE_OPTIONS: CountedOption[] = [
  { label: 'Bát Tràng, Hà Nội', count: 142 },
  { label: 'Phù Lãng, Bắc Ninh', count: 56 },
  { label: 'Chu Đậu, Hải Dương', count: 38 },
  { label: 'Hương Canh, Vĩnh Phúc', count: 12 },
];

export const MOQ_OPTIONS = ['Dưới 20 cái', '20 – 100 cái', '100 cái trở lên'];

export const FEATURE_OPTIONS = [
  'OEM / In logo',
  'Đặt theo mẫu riêng',
  'Xưởng xác minh',
  'Xuất khẩu được',
];

export interface FeaturedVillage {
  emoji: string;
  name: string;
  count: number;
  location: string;
  gradient: string;
}

export const FEATURED_VILLAGES: FeaturedVillage[] = [
  {
    emoji: '🏺',
    name: 'Bát Tràng',
    count: 142,
    location: 'Hà Nội',
    gradient: 'bg-[linear-gradient(135deg,#8B4513,#CD853F)]',
  },
  {
    emoji: '🍶',
    name: 'Phù Lãng',
    count: 56,
    location: 'Bắc Ninh',
    gradient: 'bg-[linear-gradient(135deg,#5D4037,#8D6E63)]',
  },
  {
    emoji: '🌸',
    name: 'Chu Đậu',
    count: 38,
    location: 'Hải Dương',
    gradient: 'bg-[linear-gradient(135deg,#1565C0,#42A5F5)]',
  },
];

export interface SubCategoryCard {
  id: string;
  icon: string;
  name: string;
  count: number;
}

export const SUB_CATEGORY_CARDS: SubCategoryCard[] = [
  { id: 'gd', icon: '🫙', name: 'Gốm gia dụng', count: 84 },
  { id: 'dc', icon: '🌸', name: 'Gốm decor', count: 67 },
  { id: 'qt', icon: '🎁', name: 'Gốm quà tặng', count: 54 },
  { id: 'oem', icon: '🌏', name: 'OEM xuất khẩu', count: 32 },
];

export const SORT_OPTIONS = ['Bán chạy', 'Giá thấp → cao', 'Giá cao → thấp', 'Mới nhất'];

export const CATEGORY_PRODUCTS: ProductListing[] = [
  {
    id: 'cp-1',
    emoji: '🏺',
    village: 'Bát Tràng, Hà Nội',
    name: 'Bình hoa gốm men rạn cao 25cm',
    price: '32.000đ',
    unit: 'cái',
    moq: 'MOQ 50 cái',
    leadTime: 'Lead 7 ngày',
    tiers: [
      { label: '50c', price: '32k' },
      { label: '200c', price: '27k' },
      { label: '500c', price: '23k↓', best: true },
    ],
    supplier: 'X. Thiên Phú',
    rating: { value: 4.9, count: 142 },
    saleBadge: '-16%',
    tags: [{ label: '✓ XM', tone: 'verified' }],
  },
  {
    id: 'cp-2',
    emoji: '🫖',
    village: 'Bát Tràng, Hà Nội',
    name: 'Ấm trà gốm men ngọc bộ 6 món',
    price: '210.000đ',
    unit: 'bộ',
    moq: 'MOQ 10 bộ',
    leadTime: 'Lead 7 ngày',
    tiers: [
      { label: '10b', price: '210k' },
      { label: '50b', price: '185k' },
      { label: '100b', price: '160k↓', best: true },
    ],
    supplier: 'X. Thiên Phú',
    rating: { value: 4.9, count: 89 },
    tags: [{ label: '✓ XM', tone: 'verified' }],
  },
  {
    id: 'cp-3',
    emoji: '🫙',
    village: 'Bát Tràng, Hà Nội',
    name: 'Hũ gốm men đen mờ nắp gỗ đựng trà',
    price: '45.000đ',
    unit: 'cái',
    moq: 'MOQ 50 cái',
    leadTime: 'Lead 5 ngày',
    tiers: [
      { label: '50c', price: '45k' },
      { label: '200c', price: '38k' },
      { label: '500c', price: '32k↓', best: true },
    ],
    supplier: 'X. Đại Hưng',
    rating: { value: 4.7, count: 68 },
    tags: [{ label: 'OEM', tone: 'oem' }],
  },
  {
    id: 'cp-4',
    emoji: '🌸',
    village: 'Phù Lãng, Bắc Ninh',
    name: 'Bình cắm hoa gốm hoa văn truyền thống',
    price: '72.000đ',
    unit: 'cái',
    moq: 'MOQ 30 cái',
    leadTime: 'Lead 10 ngày',
    tiers: [
      { label: '30c', price: '72k' },
      { label: '100c', price: '62k' },
      { label: '300c', price: '54k↓', best: true },
    ],
    supplier: 'X. Phù Lãng',
    rating: { value: 4.8, count: 34 },
    tags: [],
  },
  {
    id: 'cp-5',
    emoji: '☕',
    village: 'Bát Tràng, Hà Nội',
    name: 'Cốc cafe gốm in logo theo yêu cầu',
    price: '28.000đ',
    unit: 'cái',
    moq: 'MOQ 200 cái',
    leadTime: 'Lead 10 ngày',
    tiers: [
      { label: '200c', price: '28k' },
      { label: '500c', price: '24k' },
      { label: '1000c', price: '20k↓', best: true },
    ],
    supplier: 'X. Thiên Phú',
    rating: { value: 4.8, count: 312 },
    tags: [{ label: 'OEM', tone: 'oem' }],
  },
  {
    id: 'cp-6',
    emoji: '🍶',
    village: 'Bát Tràng, Hà Nội',
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
    supplier: 'X. Phúc Lâm',
    rating: { value: 4.9, count: 201 },
    tags: [],
  },
  {
    id: 'cp-7',
    emoji: '🏺',
    village: 'Chu Đậu, Hải Dương',
    name: 'Bình gốm hoa văn cổ Chu Đậu 35cm',
    price: '95.000đ',
    unit: 'cái',
    moq: 'MOQ 20 cái',
    leadTime: 'Lead 14 ngày',
    tiers: [
      { label: '20c', price: '95k' },
      { label: '50c', price: '82k' },
      { label: '100c', price: '70k↓', best: true },
    ],
    supplier: 'X. Chu Đậu',
    rating: { value: 4.7, count: 28 },
    saleBadge: '-10%',
    tags: [],
  },
  {
    id: 'cp-8',
    emoji: '🎁',
    village: 'Bát Tràng, Hà Nội',
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
    supplier: 'X. Minh Đức',
    rating: { value: 5.0, count: 45 },
    tags: [{ label: 'OEM', tone: 'oem' }],
  },
];
