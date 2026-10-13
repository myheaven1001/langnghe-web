'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export interface PaymentAccount {
  bank_name: string;
  account_number: string;
  account_holder: string;
  branch: string;
  note: string;
}

export interface SupportContact {
  phone: string;
  zalo: string;
  email: string;
  hours: string;
}

type SectionKey =
  | 'payment_account'
  | 'order_auto_complete_days'
  | 'order_confirmation_days'
  | 'commission_percent'
  | 'support_contact';

const INPUT =
  'border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2 text-[13px] outline-none';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold">{label}</span>
      {children}
      {hint && <span className="text-brand-sub mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

// Năm khối cài đặt, mỗi khối lưu riêng qua RPC admin_set_setting(key, value)
// — hàm tự kiểm tra quyền admin, giá trị hợp lệ và ghi admin_audit_log.
export function SettingsForm({
  payment: initialPayment,
  autoCompleteDays: initialDays,
  confirmationDays: initialConfirmationDays,
  commissionPercent: initialCommission,
  support: initialSupport,
}: {
  payment: PaymentAccount;
  autoCompleteDays: number;
  confirmationDays: number;
  commissionPercent: number;
  support: SupportContact;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [payment, setPayment] = useState(initialPayment);
  const [days, setDays] = useState(String(initialDays));
  const [confirmationDays, setConfirmationDays] = useState(String(initialConfirmationDays));
  const [commission, setCommission] = useState(String(initialCommission));
  const [support, setSupport] = useState(initialSupport);
  const [saving, setSaving] = useState<SectionKey | null>(null);
  const [result, setResult] = useState<{ key: SectionKey; ok: boolean; message: string } | null>(
    null,
  );

  async function save(key: SectionKey, value: unknown) {
    setSaving(key);
    setResult(null);
    const { error } = await supabase.rpc('admin_set_setting', { p_key: key, p_value: value });
    setSaving(null);
    if (error) {
      // INVALID_SETTING kèm lý do tiếng Việt trong error.details.
      const message = error.message.includes('INVALID_SETTING')
        ? error.details || 'Giá trị không hợp lệ.'
        : error.message.includes('FORBIDDEN_NOT_ADMIN')
          ? 'Chỉ quản trị viên được sửa cài đặt.'
          : 'Không lưu được. Vui lòng thử lại.';
      setResult({ key, ok: false, message });
      return;
    }
    setResult({ key, ok: true, message: 'Đã lưu.' });
    router.refresh();
  }

  const footer = (key: SectionKey, onSave: () => void) => (
    <div className="mt-3.5 flex items-center gap-3">
      <button
        type="button"
        disabled={saving !== null}
        onClick={onSave}
        className="bg-brand-red hover:bg-brand-red-dark rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
      >
        {saving === key ? 'Đang lưu...' : 'Lưu'}
      </button>
      {result?.key === key && (
        <span className={`text-xs ${result.ok ? 'text-brand-green' : 'text-brand-red'}`}>
          {result.message}
        </span>
      )}
    </div>
  );

  return (
    <>
      <section className="border-brand-border mb-4 rounded-[10px] border bg-white p-[18px]">
        <h2 className="mb-1 text-sm font-bold">🏦 Tài khoản nhận tiền của sàn</h2>
        <p className="text-brand-sub mb-3.5 text-xs">
          Hiện cho buyer ở trang đơn hàng để chuyển khoản. Kiểm tra kỹ trước khi lưu.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Ngân hàng *">
            <input
              className={INPUT}
              value={payment.bank_name}
              onChange={(e) => setPayment({ ...payment, bank_name: e.target.value })}
              placeholder="VD: Vietcombank"
            />
          </Field>
          <Field label="Số tài khoản *" hint="6–30 chữ số.">
            <input
              className={INPUT}
              inputMode="numeric"
              value={payment.account_number}
              onChange={(e) => setPayment({ ...payment, account_number: e.target.value })}
            />
          </Field>
          <Field label="Chủ tài khoản *">
            <input
              className={INPUT}
              value={payment.account_holder}
              onChange={(e) => setPayment({ ...payment, account_holder: e.target.value })}
            />
          </Field>
          <Field label="Chi nhánh">
            <input
              className={INPUT}
              value={payment.branch}
              onChange={(e) => setPayment({ ...payment, branch: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Ghi chú cho buyer" hint='VD: "Nội dung chuyển khoản ghi mã đơn hàng".'>
              <input
                className={INPUT}
                value={payment.note}
                onChange={(e) => setPayment({ ...payment, note: e.target.value })}
              />
            </Field>
          </div>
        </div>
        {footer('payment_account', () => save('payment_account', payment))}
      </section>

      <section className="border-brand-border mb-4 rounded-[10px] border bg-white p-[18px]">
        <h2 className="mb-1 text-sm font-bold">⏱️ Tự hoàn tất đơn</h2>
        <p className="text-brand-sub mb-3.5 text-xs">
          Đơn ở trạng thái &quot;đã nhận hàng&quot; quá số ngày này sẽ tự chuyển sang &quot;hoàn
          tất&quot;.
        </p>
        <div className="max-w-[180px]">
          <Field label="Số ngày (1–60)">
            <input
              className={INPUT}
              type="number"
              min={1}
              max={60}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </Field>
        </div>
        {footer('order_auto_complete_days', () => save('order_auto_complete_days', Number(days)))}
      </section>

      <section className="border-brand-border mb-4 rounded-[10px] border bg-white p-[18px]">
        <h2 className="mb-1 text-sm font-bold">⏳ Hạn xưởng xác nhận đơn</h2>
        <p className="text-brand-sub mb-3.5 text-xs">
          Đơn đặt thẳng từ giỏ hàng mà xưởng không nhận / từ chối trong số ngày này sẽ tự huỷ, kho
          đã giữ được trả lại.
        </p>
        <div className="max-w-[180px]">
          <Field label="Số ngày (1–14)">
            <input
              className={INPUT}
              type="number"
              min={1}
              max={14}
              value={confirmationDays}
              onChange={(e) => setConfirmationDays(e.target.value)}
            />
          </Field>
        </div>
        {footer('order_confirmation_days', () =>
          save('order_confirmation_days', Number(confirmationDays)),
        )}
      </section>

      <section className="border-brand-border mb-4 rounded-[10px] border bg-white p-[18px]">
        <h2 className="mb-1 text-sm font-bold">💵 Phí sàn</h2>
        <p className="text-brand-sub mb-3.5 text-xs">
          Phần trăm sàn giữ lại khi trả tiền cho xưởng lúc đơn hoàn tất (tính trên tiền thu trừ tiền
          đã hoàn buyer). 0 = không thu phí. Chỉ áp cho đơn hoàn tất sau khi đổi; xưởng thấy mức phí
          này ở trang Tài chính.
        </p>
        <div className="max-w-[180px]">
          <Field label="Phí (0–30%)">
            <input
              className={INPUT}
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
            />
          </Field>
        </div>
        {footer('commission_percent', () => save('commission_percent', Number(commission)))}
      </section>

      <section className="border-brand-border mb-4 rounded-[10px] border bg-white p-[18px]">
        <h2 className="mb-1 text-sm font-bold">☎️ Kênh hỗ trợ</h2>
        <p className="text-brand-sub mb-3.5 text-xs">
          Hiện công khai cho người dùng khi cần liên hệ sàn.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Điện thoại">
            <input
              className={INPUT}
              value={support.phone}
              onChange={(e) => setSupport({ ...support, phone: e.target.value })}
            />
          </Field>
          <Field label="Zalo">
            <input
              className={INPUT}
              value={support.zalo}
              onChange={(e) => setSupport({ ...support, zalo: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              className={INPUT}
              type="email"
              value={support.email}
              onChange={(e) => setSupport({ ...support, email: e.target.value })}
            />
          </Field>
          <Field label="Giờ hỗ trợ">
            <input
              className={INPUT}
              value={support.hours}
              onChange={(e) => setSupport({ ...support, hours: e.target.value })}
              placeholder="VD: 8:00–17:30, thứ 2–thứ 7"
            />
          </Field>
        </div>
        {footer('support_contact', () => save('support_contact', support))}
      </section>
    </>
  );
}
