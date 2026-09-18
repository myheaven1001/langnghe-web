'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Modal, ModalActions, ModalTitle } from '@/components/ui';

// Insert trực tiếp vào rfq_quotes — RLS rfq_quotes_supplier_own (FOR ALL)
// đã cho phép supplier tự thêm báo giá của mình, không cần RPC (không có
// tác dụng phụ cross-table cần atomic; trigger trg_log_quote_received —
// xem 20260924090000_quote_received.sql — tự chuyển rfq_requests.status
// 'published'->'quoted' và báo buyer, chạy sau INSERT nên không cần gọi tay).
export function QuoteModal({
  rfqId,
  buyerName,
  rfqTitle,
  onClose,
}: {
  rfqId: string;
  buyerName: string;
  rfqTitle: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [unitPrice, setUnitPrice] = useState('');
  const [minQty, setMinQty] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!unitPrice || Number(unitPrice) <= 0) {
      setError('Vui lòng nhập đơn giá đề xuất hợp lệ.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const { error: insertError } = await supabase.from('rfq_quotes').insert({
      rfq_id: rfqId,
      unit_price: Number(unitPrice),
      min_qty: minQty ? Number(minQty) : null,
      lead_time_days: leadTimeDays ? Number(leadTimeDays) : null,
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      note: note.trim() || null,
    });

    setSubmitting(false);
    if (insertError) {
      setError(
        insertError.message.includes('duplicate')
          ? 'Bạn đã gửi báo giá cho RFQ này rồi.'
          : 'Không thể gửi báo giá. Vui lòng thử lại.',
      );
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <Modal open onClose={submitting ? undefined : onClose} maxWidth="440px">
      <ModalTitle>Gửi báo giá</ModalTitle>
      <div className="text-brand-sub mb-1 text-[11.5px]">Cho: {buyerName}</div>
      <div className="bg-brand-bg text-brand-sub mb-3.5 rounded-lg px-3 py-2.5 text-[11.5px] leading-relaxed">
        Yêu cầu: {rfqTitle}
      </div>

      <div className="mb-3.5">
        <div className="mb-1.5 text-xs font-semibold">
          Đơn giá đề xuất (đ) <span className="text-brand-red">*</span>
        </div>
        <input
          type="number"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          placeholder="38000"
          className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[12.5px] outline-none"
        />
      </div>

      <div className="mb-3.5 grid grid-cols-2 gap-2.5">
        <div>
          <div className="mb-1.5 text-xs font-semibold">Số lượng tối thiểu</div>
          <input
            type="number"
            value={minQty}
            onChange={(e) => setMinQty(e.target.value)}
            placeholder="500"
            className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[12.5px] outline-none"
          />
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold">Thời gian sản xuất (ngày)</div>
          <input
            type="number"
            value={leadTimeDays}
            onChange={(e) => setLeadTimeDays(e.target.value)}
            placeholder="15"
            className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[12.5px] outline-none"
          />
        </div>
      </div>

      <div className="mb-3.5">
        <div className="mb-1.5 text-xs font-semibold">Hiệu lực báo giá đến</div>
        <input
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
          className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[12.5px] outline-none"
        />
      </div>

      <div className="mb-1">
        <div className="mb-1.5 text-xs font-semibold">Ghi chú cho buyer</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="VD: Giá đã gồm đóng thùng, có thể sơn phủ chống ẩm theo yêu cầu..."
          className="border-brand-border focus:border-brand-red w-full resize-none rounded-lg border-[1.5px] px-3 py-2.5 text-[12.5px] outline-none"
        />
      </div>

      {error && <div className="text-brand-red mt-2 text-[11.5px]">{error}</div>}

      <ModalActions>
        <button
          type="button"
          disabled={submitting}
          onClick={onClose}
          className="border-brand-border flex-1 rounded-lg border-[1.5px] py-2.5 text-[13px] font-semibold disabled:opacity-50"
        >
          Hủy
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
          className="bg-brand-red hover:bg-brand-red-dark flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {submitting ? 'Đang gửi...' : '🚀 Gửi báo giá'}
        </button>
      </ModalActions>
    </Modal>
  );
}
