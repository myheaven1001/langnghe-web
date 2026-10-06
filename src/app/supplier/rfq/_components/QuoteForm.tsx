'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Button,
  Field,
  Input,
  Modal,
  ModalActions,
  ModalSub,
  ModalTitle,
  Textarea,
} from '@/components/ui';
import { formatVnd } from '@/lib/format';
import type { SupplierQuote } from '@/lib/quotes';

// Gửi / sửa / rút báo giá (kế hoạch 4.6). Ghi thẳng rfq_quotes: RLS
// rfq_quotes_supplier_own cho xưởng ghi báo giá của mình, trigger
// guard_rfq_quote_write tự điền supplier_id, chỉ cho sửa khi còn pending và
// chỉ cho đổi trạng thái pending → withdrawn (rút). Rút xong gửi lại được.
export function QuoteForm({
  rfqId,
  quantity,
  unit,
  quote,
}: {
  rfqId: string;
  quantity: number;
  unit: string | null;
  /** Báo giá đang chờ của xưởng cho RFQ này (nếu có) → chế độ sửa. */
  quote: SupplierQuote | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [unitPrice, setUnitPrice] = useState(quote ? String(quote.unit_price) : '');
  const [minQty, setMinQty] = useState(quote?.min_qty != null ? String(quote.min_qty) : '');
  const [leadTimeDays, setLeadTimeDays] = useState(
    quote?.lead_time_days != null ? String(quote.lead_time_days) : '',
  );
  const [validUntil, setValidUntil] = useState(quote?.valid_until?.slice(0, 10) ?? '');
  const [note, setNote] = useState(quote?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const price = Number(unitPrice);
  const validPrice = Number.isFinite(price) && price > 0;

  function errorMessage(message: string, fallback: string) {
    if (message.includes('duplicate'))
      return 'Bạn đã có báo giá đang chờ cho RFQ này. Tải lại trang.';
    if (message.includes('RFQ_NOT_OPEN')) return 'RFQ này đã đóng, không nhận báo giá nữa.';
    if (message.includes('FORBIDDEN_QUOTE_CHANGE')) {
      return 'Báo giá đã được buyer xử lý, không sửa/rút được nữa. Tải lại trang.';
    }
    if (message.includes('ACCOUNT_SUSPENDED')) return 'Tài khoản của bạn đang bị tạm khóa.';
    return fallback;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validPrice) {
      setError('Vui lòng nhập đơn giá hợp lệ.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    const values = {
      unit_price: price,
      min_qty: minQty ? Number(minQty) : null,
      lead_time_days: leadTimeDays ? Number(leadTimeDays) : null,
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      note: note.trim() || null,
    };
    const { error } = quote
      ? await supabase.from('rfq_quotes').update(values).eq('id', quote.id)
      : await supabase.from('rfq_quotes').insert({ rfq_id: rfqId, ...values });
    setBusy(false);
    if (error) {
      setError(errorMessage(error.message, 'Không lưu được báo giá. Vui lòng thử lại.'));
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function withdraw() {
    if (!quote) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('rfq_quotes')
      .update({ status: 'withdrawn' })
      .eq('id', quote.id);
    setBusy(false);
    if (error) {
      setWithdrawOpen(false);
      setError(errorMessage(error.message, 'Không rút được báo giá. Vui lòng thử lại.'));
      return;
    }
    setWithdrawOpen(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label={`Đơn giá (đ / ${unit || 'đơn vị'})`}
          required
          className="sm:col-span-2"
          hint={
            validPrice
              ? `Tổng cho ${quantity.toLocaleString('vi-VN')} ${unit ?? ''}: ${formatVnd(price * quantity)}`
              : undefined
          }
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="38000"
          />
        </Field>
        <Field label="Số lượng tối thiểu">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={minQty}
            onChange={(e) => setMinQty(e.target.value)}
            placeholder="500"
          />
        </Field>
        <Field label="Thời gian sản xuất (ngày)">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={leadTimeDays}
            onChange={(e) => setLeadTimeDays(e.target.value)}
            placeholder="15"
          />
        </Field>
        <Field label="Báo giá có hiệu lực đến" className="sm:col-span-2">
          <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>
        <Field label="Ghi chú cho buyer" className="sm:col-span-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder="VD: Giá đã gồm đóng thùng, có thể sơn phủ chống ẩm theo yêu cầu..."
          />
        </Field>
      </div>

      {error && <div className="text-brand-red mt-3 text-[13px]">{error}</div>}
      {saved && !error && (
        <div className="text-status-green mt-3 text-[13px] font-semibold">
          ✓ {quote ? 'Đã cập nhật báo giá.' : 'Đã gửi báo giá.'}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={busy} className="sm:flex-1">
          {busy ? 'Đang lưu...' : quote ? 'Cập nhật báo giá' : '🚀 Gửi báo giá'}
        </Button>
        {quote && (
          <Button variant="danger" disabled={busy} onClick={() => setWithdrawOpen(true)}>
            Rút báo giá
          </Button>
        )}
      </div>

      <Modal
        open={withdrawOpen}
        onClose={busy ? undefined : () => setWithdrawOpen(false)}
        centered
        maxWidth="380px"
      >
        <ModalTitle>Rút báo giá này?</ModalTitle>
        <ModalSub>
          Buyer sẽ không còn thấy báo giá {quote ? formatVnd(quote.unit_price) : ''} của bạn. Bạn có
          thể gửi báo giá mới khi RFQ còn mở.
        </ModalSub>
        <ModalActions>
          <Button
            variant="secondary"
            disabled={busy}
            className="flex-1"
            onClick={() => setWithdrawOpen(false)}
          >
            Giữ lại
          </Button>
          <Button variant="primary" disabled={busy} className="flex-1" onClick={withdraw}>
            {busy ? 'Đang rút...' : 'Rút báo giá'}
          </Button>
        </ModalActions>
      </Modal>
    </form>
  );
}
