'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, Input, Modal, ModalActions, ModalSub, ModalTitle } from '@/components/ui';
import { formatVnd } from '@/lib/format';

export interface PayoutAccount {
  bank_name: string;
  account_number: string;
  account_holder: string;
  branch: string | null;
}

// Xưởng khai / sửa tài khoản ngân hàng nhận tiền từ sàn (RPC set_payout_account).
export function PayoutAccountForm({ account }: { account: PayoutAccount | null }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [bankName, setBankName] = useState(account?.bank_name ?? '');
  const [accountNumber, setAccountNumber] = useState(account?.account_number ?? '');
  const [accountHolder, setAccountHolder] = useState(account?.account_holder ?? '');
  const [branch, setBranch] = useState(account?.branch ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc('set_payout_account', {
      p_bank_name: bankName,
      p_account_number: accountNumber,
      p_account_holder: accountHolder,
      p_branch: branch || null,
    });
    setBusy(false);
    if (error) {
      setMessage({
        ok: false,
        text: error.message.includes('INVALID_ACCOUNT')
          ? 'Cần tên ngân hàng, chủ tài khoản và số tài khoản 6–30 chữ số.'
          : error.message.includes('ACCOUNT_SUSPENDED')
            ? 'Tài khoản của bạn đang bị tạm khóa.'
            : 'Không lưu được. Vui lòng thử lại.',
      });
      return;
    }
    setMessage({ ok: true, text: 'Đã lưu.' });
    router.refresh();
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Ngân hàng" required>
          <Input
            value={bankName}
            maxLength={100}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="VD: Vietcombank"
          />
        </Field>
        <Field label="Số tài khoản" required hint="6–30 chữ số.">
          <Input
            value={accountNumber}
            inputMode="numeric"
            maxLength={40}
            onChange={(e) => setAccountNumber(e.target.value)}
          />
        </Field>
        <Field label="Chủ tài khoản" required hint="Đúng như tên in trên tài khoản.">
          <Input
            value={accountHolder}
            maxLength={100}
            onChange={(e) => setAccountHolder(e.target.value)}
          />
        </Field>
        <Field label="Chi nhánh">
          <Input value={branch} maxLength={100} onChange={(e) => setBranch(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={busy} onClick={save}>
          {busy ? 'Đang lưu...' : 'Lưu tài khoản'}
        </Button>
        {message && (
          <span className={`text-xs ${message.ok ? 'text-brand-green' : 'text-brand-red'}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

// Admin đánh dấu đã chuyển tiền cho xưởng (RPC admin_mark_payout_paid) — việc
// chuyển khoản thực hiện ngoài hệ thống, ở đây ghi lại mã giao dịch.
export function PayoutPaidButton({
  payoutId,
  amount,
  supplierName,
  hasAccount,
}: {
  payoutId: string;
  amount: number;
  supplierName: string;
  hasAccount: boolean;
}) {
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
    const { error } = await supabase.rpc('admin_mark_payout_paid', {
      p_payout_id: payoutId,
      p_bank_ref: bankRef,
    });
    setBusy(false);
    if (error) {
      setError(
        error.message.includes('PAYOUT_ALREADY_PAID')
          ? 'Khoản này đã được đánh dấu trước đó. Tải lại trang.'
          : 'Không lưu được. Vui lòng thử lại.',
      );
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
        <ModalTitle>Xác nhận đã chuyển {formatVnd(amount)}</ModalTitle>
        <ModalSub>
          Chỉ bấm sau khi đã chuyển khoản cho {supplierName}. Xưởng sẽ nhận thông báo kèm mã giao
          dịch; thao tác này không hoàn lại được.
          {!hasAccount && ' Lưu ý: xưởng này chưa khai tài khoản nhận tiền trên sàn.'}
        </ModalSub>
        <Field label="Mã giao dịch ngân hàng" required>
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
