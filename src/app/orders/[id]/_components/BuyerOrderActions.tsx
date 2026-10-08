'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { orderErrorMessage } from '@/lib/orders';
import { Modal, ModalActions, ModalIcon, ModalSub, ModalTitle } from '@/components/ui';

// Buyer xác nhận "Đã nhận hàng" (shipped → delivered) và "Hoàn tất đơn"
// (delivered → completed). Update thẳng orders.status: RLS cho buyer của đơn
// UPDATE, trigger guard_order_update chỉ cho đúng 2 bước này; trigger
// trg_handle_order_status_change ghi mốc thời gian + order_events.
export function BuyerOrderActions({
  orderId,
  status,
  autoCompleteDays,
}: {
  orderId: string;
  status: string;
  autoCompleteDays: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== 'shipped' && status !== 'delivered') return null;
  const next = status === 'shipped' ? 'delivered' : 'completed';

  async function confirm() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('orders').update({ status: next }).eq('id', orderId);
    setBusy(false);
    if (error) {
      setError(orderErrorMessage(error.message, 'Không cập nhật được đơn hàng. Vui lòng thử lại.'));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="border-brand-green mb-4 rounded-[10px] border bg-[#F2FBF6] p-4">
      <div className="text-[13px] font-bold">
        {status === 'shipped' ? '🚚 Hàng đang trên đường tới bạn' : '📬 Bạn đã nhận hàng'}
      </div>
      <div className="text-brand-sub mt-1 text-xs leading-relaxed">
        {status === 'shipped'
          ? 'Khi hàng tới nơi và bạn đã kiểm tra, bấm "Đã nhận hàng".'
          : `Nếu hàng đúng như thoả thuận, bấm "Hoàn tất đơn". Sau ${autoCompleteDays} ngày kể từ khi nhận hàng, đơn sẽ tự hoàn tất.`}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-brand-green mt-3 w-full rounded-lg py-2.5 text-[13px] font-semibold text-white hover:bg-[#008a44]"
      >
        {status === 'shipped' ? '✓ Đã nhận hàng' : '🏁 Hoàn tất đơn'}
      </button>

      <Modal
        open={open}
        onClose={busy ? undefined : () => setOpen(false)}
        centered
        maxWidth="380px"
      >
        <ModalIcon>{status === 'shipped' ? '📬' : '🏁'}</ModalIcon>
        <ModalTitle>
          {status === 'shipped' ? 'Xác nhận đã nhận hàng?' : 'Hoàn tất đơn hàng?'}
        </ModalTitle>
        <ModalSub>
          {status === 'shipped'
            ? 'Chỉ xác nhận khi bạn đã thực sự nhận được hàng. Thao tác này không hoàn lại được.'
            : 'Hoàn tất nghĩa là bạn hài lòng với đơn hàng. Sau khi hoàn tất, nếu có vấn đề hãy liên hệ sàn để được hỗ trợ.'}
        </ModalSub>
        {error && (
          <div className="border-status-red-soft bg-status-red-soft text-status-red mb-3 rounded-lg border px-3 py-2 text-left text-xs">
            {error}
          </div>
        )}
        <ModalActions>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen(false)}
            className="border-brand-border flex-1 rounded-lg border py-2.5 text-[13px] font-semibold disabled:opacity-50"
          >
            Để sau
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={confirm}
            className="bg-brand-green flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Đang lưu...' : 'Xác nhận'}
          </button>
        </ModalActions>
      </Modal>
    </div>
  );
}
