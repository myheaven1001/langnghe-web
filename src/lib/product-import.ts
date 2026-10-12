// Nhập sản phẩm hàng loạt (bước 6 — Công cụ nhà bán). Xưởng dán các ô chép từ
// Excel / Google Sheets (cách nhau bằng tab) hoặc chọn file .csv; phần này đọc
// thành các dòng để xem trước rồi gửi cho RPC bulk_save_products(), nơi kiểm
// tra lại toàn bộ. Không dùng thư viện đọc .xlsx: file Excel lưu dạng
// "CSV UTF-8" hoặc chép–dán trực tiếp là đủ.

export interface ImportRow {
  name: string;
  category: string;
  description: string;
  min_order_qty: string;
  lead_time_days: string;
  unit_price: string;
  accept_oem: string;
  is_ready_stock: string;
  stock_qty: string;
}

export type ImportField = keyof ImportRow;

export const IMPORT_COLUMNS: {
  field: ImportField;
  label: string;
  required: boolean;
  example: string;
}[] = [
  { field: 'name', label: 'Tên sản phẩm', required: true, example: 'Bát gốm men lam 12cm' },
  { field: 'category', label: 'Danh mục', required: true, example: 'Gốm sứ' },
  { field: 'min_order_qty', label: 'Số lượng tối thiểu', required: true, example: '50' },
  { field: 'lead_time_days', label: 'Thời gian sản xuất (ngày)', required: true, example: '7' },
  { field: 'unit_price', label: 'Đơn giá', required: false, example: '25000' },
  { field: 'description', label: 'Mô tả', required: false, example: 'Men lam vẽ tay, lò gas' },
  { field: 'accept_oem', label: 'Nhận OEM', required: false, example: 'có' },
  { field: 'is_ready_stock', label: 'Hàng có sẵn', required: false, example: '' },
  { field: 'stock_qty', label: 'Tồn kho', required: false, example: '' },
];

export const IMPORT_MAX_ROWS = 200;

// Bỏ dấu + chữ thường + chỉ giữ chữ số: so tên cột không phụ thuộc cách gõ.
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ['tensanpham', 'ten', 'sanpham', 'name'],
  category: ['danhmuc', 'nganhhang', 'category'],
  description: ['mota', 'description'],
  min_order_qty: ['soluongtoithieu', 'moq', 'toithieu'],
  lead_time_days: ['thoigiansanxuatngay', 'thoigiansanxuat', 'songaysanxuat', 'leadtime'],
  unit_price: ['dongia', 'gia', 'price'],
  accept_oem: ['nhanoem', 'oem'],
  is_ready_stock: ['hangcosan', 'cosan'],
  stock_qty: ['tonkho', 'kho', 'stock'],
};

/** Tách một bảng CSV / TSV thành các ô, hiểu ô có dấu ngoặc kép và xuống dòng trong ô. */
export function parseTable(text: string): string[][] {
  const source = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = source.split('\n', 1)[0] ?? '';
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** "25.000 đ" / "25,000" → "25000"; giữ nguyên nếu không phải số để server báo lỗi đúng dòng. */
function cleanNumber(value: string): string {
  const compact = value.trim().replace(/[\s.,₫đ]|vnd/gi, '');
  return /^-?\d+$/.test(compact) ? compact : value.trim();
}

const NUMBER_FIELDS: ImportField[] = ['min_order_qty', 'lead_time_days', 'unit_price', 'stock_qty'];

export function parseImport(text: string): { rows: ImportRow[]; error: string | null } {
  const table = parseTable(text);
  if (table.length === 0) return { rows: [], error: null };

  const header = table[0].map(normalize);
  const columnOf = new Map<ImportField, number>();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ImportField, string[]][]) {
    const index = header.findIndex((h) => aliases.includes(h));
    if (index >= 0) columnOf.set(field, index);
  }
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !columnOf.has(c.field));
  if (missing.length > 0) {
    return {
      rows: [],
      error: `Dòng đầu phải là tên cột. Thiếu cột: ${missing.map((c) => c.label).join(', ')}.`,
    };
  }

  const rows = table.slice(1).map((cells) => {
    const row = {} as ImportRow;
    for (const { field } of IMPORT_COLUMNS) {
      const raw = (cells[columnOf.get(field) ?? -1] ?? '').trim();
      row[field] = NUMBER_FIELDS.includes(field) ? cleanNumber(raw) : raw;
    }
    return row;
  });
  if (rows.length > IMPORT_MAX_ROWS) {
    return {
      rows: [],
      error: `Mỗi lần nhập tối đa ${IMPORT_MAX_ROWS} dòng (bạn có ${rows.length}).`,
    };
  }
  return { rows, error: null };
}

/** File mẫu: mở bằng Excel được (có BOM), dòng 2 là ví dụ. */
export function templateCsv(): string {
  const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return (
    '﻿' +
    [IMPORT_COLUMNS.map((c) => c.label), IMPORT_COLUMNS.map((c) => c.example)]
      .map((line) => line.map(quote).join(','))
      .join('\r\n') +
    '\r\n'
  );
}

// Mã lỗi từng dòng của bulk_save_products() → câu tiếng Việt.
export const IMPORT_ROW_ERROR: Record<string, string> = {
  NAME_REQUIRED: 'Thiếu tên sản phẩm (hoặc dài quá 200 ký tự).',
  CATEGORY_NOT_FOUND: 'Không có danh mục này — dùng đúng tên danh mục của sàn.',
  INVALID_MOQ: 'Số lượng tối thiểu phải từ 1.',
  INVALID_LEAD_TIME: 'Thời gian sản xuất từ 1 đến 365 ngày.',
  INVALID_PRICE: 'Đơn giá phải lớn hơn 0.',
  INVALID_STOCK: 'Tồn kho không được âm.',
  INVALID_NUMBER: 'Có ô số không phải là số.',
  DUPLICATE_NAME: 'Bạn đã có sản phẩm trùng tên.',
  ROW_FAILED: 'Không lưu được dòng này.',
};

/** Kiểm tra nhanh ở trình duyệt để tô đỏ trước khi gửi; server vẫn kiểm tra lại. */
export function checkImportRow(row: ImportRow, categories: string[]): string | null {
  if (!row.name) return IMPORT_ROW_ERROR.NAME_REQUIRED;
  if (!categories.includes(normalize(row.category))) return IMPORT_ROW_ERROR.CATEGORY_NOT_FOUND;
  if (!/^\d+$/.test(row.min_order_qty) || Number(row.min_order_qty) < 1) {
    return IMPORT_ROW_ERROR.INVALID_MOQ;
  }
  const lead = Number(row.lead_time_days);
  if (!/^\d+$/.test(row.lead_time_days) || lead < 1 || lead > 365) {
    return IMPORT_ROW_ERROR.INVALID_LEAD_TIME;
  }
  if (row.unit_price && (!/^\d+$/.test(row.unit_price) || Number(row.unit_price) <= 0)) {
    return IMPORT_ROW_ERROR.INVALID_PRICE;
  }
  if (row.stock_qty && !/^\d+$/.test(row.stock_qty)) return IMPORT_ROW_ERROR.INVALID_STOCK;
  return null;
}

export { normalize as normalizeImportText };
