'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Modal, ModalActions, ModalTitle } from '@/components/ui';

const PAYMENT_METHODS = ['Chuyển khoản ngân hàng', 'Ví điện tử', 'Khác'];

const RESOLUTIONS = [
  { key: 'release_supplier', label: 'Trả tiền cho supplier — buyer khiếu nại không có căn cứ' },
  { key: 'refund_buyer', label: 'Hoàn tiền cho buyer — supplier vi phạm mô tả sản phẩm' },
  { key: 'partial', label: 'Chia tỷ lệ — lỗi một phần từ cả hai bên' },
] as const;

type Resolution = (typeof RESOLUTIONS)[number]['key'];
type ModalKind = 'none' | 'confirm' | 'create-dispute' | 'resolve-dispute';

interface ActiveDispute {
  id: string;
  reason: string;
}

// 3 mutation trực tiếp lên orders/disputes — RLS (orders update do app logic
// khác quản lý, ở đây chỉ cột thanh toán mà is_admin() luôn được phép; và
// disputes_insert_admin/disputes_update_admin) đã cho phép admin làm cả 3
// việc này. Trigger trg_handle_dispute_insert/update (xem
// supabase/migrations/20260930090200_disputes.sql) tự gửi notification cho
// buyer + supplier, nên ở đây chỉ cần update/insert đúng cột.
export function OrderAdminActions({
  orderId,
  status,
  adminUserId,
  buyerUserId,
  activeDispute,
  canFlagDispute,
}: {
  orderId: string;
  status: string;
  adminUserId: string;
  buyerUserId: string | null;
  activeDispute: ActiveDispute | null;
  canFlagDispute: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [modal, setModal] = useState<ModalKind>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [reference, setReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const [disputeReason, setDisputeReason] = useState('');

  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [ratio, setRatio] = useState(50);
  const [resolutionNote, setResolutionNote] = useState('');

  function closeAndReset() {
    setModal('none');
    setError(null);
    setBusy(false);
  }

  async function confirmPayment() {
    setBusy(true);
    setError(null);
    const note = [`Phương thức: ${method}`, reference && `Mã GD: ${reference}`, paymentNote]
      .filter(Boolean)
      .join(' · ');
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'confirmed',
        payment_confirmed_by: adminUserId,
        confirmed_at: new Date().toISOString(),
        payment_note: note,
      })
      .eq('id', orderId);
    setBusy(false);
    if (error) {
      setError('Không thể xác nhận thanh toán. Vui lòng thử lại.');
      return;
    }
    closeAndReset();
    router.refresh();
  }

  async function createDispute() {
    if (!disputeReason.trim()) {
      setError('Vui lòng nhập lý do tranh chấp.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('disputes').insert({
      order_id: orderId,
      raised_by: buyerUserId,
      reason: disputeReason.trim(),
    });
    setBusy(false);
    if (error) {
      setError('Không thể ghi nhận tranh chấp. Vui lòng thử lại.');
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
    const { error } = await supabase
      .from('disputes')
      .update({
        status: 'resolved',
        resolution,
        refund_ratio: resolution === 'partial' ? ratio / 100 : null,
        resolution_note: resolutionNote.trim() || null,
        resolved_by: adminUserId,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', activeDispute.id);
    setBusy(false);
    if (error) {
      setError('Không thể lưu quyết định xử lý. Vui lòng thử lại.');
      return;
    }
    closeAndReset();
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1.5">
        {status === 'pending_payment' && (
          <button
            type="button"
            onClick={() => setModal('confirm')}
            className="border-brand-green text-brand-green rounded-md border-[1.5px] bg-white px-3 py-1.5 text-[11.5px] font-semibold hover:bg-[#F0FBF5]"
          >
            ✓ Xác nhận TT
          </button>
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

      {/* CONFIRM PAYMENT */}
      <Modal open={modal === 'confirm'} onClose={busy ? undefined : closeAndReset} maxWidth="420px">
        <ModalTitle>Xác nhận thanh toán thủ công</ModalTitle>
        <div className="text-brand-sub mb-4 text-[11.5px]">
          Đơn hàng #{orderId.slice(0, 8).toUpperCase()}
        </div>

        <div className="mb-3.5">
          <div className="mb-1.5 text-xs font-semibold">Phương thức</div>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="border-brand-border focus:border-brand-forest w-full rounded-lg border-[1.5px] bg-white px-3 py-2.5 text-[12.5px] outline-none"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="mb-3.5">
          <div className="mb-1.5 text-xs font-semibold">Mã giao dịch / tham chiếu</div>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="VD: FT2608120001"
            className="border-brand-border focus:border-brand-forest w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[12.5px] outline-none"
          />
        </div>
        <div className="mb-1">
          <div className="mb-1.5 text-xs font-semibold">Ghi chú nội bộ</div>
          <textarea
            value={paymentNote}
            onChange={(e) => setPaymentNote(e.target.value)}
            rows={2}
            placeholder="Không bắt buộc"
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
            onClick={confirmPayment}
            className="bg-brand-forest flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Đang lưu...' : '✓ Xác nhận đã nhận tiền'}
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
          Đơn hàng #{orderId.slice(0, 8).toUpperCase()} — ghi lại khiếu nại buyer báo qua điện
          thoại/email
        </div>

        <div className="mb-1">
          <div className="mb-1.5 text-xs font-semibold">Lý do buyer báo cáo</div>
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
            <strong className="mb-0.5 block text-[#C62828]">Lý do buyer báo cáo:</strong>
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
