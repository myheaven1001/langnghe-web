'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Modal, ModalActions, ModalIcon, ModalSub, ModalTitle } from '@/components/ui';

// Chấp nhận báo giá thật: gọi Edge Function accept-quote -> RPC
// accept_quote() (atomic: accept quote này, đóng các quote còn lại của
// RFQ, tạo orders — xem supabase/migrations/20260919090100_accept_quote.sql).
// Sau khi thành công, router.refresh() để server component fetch lại toàn
// bộ trạng thái mới (quote status, rfq status, banner) thay vì tự quản lý
// optimistic state ở đây.
export function AcceptQuoteButton({
  quoteId,
  supplierName,
}: {
  quoteId: string;
  supplierName: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);

    const { error } = await supabase.functions.invoke('accept-quote', {
      body: { quoteId },
    });

    if (error) {
      let message = 'Có lỗi xảy ra. Vui lòng thử lại.';
      try {
        const ctx = (error as { context?: Response }).context;
        const parsed = await ctx?.json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // giữ message mặc định ở trên
      }
      setSubmitting(false);
      setError(message);
      return;
    }

    setConfirmOpen(false);
    setSubmitting(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="bg-brand-green rounded-md px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#008a44]"
      >
        ✓ Chấp nhận báo giá
      </button>

      <Modal
        open={confirmOpen}
        onClose={submitting ? undefined : () => setConfirmOpen(false)}
        centered
        maxWidth="380px"
      >
        <ModalIcon>🤝</ModalIcon>
        <ModalTitle>Xác nhận chọn xưởng?</ModalTitle>
        <ModalSub>
          Bạn sắp chấp nhận báo giá từ <strong>{supplierName}</strong>. Các báo giá còn lại sẽ tự
          động đóng. Đơn hàng sẽ được tạo và bạn cần thanh toán để xưởng bắt đầu sản xuất.
        </ModalSub>
        {error && (
          <div className="border-status-red-soft bg-status-red-soft text-status-red mb-3 rounded-lg border px-3 py-2 text-left text-[11.5px]">
            {error}
          </div>
        )}
        <ModalActions>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setConfirmOpen(false)}
            className="border-brand-border flex-1 rounded-lg border py-2.5 text-[13px] font-semibold disabled:opacity-50"
          >
            Để sau
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            className="bg-brand-green flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {submitting ? 'Đang xử lý...' : 'Xác nhận chọn'}
          </button>
        </ModalActions>
      </Modal>
    </>
  );
}
