'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Modal, ModalActions, ModalIcon, ModalSub, ModalTitle } from '@/components/ui';

// Hủy RFQ: update trực tiếp từ client — an toàn vì rfq_requests_buyer_own
// (RLS, FOR ALL) đã cho phép buyer tự sửa RFQ của chính mình, không cần
// RPC atomic như accept-quote (chỉ 1 cột, 1 dòng, không có tác dụng phụ
// sang bảng khác).
export function CancelRfqButton({ rfqId }: { rfqId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);

    const { error } = await supabase
      .from('rfq_requests')
      .update({ status: 'cancelled' })
      .eq('id', rfqId);

    setSubmitting(false);
    if (error) {
      setError('Có lỗi xảy ra khi hủy yêu cầu. Vui lòng thử lại.');
      return;
    }

    setConfirmOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="border-status-red-soft text-brand-red hover:bg-status-red-soft rounded-lg border-[1.5px] bg-white px-3.5 py-2 text-xs font-semibold"
      >
        ✕ Hủy RFQ
      </button>

      <Modal
        open={confirmOpen}
        onClose={submitting ? undefined : () => setConfirmOpen(false)}
        centered
        maxWidth="380px"
      >
        <ModalIcon>⚠️</ModalIcon>
        <ModalTitle>Hủy yêu cầu báo giá?</ModalTitle>
        <ModalSub>
          Yêu cầu sẽ đóng lại và các xưởng chưa phản hồi sẽ không thể gửi báo giá nữa. Bạn không
          thể hoàn tác thao tác này.
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
            className="bg-brand-red flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {submitting ? 'Đang xử lý...' : 'Xác nhận hủy'}
          </button>
        </ModalActions>
      </Modal>
    </>
  );
}
