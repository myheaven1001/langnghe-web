// Hardcoded content transcribed from search_results_page.html. Swap these
// for a real search query once the backend exists — the filter/result
// counts below are cosmetic (the prototype never actually filters the
// grid), so this page preserves that same non-wired behavior.

import type { ProductListing } from '@/components/ui';

export const SEARCH_PRODUCTS: ProductListing[] = [
  {
    id: 'sp-1',
    emoji: '🏺',
    village: 'Bát Tràng, Hà Nội',
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
    supplier: 'X. Thiên Phú',
    rating: { value: 4.9, count: 142 },
    saleBadge: '-16%',
    tags: [{ label: '✓ XM', tone: 'verified' }],
  },
  {
    id: 'sp-2',
    emoji: '🫙',
    village: 'Bát Tràng, Hà Nội',
    name: 'Hũ gốm men đen mờ đựng trà nắp gỗ',
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
    sponsored: true,
  },
  {
    id: 'sp-3',
    emoji: '🫖',
    village: 'Bát Tràng, Hà Nội',
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
    supplier: 'X. Thiên Phú',
    rating: { value: 4.9, count: 89 },
    tags: [{ label: '✓ XM', tone: 'verified' }],
  },
  {
    id: 'sp-4',
    emoji: '🌸',
    village: 'Phù Lãng, Bắc Ninh',
    name: 'Bình cắm hoa gốm hoa văn truyền thống 30cm',
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
    saleBadge: '-10%',
    tags: [],
  },
  {
    id: 'sp-5',
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
    tags: [{ label: 'OEM', tone: 'oem' }],
  },
  {
    id: 'sp-6',
    emoji: '☕',
    village: 'Bát Tràng, Hà Nội',
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
    supplier: 'X. Thiên Phú',
    rating: { value: 4.8, count: 312 },
    tags: [
      { label: 'OEM', tone: 'oem' },
      { label: '✓ XM', tone: 'verified' },
    ],
  },
  {
    id: 'sp-7',
    emoji: '🏺',
    village: 'Chu Đậu, Hải Dương',
    name: 'Bình gốm hoa văn cổ Chu Đậu cao 35cm',
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
    tags: [],
  },
  {
    id: 'sp-8',
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
    saleBadge: '-15%',
    tags: [{ label: 'OEM', tone: 'oem' }],
  },
];

export interface CountedOption {
  label: string;
  count: number;
}

export const CATEGORY_OPTIONS: CountedOption[] = [
  { label: 'Gốm sứ', count: 248 },
  { label: 'Mây tre đan', count: 134 },
  { label: 'Đồ gỗ mỹ nghệ', count: 89 },
  { label: 'Lụa & thêu ren', count: 56 },
  { label: 'Sơn mài', count: 42 },
];

export const MOQ_OPTIONS = ['Dưới 20 cái', '20 – 50 cái', '50 – 200 cái', '200 cái trở lên'];

export const FEATURE_OPTIONS = [
  'Xưởng xác minh',
  'OEM / In logo',
  'Đặt theo mẫu riêng',
  'Xuất khẩu được',
  'Có video sản phẩm',
];

export const VILLAGE_OPTIONS: CountedOption[] = [
  { label: 'Bát Tràng, Hà Nội', count: 142 },
  { label: 'Phù Lãng, Bắc Ninh', count: 38 },
  { label: 'Chu Đậu, Hải Dương', count: 24 },
  { label: 'Hương Canh, Vĩnh Phúc', count: 18 },
];

export const RELATED_SEARCHES = [
  'bình gốm men lam',
  'bình hoa gốm decor',
  'gốm bát tràng OEM',
  'bình rượu gốm',
  'ấm trà gốm',
  'hũ gốm đựng trà',
];

export const SORT_OPTIONS = [
  'Phù hợp nhất',
  'Bán chạy nhất',
  'Giá thấp → cao',
  'Giá cao → thấp',
  'Đánh giá cao nhất',
  'Mới nhất',
];
