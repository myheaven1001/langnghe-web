'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Modal, ModalActions, ModalTitle } from '@/components/ui';

const SELF_DELIVERY = 'Tự vận chuyển';
const LOGISTICS_PROVIDERS = ['GHTK', 'GHN', 'Viettel Post', SELF_DELIVERY];

// Mã lỗi từ trigger guard_order_update (20261005090300) và
// supplier_respond_order (20261005093400) → câu tiếng Việt.
function orderErrorMessage(message: string, fallback: string): string {
  if (message.includes('ORDER_NOT_PENDING_CONFIRMATION')) {
    return 'Đơn này đã được xử lý trước đó. Vui lòng tải lại trang.';
  }
  if (message.includes('ACCOUNT_SUSPENDED')) return 'Tài khoản của bạn đang bị tạm khóa.';
  if (message.includes('ORDER_TRACKING_REQUIRED')) {
    return 'Vui lòng nhập mã vận đơn (không bắt buộc khi chọn Tự vận chuyển).';
  }
  if (message.includes('FORBIDDEN_ORDER_STATUS_CHANGE')) {
    return 'Đơn hàng đã đổi trạng thái. Vui lòng tải lại trang.';
  }
  return fallback;
}

// Update trực tiếp orders.status — RLS orders_update cho supplier sở hữu đơn
// UPDATE; trigger guard_order_update chỉ cho confirmed → producing → shipped. Trigger trg_handle_order_status_change (xem
// 20260925090000_order_status_change.sql) tự ghi order_events + stamp
// shipped_at, nên ở đây chỉ cần update đúng các cột cần thiết.
export function OrderActions({ orderId, status }: { orderId: string; status: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [provider, setProvider] = useState(LOGISTICS_PROVIDERS[0]);
  const [tracking, setTracking] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  // Đơn đặt thẳng từ giỏ hàng (5.6): xưởng nhận hoặc từ chối qua RPC
  // supplier_respond_order(); từ chối bắt buộc lý do, kho đã trừ được hoàn lại.
  async function respond(accept: boolean) {
    if (!accept && !declineReason.trim()) {
      setError('Vui lòng ghi lý do từ chối.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('supplier_respond_order', {
      p_order_id: orderId,
      p_accept: accept,
      p_reason: accept ? null : declineReason,
    });
    setBusy(false);
    if (error) {
      setError(orderErrorMessage(error.message, 'Không cập nhật được đơn. Vui lòng thử lại.'));
      return;
    }
    setDeclineOpen(false);
    router.refresh();
  }

  async function startProducing() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('orders').update({ status: 'producing' }).eq('id', orderId);
    setBusy(false);
    if (error) {
      setError(orderErrorMessage(error.message, 'Không thể cập nhật trạng thái. Vui lòng thử lại.'));
      return;
    }
    router.refresh();
  }

  async function confirmShip() {
    if (provider !== SELF_DELIVERY && !tracking.trim()) {
      setError('Vui lòng nhập mã vận đơn (không bắt buộc khi chọn Tự vận chuyển).');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'shipped',
        logistics_provider: provider,
        tracking_number: tracking.trim() || null,
      })
      .eq('id', orderId);
    setBusy(false);
    if (error) {
      setError(orderErrorMessage(error.message, 'Không thể cập nhật thông tin giao hàng. Vui lòng thử lại.'));
      return;
    }
    setShipModalOpen(false);
    router.refresh();
  }

  if (status === 'pending_confirmation') {
    return (
      <>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => respond(true)}
            className="bg-brand-green min-h-10 rounded-md px-4 text-[13px] font-semibold whitespace-nowrap text-white hover:bg-[#008a44] disabled:opacity-60"
          >
            ✓ Nhận đơn
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              setDeclineOpen(true);
            }}
            className="border-brand-red text-brand-red min-h-10 rounded-md border-[1.5px] bg-white px-4 text-[13px] font-semibold whitespace-nowrap disabled:opacity-60"
          >
            Từ chối
          </button>
        </div>
        {error && !declineOpen && <div className="text-brand-red mt-1 text-xs">{error}</div>}
        <Modal
          open={declineOpen}
          onClose={busy ? undefined : () => setDeclineOpen(false)}
          maxWidth="400px"
        >
          <ModalTitle>Từ chối đơn hàng</ModalTitle>
          <div className="text-brand-sub mb-4 text-[13px]">
            Đơn #{orderId.slice(0, 8).toUpperCase()} sẽ bị hủy và buyer nhận được lý do này.
          </div>
          <textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="VD: Hết nguyên liệu, không kịp tiến độ..."
            className="border-brand-border focus:border-brand-red w-full resize-none rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
          />
          {error && <div className="text-brand-red mt-2 text-xs">{error}</div>}
          <ModalActions>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeclineOpen(false)}
              className="border-brand-border min-h-10 flex-1 rounded-lg border-[1.5px] text-[13px] font-semibold disabled:opacity-50"
            >
              Để sau
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => respond(false)}
              className="bg-brand-red hover:bg-brand-red-dark min-h-10 flex-1 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Đang lưu...' : 'Từ chối đơn'}
            </button>
          </ModalActions>
        </Modal>
      </>
    );
  }

  if (status === 'confirmed') {
    return (
      <div>
        <button
          type="button"
          disabled={busy}
          onClick={startProducing}
          className="bg-brand-red hover:bg-brand-red-dark rounded-md px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-white disabled:opacity-60"
        >
          🏭 Bắt đầu sản xuất
        </button>
        {error && <div className="text-brand-red mt-1 text-xs">{error}</div>}
      </div>
    );
  }

  if (status === 'producing') {
    return (
      <>
        <button
          type="button"
          onClick={() => setShipModalOpen(true)}
          className="bg-brand-red hover:bg-brand-red-dark rounded-md px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-white"
        >
          🚚 Nhập thông tin giao hàng
        </button>
        <Modal open={shipModalOpen} onClose={busy ? undefined : () => setShipModalOpen(false)} maxWidth="400px">
          <ModalTitle>Nhập thông tin giao hàng</ModalTitle>
          <div className="text-brand-sub mb-4 text-xs">Đơn hàng #{orderId.slice(0, 8).toUpperCase()}</div>

          <div className="mb-3.5">
            <div className="mb-1.5 text-xs font-semibold">Đơn vị vận chuyển</div>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] bg-white px-3 py-2.5 text-[13px] outline-none"
            >
              {LOGISTICS_PROVIDERS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="mb-1">
            <div className="mb-1.5 text-xs font-semibold">
              Mã vận đơn{provider !== SELF_DELIVERY && <span className="text-brand-red"> *</span>}
            </div>
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="VD: GHTK123456789"
              className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
            />
          </div>

          {error && <div className="text-brand-red mt-2 text-xs">{error}</div>}

          <ModalActions>
            <button
              type="button"
              disabled={busy}
              onClick={() => setShipModalOpen(false)}
              className="border-brand-border flex-1 rounded-lg border-[1.5px] py-2.5 text-[13px] font-semibold disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={confirmShip}
              className="bg-brand-red hover:bg-brand-red-dark flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Đang lưu...' : '✓ Xác nhận đã gửi hàng'}
            </button>
          </ModalActions>
        </Modal>
      </>
    );
  }

  return null;
}
