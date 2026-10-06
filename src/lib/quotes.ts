import type { PillTone } from '@/components/ui';

// Trạng thái báo giá nhìn từ phía xưởng (enum quote_status; 'withdrawn' thêm
// ở 20261005092400).
export const SUPPLIER_QUOTE_STATUS: Record<string, { label: string; tone: PillTone }> = {
  pending: { label: 'Đang chờ buyer', tone: 'amber' },
  counter_offered: { label: 'Đang thương lượng', tone: 'blue' },
  accepted: { label: 'Được chấp nhận', tone: 'green' },
  rejected: { label: 'Không được chọn', tone: 'gray' },
  withdrawn: { label: 'Đã rút', tone: 'gray' },
};

// RFQ còn nhận báo giá — khớp trigger guard_rfq_quote_write (RFQ_NOT_OPEN).
export const RFQ_OPEN_STATUSES = ['published', 'quoted', 'negotiating'];

export interface SupplierQuote {
  id: string;
  rfq_id: string;
  unit_price: number;
  min_qty: number | null;
  lead_time_days: number | null;
  note: string | null;
  valid_until: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}
