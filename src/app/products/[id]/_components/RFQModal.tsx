'use client';

import { Modal, ModalTitle, ModalSub, ModalActions } from '@/components/ui';
import { DEFAULT_QTY } from './data';

// Matches #rfqPopup from the prototype, rebuilt on top of the shared
// Modal/Overlay from components/ui instead of a hand-rolled backdrop.
export function RFQModal({
  open,
  onClose,
  productName,
  supplierName,
}: {
  open: boolean;
  onClose: () => void;
  productName: string;
  supplierName: string;
}) {
  return (
    <Modal open={open} onClose={onClose} maxWidth="440px">
      <ModalTitle>📋 Gửi yêu cầu báo giá</ModalTitle>
      <ModalSub>
        {productName} · Xưởng {supplierName}
      </ModalSub>

      <div className="flex flex-col gap-2.5">
        <div>
          <div className="mb-1 text-xs font-semibold">Số lượng cần đặt *</div>
          <input
            type="number"
            defaultValue={DEFAULT_QTY}
            className="border-brand-border w-full rounded border px-3 py-2 text-[13px] outline-none"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold">Yêu cầu đặc biệt</div>
          <textarea
            rows={3}
            placeholder="Màu men, kích thước, in logo, thời gian giao hàng..."
            className="border-brand-border w-full resize-none rounded border px-3 py-2 text-[13px] outline-none"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold">Ngân sách dự kiến</div>
          <input
            type="text"
            placeholder="VD: 2.000.000đ – 3.000.000đ"
            className="border-brand-border w-full rounded border px-3 py-2 text-[13px] outline-none"
          />
        </div>
      </div>

      <ModalActions>
        <button
          type="button"
          onClick={onClose}
          className="border-brand-border flex-1 rounded border py-2.5 text-[13px]"
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={onClose}
          className="bg-brand-red flex-[2] rounded py-2.5 text-[13px] font-semibold text-white"
        >
          Gửi yêu cầu báo giá
        </button>
      </ModalActions>
      <div className="text-brand-sub mt-2.5 text-center text-[11px]">
        🔔 Xưởng sẽ phản hồi trong vòng 4 giờ
      </div>
    </Modal>
  );
}
