'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Button,
  Field,
  Input,
  Modal,
  ModalActions,
  ModalSub,
  ModalTitle,
  Textarea,
} from '@/components/ui';
import { DISPUTE_BASE, disputeErrorMessage } from '@/lib/disputes';
import { formatVnd } from '@/lib/format';

// Buyer / xưởng mở tranh chấp cho đơn của mình (RPC open_dispute). Mở xong
// chuyển sang trang tranh chấp để gửi ảnh / trao đổi tiếp.
export function OpenDisputeButton({
  orderId,
  viewer,
}: {
  orderId: string;
  viewer: 'buyer' | 'supplier';
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (reason.trim().length < 10) {
      setError('Mô tả vấn đề ít nhất 10 ký tự.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('open_dispute', {
      p_order_id: orderId,
      p_reason: reason,
    });
    if (error || !data) {
      setBusy(false);
      setError(
        disputeErrorMessage(error?.message ?? '', 'Không mở được tranh chấp. Vui lòng thử lại.'),
      );
      return;
    }
    router.push(`${DISPUTE_BASE[viewer]}/${data as string}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="text-brand-red min-h-10 text-[13px] font-semibold hover:underline"
      >
        ⚠️ Báo vấn đề / mở tranh chấp
      </button>
      <Modal open={open} onClose={busy ? undefined : () => setOpen(false)} maxWidth="440px">
        <ModalTitle>Mở tranh chấp</ModalTitle>
        <ModalSub>
          Sàn sẽ xem xét và làm việc với cả hai bên. Trong lúc tranh chấp, đơn tạm dừng chuyển bước.
          Bạn gửi được ảnh và chứng từ ở bước sau.
        </ModalSub>
        <Field label="Vấn đề gặp phải *" hint={`${reason.trim().length}/1000 ký tự, tối thiểu 10.`}>
          <Textarea
            rows={4}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              viewer === 'buyer'
                ? 'VD: Nhận 100 cái, 20 cái sứt mẻ, sai màu so với mẫu đã chốt'
                : 'VD: Buyer báo thiếu hàng nhưng biên bản giao nhận đã ký đủ'
            }
          />
        </Field>
        {error && <div className="text-brand-red mt-2 text-left text-xs">{error}</div>}
        <ModalActions>
          <Button
            variant="secondary"
            disabled={busy}
            className="flex-1"
            onClick={() => setOpen(false)}
          >
            Để sau
          </Button>
          <Button variant="danger" disabled={busy} className="flex-1" onClick={submit}>
            {busy ? 'Đang gửi...' : 'Mở tranh chấp'}
          </Button>
        </ModalActions>
      </Modal>
    </>
  );
}

// Admin đánh dấu đã chuyển khoản hoàn tiền (RPC admin_mark_refund_paid) —
// việc chuyển tiền thực hiện ngoài hệ thống, ở đây chỉ ghi lại mã giao dịch.
export function RefundPaidButton({ refundId, amount }: { refundId: string; amount: number }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bankRef, setBankRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!bankRef.trim()) {
      setError('Nhập mã giao dịch chuyển khoản.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('admin_mark_refund_paid', {
      p_refund_id: refundId,
      p_bank_ref: bankRef,
    });
    setBusy(false);
    if (error) {
      setError(disputeErrorMessage(error.message, 'Không lưu được. Vui lòng thử lại.'));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="forest" onClick={() => setOpen(true)}>
        Đã chuyển khoản
      </Button>
      <Modal open={open} onClose={busy ? undefined : () => setOpen(false)} maxWidth="400px">
        <ModalTitle>Xác nhận đã hoàn {formatVnd(amount)}</ModalTitle>
        <ModalSub>
          Chỉ bấm sau khi đã chuyển khoản cho buyer. Buyer sẽ nhận thông báo kèm mã giao dịch; thao
          tác này không hoàn lại được.
        </ModalSub>
        <Field label="Mã giao dịch ngân hàng *">
          <Input value={bankRef} maxLength={100} onChange={(e) => setBankRef(e.target.value)} />
        </Field>
        {error && <div className="text-brand-red mt-2 text-left text-xs">{error}</div>}
        <ModalActions>
          <Button
            variant="secondary"
            disabled={busy}
            className="flex-1"
            onClick={() => setOpen(false)}
          >
            Để sau
          </Button>
          <Button variant="forest" disabled={busy} className="flex-1" onClick={submit}>
            {busy ? 'Đang lưu...' : 'Xác nhận'}
          </Button>
        </ModalActions>
      </Modal>
    </>
  );
}
