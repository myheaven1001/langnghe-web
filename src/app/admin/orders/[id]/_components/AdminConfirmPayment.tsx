'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatVnd } from '@/lib/format';
import { adminErrorMessage } from '../../../_lib/errors';

const PAYMENT_METHODS = ['Chuyển khoản ngân hàng', 'Ví điện tử', 'Khác'];

const INPUT =
  'border-brand-border focus:border-brand-forest w-full rounded-lg border-[1.5px] px-3 py-2 text-[12.5px] outline-none';

// Xác nhận đã nhận tiền qua RPC admin_confirm_payment() (kế hoạch 3.6): ghi
// số tiền + thời điểm thực nhận, chuyển đơn sang confirmed, ghi
// admin_audit_log. Số tiền khác tổng đơn thì hàm bắt buộc có ghi chú.
export function AdminConfirmPayment({
  orderId,
  totalAmount,
  hasReceipt,
}: {
  orderId: string;
  totalAmount: number;
  hasReceipt: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [amount, setAmount] = useState(String(totalAmount));
  const [paidAt, setPaidAt] = useState('');
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNumber = Number(amount);
  const mismatch =
    Number.isFinite(amountNumber) && amountNumber > 0 && amountNumber !== totalAmount;

  async function submit() {
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError('Vui lòng nhập số tiền đã nhận.');
      return;
    }
    if (mismatch && !note.trim()) {
      setError('Số tiền khác tổng đơn — vui lòng ghi chú giải thích.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('admin_confirm_payment', {
      p_order_id: orderId,
      p_paid_amount: amountNumber,
      // datetime-local là giờ trên máy admin → đổi sang mốc tuyệt đối.
      p_paid_at: paidAt ? new Date(paidAt).toISOString() : null,
      p_method: method,
      p_reference: reference,
      p_note: note,
    });
    setBusy(false);
    if (error) {
      setError(
        adminErrorMessage(error.message, 'Không thể xác nhận thanh toán. Vui lòng thử lại.'),
      );
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {!hasReceipt && (
        <div className="bg-status-amber-soft text-status-amber mb-3 rounded-lg px-3 py-2 text-[11.5px] font-semibold">
          Buyer chưa tải biên lai. Chỉ xác nhận khi đã thấy tiền về tài khoản sàn.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">Số tiền đã nhận (đ) *</span>
          <input
            className={INPUT}
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <span
            className={`mt-1 block text-[11px] ${mismatch ? 'text-brand-red font-semibold' : 'text-brand-sub'}`}
          >
            Tổng đơn: {formatVnd(totalAmount)}
            {mismatch && ` — lệch ${formatVnd(Math.abs(amountNumber - totalAmount))}`}
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">Thời điểm tiền về</span>
          <input
            className={INPUT}
            type="datetime-local"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
          <span className="text-brand-sub mt-1 block text-[11px]">Bỏ trống = bây giờ.</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">Phương thức</span>
          <select
            className={`${INPUT} bg-white`}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">Mã giao dịch / tham chiếu</span>
          <input
            className={INPUT}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="VD: FT2608120001"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold">
            Ghi chú
            {mismatch && <span className="text-brand-red"> * (bắt buộc khi số tiền lệch)</span>}
          </span>
          <textarea
            className={`${INPUT} resize-none`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú này hiện ở mục thanh toán của đơn — buyer cũng thấy."
          />
        </label>
      </div>

      {error && <div className="text-brand-red mt-2 text-[11.5px]">{error}</div>}

      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="bg-brand-forest mt-3 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
      >
        {busy ? 'Đang lưu...' : '✓ Xác nhận đã nhận tiền'}
      </button>
    </div>
  );
}
