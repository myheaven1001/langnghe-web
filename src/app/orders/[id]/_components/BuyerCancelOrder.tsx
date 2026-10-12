'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { orderErrorMessage } from '@/lib/orders';
import { Modal, ModalActions, ModalSub, ModalTitle } from '@/components/ui';

// Đơn đặt thẳng đang chờ xưởng xác nhận (5.6): hiện hạn xác nhận và cho buyer
// tự huỷ qua RPC buyer_cancel_order(). Chưa chuyển tiền nên không có hoàn
// tiền; kho đã giữ được trả lại. Xưởng đã nhận đơn rồi thì không tự huỷ được.
export function BuyerCancelOrder({ orderId, deadline }: { orderId: string; deadline: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('buyer_cancel_order', {
      p_order_id: orderId,
      p_reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(orderErrorMessage(error.message, 'Không huỷ được đơn. Vui lòng thử lại.'));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="border-brand-border mb-4 rounded-[10px] border bg-white p-4">
      <div className="text-[13px] font-bold">⏳ Đang chờ xưởng xác nhận</div>
      <div className="text-brand-sub mt-1 text-xs leading-relaxed">
        Xưởng có đến {deadline} để nhận đơn. Quá hạn đơn sẽ tự huỷ. Bạn chưa cần chuyển tiền.
      </div>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="border-brand-red text-brand-red mt-3 min-h-10 w-full rounded-lg border-[1.5px] bg-white text-[13px] font-semibold"
      >
        Huỷ đơn
      </button>

      <Modal open={open} onClose={busy ? undefined : () => setOpen(false)} maxWidth="400px">
        <ModalTitle>Huỷ đơn hàng?</ModalTitle>
        <ModalSub>
          Đơn #{orderId.slice(0, 8).toUpperCase()} sẽ bị huỷ và xưởng được báo. Thao tác này không
          hoàn lại được — muốn mua tiếp bạn cần đặt đơn mới.
        </ModalSub>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={400}
          placeholder="Lý do (không bắt buộc)"
          className="border-brand-border focus:border-brand-red w-full resize-none rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
        />
        {error && <div className="text-brand-red mt-2 text-xs">{error}</div>}
        <ModalActions>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen(false)}
            className="border-brand-border min-h-10 flex-1 rounded-lg border-[1.5px] text-[13px] font-semibold disabled:opacity-50"
          >
            Giữ đơn
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={cancel}
            className="bg-brand-red hover:bg-brand-red-dark min-h-10 flex-1 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Đang huỷ...' : 'Huỷ đơn'}
          </button>
        </ModalActions>
      </Modal>
    </div>
  );
}
