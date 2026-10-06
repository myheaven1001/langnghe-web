'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Modal, ModalActions, ModalTitle } from '@/components/ui';
import { adminErrorMessage } from '../../_lib/errors';

const REPORTERS = [
  { key: 'buyer', label: 'Buyer báo' },
  { key: 'supplier', label: 'Xưởng báo' },
] as const;
type Reporter = (typeof REPORTERS)[number]['key'];

const RESOLUTIONS = [
  { key: 'release_supplier', label: 'Trả tiền cho supplier — buyer khiếu nại không có căn cứ' },
  { key: 'refund_buyer', label: 'Hoàn tiền cho buyer — supplier vi phạm mô tả sản phẩm' },
  { key: 'partial', label: 'Chia tỷ lệ — lỗi một phần từ cả hai bên' },
] as const;

type Resolution = (typeof RESOLUTIONS)[number]['key'];
type ModalKind = 'none' | 'create-dispute' | 'resolve-dispute' | 'cancel';

interface ActiveDispute {
  id: string;
  reason: string;
}

// Thao tác admin trên 1 đơn (kế hoạch 3.6):
//   - Xác nhận thanh toán: làm ở trang chi tiết /admin/orders/[id], nơi có
//     biên lai của buyer cạnh form (hàm admin_confirm_payment).
//   - Ghi tranh chấp: RPC admin_open_dispute() — ghi đúng bên báo (buyer hoặc
//     xưởng) + admin nhập, có nhật ký.
//   - Xử lý tranh chấp: RPC admin_resolve_dispute(). Trigger
//     trg_handle_dispute_insert/update tự gửi notification cho 2 bên.
//   - Huỷ đơn (chỉ ở trang chi tiết): RPC admin_cancel_order(), bắt buộc lý do.
// Admin không còn ghi thẳng orders/disputes qua API (20261005092200).
export function OrderAdminActions({
  orderId,
  status,
  activeDispute,
  canFlagDispute,
  showDetailLink = true,
}: {
  orderId: string;
  status: string;
  adminUserId?: string;
  activeDispute: ActiveDispute | null;
  canFlagDispute: boolean;
  showDetailLink?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [modal, setModal] = useState<ModalKind>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reporter, setReporter] = useState<Reporter>('buyer');
  const [disputeReason, setDisputeReason] = useState('');

  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [ratio, setRatio] = useState(50);
  const [resolutionNote, setResolutionNote] = useState('');

  const [cancelReason, setCancelReason] = useState('');
  const canCancel = !showDetailLink && status !== 'completed' && status !== 'cancelled';

  function closeAndReset() {
    setModal('none');
    setError(null);
    setBusy(false);
  }

  async function createDispute() {
    if (!disputeReason.trim()) {
      setError('Vui lòng nhập lý do tranh chấp.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('admin_open_dispute', {
      p_order_id: orderId,
      p_reason: disputeReason,
      p_reporter: reporter,
    });
    setBusy(false);
    if (error) {
      setError(adminErrorMessage(error.message, 'Không thể ghi nhận tranh chấp. Vui lòng thử lại.'));
      return;
    }
    closeAndReset();
    router.refresh();
  }

  async function resolveDispute() {
    if (!activeDispute) return;
    if (!resolution) {
      setError('Vui lòng chọn quyết định xử lý.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('admin_resolve_dispute', {
      p_dispute_id: activeDispute.id,
      p_resolution: resolution,
      p_refund_ratio: resolution === 'partial' ? ratio / 100 : null,
      p_note: resolutionNote,
    });
    setBusy(false);
    if (error) {
      setError(adminErrorMessage(error.message, 'Không thể lưu quyết định xử lý. Vui lòng thử lại.'));
      return;
    }
    closeAndReset();
    router.refresh();
  }

  async function cancelOrder() {
    if (!cancelReason.trim()) {
      setError('Vui lòng ghi lý do hủy đơn.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('admin_cancel_order', {
      p_order_id: orderId,
      p_reason: cancelReason,
    });
    setBusy(false);
    if (error) {
      setError(adminErrorMessage(error.message, 'Không thể hủy đơn. Vui lòng thử lại.'));
      return;
    }
    closeAndReset();
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1.5">
        {showDetailLink && (
          <Link
            href={`/admin/orders/${orderId}`}
            className={
              status === 'pending_payment'
                ? 'border-brand-green text-brand-green rounded-md border-[1.5px] bg-white px-3 py-1.5 text-[11.5px] font-semibold whitespace-nowrap hover:bg-[#F0FBF5]'
                : 'border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink rounded-md border-[1.5px] bg-white px-3 py-1.5 text-[11.5px] font-semibold whitespace-nowrap'
            }
          >
            {status === 'pending_payment' ? '💳 Xem & xác nhận TT' : 'Chi tiết'}
          </Link>
        )}
        {activeDispute && (
          <button
            type="button"
            onClick={() => setModal('resolve-dispute')}
            className="border-brand-red text-brand-red rounded-md border-[1.5px] bg-white px-3 py-1.5 text-[11.5px] font-semibold hover:bg-[#FFF0F0]"
          >
            ⚠️ Xử lý
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={() => setModal('cancel')}
            className="border-brand-border text-brand-sub hover:border-brand-red hover:text-brand-red rounded-md border-[1.5px] bg-white px-3 py-1.5 text-[11.5px] font-semibold"
          >
            Hủy đơn
          </button>
        )}
        {canFlagDispute && (
          <button
            type="button"
            onClick={() => setModal('create-dispute')}
            className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink rounded-md border-[1.5px] bg-white px-3 py-1.5 text-[11.5px] font-semibold"
          >
            ⚠️ Báo tranh chấp
          </button>
        )}
      </div>

      {/* CANCEL ORDER */}
      <Modal open={modal === 'cancel'} onClose={busy ? undefined : closeAndReset} maxWidth="420px">
        <ModalTitle>Hủy đơn hàng</ModalTitle>
        <div className="text-brand-sub mb-4 text-[11.5px]">
          Đơn hàng #{orderId.slice(0, 8).toUpperCase()} — không hoàn tác được. Buyer và xưởng sẽ thấy
          lý do này trên trang đơn.
        </div>

        <div className="mb-1">
          <div className="mb-1.5 text-xs font-semibold">Lý do hủy</div>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            placeholder="VD: Buyer không chuyển khoản sau 7 ngày"
            className="border-brand-border focus:border-brand-forest w-full resize-none rounded-lg border-[1.5px] px-3 py-2.5 text-[12.5px] outline-none"
          />
        </div>

        {error && <div className="text-brand-red mt-2 text-[11.5px]">{error}</div>}

        <ModalActions>
          <button
            type="button"
            disabled={busy}
            onClick={closeAndReset}
            className="border-brand-border flex-1 rounded-lg border-[1.5px] py-2.5 text-[13px] font-semibold disabled:opacity-50"
          >
            Để sau
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={cancelOrder}
            className="bg-brand-red flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Đang lưu...' : 'Hủy đơn'}
          </button>
        </ModalActions>
      </Modal>

      {/* CREATE DISPUTE */}
      <Modal
        open={modal === 'create-dispute'}
        onClose={busy ? undefined : closeAndReset}
        maxWidth="420px"
      >
        <ModalTitle>Báo tranh chấp</ModalTitle>
        <div className="text-brand-sub mb-4 text-[11.5px]">
          Đơn hàng #{orderId.slice(0, 8).toUpperCase()} — ghi lại khiếu nại nhận qua điện
          thoại/email
        </div>

        <div className="mb-3.5">
          <div className="mb-1.5 text-xs font-semibold">Bên báo tranh chấp</div>
          <div className="flex gap-2">
            {REPORTERS.map((r) => (
              <label
                key={r.key}
                className={`flex flex-1 items-center gap-2 rounded-lg border-[1.5px] px-3 py-2 text-[12.5px] font-semibold ${
                  reporter === r.key ? 'border-brand-forest bg-[#F0FBF5]' : 'border-brand-border'
                }`}
              >
                <input
                  type="radio"
                  name={`reporter-${orderId}`}
                  checked={reporter === r.key}
                  onChange={() => setReporter(r.key)}
                  className="accent-brand-forest"
                />
                {r.label}
              </label>
            ))}
          </div>
        </div>

        <div className="mb-1">
          <div className="mb-1.5 text-xs font-semibold">Nội dung khiếu nại</div>
          <textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            rows={4}
            placeholder="VD: Hàng nhận được không đúng mô tả — sản phẩm bị sứt mẻ..."
            className="border-brand-border focus:border-brand-forest w-full resize-none rounded-lg border-[1.5px] px-3 py-2.5 text-[12.5px] outline-none"
          />
        </div>

        {error && <div className="text-brand-red mt-2 text-[11.5px]">{error}</div>}

        <ModalActions>
          <button
            type="button"
            disabled={busy}
            onClick={closeAndReset}
            className="border-brand-border flex-1 rounded-lg border-[1.5px] py-2.5 text-[13px] font-semibold disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={createDispute}
            className="bg-brand-red flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Đang lưu...' : '⚠️ Ghi nhận tranh chấp'}
          </button>
        </ModalActions>
      </Modal>

      {/* RESOLVE DISPUTE */}
      <Modal
        open={modal === 'resolve-dispute'}
        onClose={busy ? undefined : closeAndReset}
        maxWidth="440px"
      >
        <ModalTitle>Xử lý tranh chấp</ModalTitle>
        <div className="text-brand-sub mb-4 text-[11.5px]">
          Đơn hàng #{orderId.slice(0, 8).toUpperCase()}
        </div>

        {activeDispute && (
          <div className="mb-4 rounded-lg border border-[#FFD0D0] bg-[#FFF0F0] p-3 text-[12px] text-[#7A2020]">
            <strong className="mb-0.5 block text-[#C62828]">Nội dung khiếu nại:</strong>
            {activeDispute.reason}
          </div>
        )}

        <div className="mb-1.5 text-xs font-semibold">Quyết định xử lý</div>
        <div className="mb-3.5 flex flex-col gap-2">
          {RESOLUTIONS.map((r) => (
            <label
              key={r.key}
              className={`flex items-center gap-2.5 rounded-lg border-[1.5px] px-3 py-2.5 ${
                resolution === r.key ? 'border-brand-forest bg-[#F0FBF5]' : 'border-brand-border'
              }`}
            >
              <input
                type="radio"
                name="resolution"
                checked={resolution === r.key}
                onChange={() => setResolution(r.key)}
                className="accent-brand-forest"
              />
              <span className="text-[12.5px] font-semibold">{r.label}</span>
            </label>
          ))}
        </div>

        {resolution === 'partial' && (
          <div className="mb-3.5 flex items-center gap-2.5">
            <span className="text-brand-sub text-[11.5px]">% hoàn cho buyer</span>
            <input
              type="range"
              min={0}
              max={100}
              value={ratio}
              onChange={(e) => setRatio(Number(e.target.value))}
              className="flex-1"
            />
            <span className="min-w-[42px] text-right text-[13px] font-bold">{ratio}%</span>
          </div>
        )}

        <div className="mb-1">
          <div className="mb-1.5 text-xs font-semibold">Ghi chú giải quyết (gửi cả 2 bên)</div>
          <textarea
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            rows={3}
            placeholder="Giải thích quyết định để buyer và supplier đều hiểu rõ..."
            className="border-brand-border focus:border-brand-forest w-full resize-none rounded-lg border-[1.5px] px-3 py-2.5 text-[12.5px] outline-none"
          />
        </div>

        {error && <div className="text-brand-red mt-2 text-[11.5px]">{error}</div>}

        <ModalActions>
          <button
            type="button"
            disabled={busy}
            onClick={closeAndReset}
            className="border-brand-border flex-1 rounded-lg border-[1.5px] py-2.5 text-[13px] font-semibold disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={resolveDispute}
            className="bg-brand-forest flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Đang lưu...' : '✓ Xác nhận giải quyết'}
          </button>
        </ModalActions>
      </Modal>
    </>
  );
}
