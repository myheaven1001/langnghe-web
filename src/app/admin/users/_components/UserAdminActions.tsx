'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Modal, ModalActions, ModalTitle } from '@/components/ui';

// Update trực tiếp users.status — RLS users_update_own đã cho phép admin
// (is_admin()) sửa mọi dòng. Khóa còn insert kèm 1 notification
// 'account_suspended' (type đã có sẵn từ enum gốc, chưa nơi nào emit) để
// user biết lý do — mở khóa thì không có type notification tương ứng
// trong enum nên không gửi gì thêm, chỉ đổi status.
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
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('users')
      .update({ status: 'suspended' })
      .eq('id', userId);
    if (updateError) {
      setBusy(false);
      setError('Không thể khóa tài khoản. Vui lòng thử lại.');
      return;
    }
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'account_suspended',
      title: 'Tài khoản của bạn đã bị tạm khóa',
      body: reason.trim() || 'Vui lòng liên hệ hỗ trợ để biết thêm chi tiết.',
      channel: 'in_app',
      status: 'sent',
      sent_at: new Date().toISOString(),
    });
    setBusy(false);
    setSuspendOpen(false);
    setReason('');
    router.refresh();
  }

  async function unsuspend() {
    setBusy(true);
    const { error } = await supabase.from('users').update({ status: 'active' }).eq('id', userId);
    setBusy(false);
    if (!error) router.refresh();
  }

  if (status === 'suspended') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={unsuspend}
        className="border-brand-green text-brand-green rounded-md border-[1.5px] bg-white px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-60"
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
        className="border-brand-red text-brand-red rounded-md border-[1.5px] bg-white px-3 py-1.5 text-[11.5px] font-semibold hover:bg-[#FFF0F0]"
      >
        Khóa
      </button>

      <Modal
        open={suspendOpen}
        onClose={busy ? undefined : () => setSuspendOpen(false)}
        maxWidth="420px"
      >
        <ModalTitle>Tạm khóa tài khoản</ModalTitle>
        <div className="text-brand-sub mb-4 text-[11.5px]">Người dùng: {name}</div>

        <div className="mb-1">
          <div className="mb-1.5 text-xs font-semibold">Lý do khóa</div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="VD: Vi phạm điều khoản dịch vụ, gian lận đơn hàng..."
            className="border-brand-border focus:border-brand-red w-full resize-none rounded-lg border-[1.5px] px-3 py-2.5 text-[12.5px] outline-none"
          />
        </div>

        {error && <div className="text-brand-red mt-2 text-[11.5px]">{error}</div>}

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
