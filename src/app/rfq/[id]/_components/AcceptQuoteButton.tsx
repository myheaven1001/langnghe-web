'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatAddressLine, type BuyerAddress } from '@/lib/addresses';
import { Modal, ModalActions, ModalIcon, ModalSub, ModalTitle } from '@/components/ui';

// Chấp nhận báo giá thật: gọi Edge Function accept-quote -> RPC
// accept_quote() (atomic: accept quote này, đóng các quote còn lại của
// RFQ, tạo orders kèm địa chỉ giao hàng chép từ sổ địa chỉ — xem
// supabase/migrations/20261005091800_buyer_addresses_and_accept_quote.sql).
// Sau khi thành công, router.refresh() để server component fetch lại toàn
// bộ trạng thái mới (quote status, rfq status, banner) thay vì tự quản lý
// optimistic state ở đây.
export function AcceptQuoteButton({
  quoteId,
  supplierName,
  addresses,
  rfqId,
}: {
  quoteId: string;
  supplierName: string;
  addresses: BuyerAddress[];
  rfqId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressId, setAddressId] = useState(
    (addresses.find((a) => a.is_default) ?? addresses[0])?.id ?? '',
  );

  const addressBookHref = `/settings/addresses?next=${encodeURIComponent(`/rfq/${rfqId}`)}`;

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);

    const { error } = await supabase.functions.invoke('accept-quote', {
      body: { quoteId, addressId },
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
        maxWidth="420px"
      >
        <ModalIcon>🤝</ModalIcon>
        <ModalTitle>Xác nhận chọn xưởng?</ModalTitle>
        <ModalSub>
          Bạn sắp chấp nhận báo giá từ <strong>{supplierName}</strong>. Các báo giá còn lại sẽ tự
          động đóng. Đơn hàng sẽ được tạo và bạn cần thanh toán để xưởng bắt đầu sản xuất.
        </ModalSub>

        <div className="mb-3 text-left">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold">📍 Giao hàng đến</span>
            {addresses.length > 0 && (
              <Link href={addressBookHref} className="text-brand-red text-xs font-semibold">
                Sửa sổ địa chỉ
              </Link>
            )}
          </div>
          {addresses.length === 0 ? (
            <div className="border-brand-border bg-brand-bg rounded-lg border px-3 py-2.5 text-xs">
              Bạn chưa có địa chỉ giao hàng. Thêm địa chỉ trước khi chấp nhận báo giá.
              <Link
                href={addressBookHref}
                className="bg-brand-red mt-2 block rounded-md py-2 text-center font-semibold text-white"
              >
                + Thêm địa chỉ giao hàng
              </Link>
            </div>
          ) : (
            <div className="max-h-[190px] space-y-1.5 overflow-y-auto">
              {addresses.map((a) => (
                <label
                  key={a.id}
                  className={`flex cursor-pointer gap-2 rounded-lg border-[1.5px] px-3 py-2 text-xs ${
                    addressId === a.id ? 'border-brand-green bg-[#F2FBF6]' : 'border-brand-border'
                  }`}
                >
                  <input
                    type="radio"
                    name={`address-${quoteId}`}
                    className="mt-0.5"
                    checked={addressId === a.id}
                    onChange={() => setAddressId(a.id)}
                  />
                  <span>
                    <span className="font-semibold">
                      {a.recipient_name} — {a.phone}
                    </span>
                    {a.label && <span className="text-brand-sub"> · {a.label}</span>}
                    <span className="text-brand-sub block">{formatAddressLine(a)}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="border-status-red-soft bg-status-red-soft text-status-red mb-3 rounded-lg border px-3 py-2 text-left text-xs">
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
            disabled={submitting || !addressId}
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
