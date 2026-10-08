'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Modal, ModalActions, ModalTitle } from '@/components/ui';
import { adminErrorMessage } from '../../_lib/errors';

// Khoá / mở khoá qua RPC admin_set_user_status() (kế hoạch 3.6): hàm kiểm tra
// quyền, bắt buộc lý do khi khoá, gửi thông báo account_suspended và ghi
// admin_audit_log.
export function UserAdminActions({
  userId,
  status,
  name,
}: {
  userId: string;
  status: string;
  name: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmSuspend() {
    if (!reason.trim()) {
      setError('Vui lòng ghi lý do khóa.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('admin_set_user_status', {
      p_user_id: userId,
      p_status: 'suspended',
      p_reason: reason,
    });
    setBusy(false);
    if (rpcError) {
      setError(adminErrorMessage(rpcError.message, 'Không thể khóa tài khoản. Vui lòng thử lại.'));
      return;
    }
    setSuspendOpen(false);
    setReason('');
    router.refresh();
  }

  async function unsuspend() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('admin_set_user_status', {
      p_user_id: userId,
      p_status: 'active',
    });
    setBusy(false);
    if (error) {
      setError(adminErrorMessage(error.message, 'Không thể mở khóa. Vui lòng thử lại.'));
      return;
    }
    router.refresh();
  }

  if (status === 'suspended') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={unsuspend}
        className="border-brand-green text-brand-green rounded-md border-[1.5px] bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
      >
        {busy ? 'Đang xử lý...' : 'Mở khóa'}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setSuspendOpen(true)}
        className="border-brand-red text-brand-red rounded-md border-[1.5px] bg-white px-3 py-1.5 text-xs font-semibold hover:bg-[#FFF0F0]"
      >
        Khóa
      </button>

      <Modal
        open={suspendOpen}
        onClose={busy ? undefined : () => setSuspendOpen(false)}
        maxWidth="420px"
      >
        <ModalTitle>Tạm khóa tài khoản</ModalTitle>
        <div className="text-brand-sub mb-4 text-xs">Người dùng: {name}</div>

        <div className="mb-1">
          <div className="mb-1.5 text-xs font-semibold">Lý do khóa</div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="VD: Vi phạm điều khoản dịch vụ, gian lận đơn hàng..."
            className="border-brand-border focus:border-brand-red w-full resize-none rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
          />
        </div>

        {error && <div className="text-brand-red mt-2 text-xs">{error}</div>}

        <ModalActions>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSuspendOpen(false)}
            className="border-brand-border flex-1 rounded-lg border-[1.5px] py-2.5 text-[13px] font-semibold disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={confirmSuspend}
            className="bg-brand-red flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Đang lưu...' : '🔒 Xác nhận khóa'}
          </button>
        </ModalActions>
      </Modal>
    </>
  );
}
