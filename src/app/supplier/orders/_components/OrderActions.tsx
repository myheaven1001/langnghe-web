'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Modal, ModalActions, ModalTitle } from '@/components/ui';

const LOGISTICS_PROVIDERS = ['GHTK', 'GHN', 'Viettel Post', 'Tự vận chuyển'];

// Update trực tiếp orders.status — RLS orders_update đã cho phép supplier
// sở hữu đơn tự đổi status. Trigger trg_handle_order_status_change (xem
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

  async function startProducing() {
    setBusy(true);
    const { error } = await supabase.from('orders').update({ status: 'producing' }).eq('id', orderId);
    setBusy(false);
    if (!error) router.refresh();
  }

  async function confirmShip() {
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
      setError('Không thể cập nhật thông tin giao hàng. Vui lòng thử lại.');
      return;
    }
    setShipModalOpen(false);
    router.refresh();
  }

  if (status === 'confirmed') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={startProducing}
        className="bg-brand-red hover:bg-brand-red-dark rounded-md px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-white disabled:opacity-60"
      >
        🏭 Bắt đầu sản xuất
      </button>
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
          <div className="text-brand-sub mb-4 text-[11.5px]">Đơn hàng #{orderId.slice(0, 8).toUpperCase()}</div>

          <div className="mb-3.5">
            <div className="mb-1.5 text-xs font-semibold">Đơn vị vận chuyển</div>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] bg-white px-3 py-2.5 text-[12.5px] outline-none"
            >
              {LOGISTICS_PROVIDERS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="mb-1">
            <div className="mb-1.5 text-xs font-semibold">Mã vận đơn</div>
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="VD: GHTK123456789"
              className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[12.5px] outline-none"
            />
          </div>

          {error && <div className="text-brand-red mt-2 text-[11.5px]">{error}</div>}

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
