'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, Input } from '@/components/ui';

// Đổi mật khẩu và email đăng nhập (kế hoạch 4.9). Dùng chung cho
// /settings/account (buyer) và /supplier/settings/account (nhà bán).
//   - Mật khẩu: xác nhận lại mật khẩu hiện tại (đăng nhập lại bằng email +
//     mật khẩu cũ) rồi mới đổi — người mượn máy đang mở sẵn phiên không tự
//     đổi được.
//   - Email: Supabase gửi thư xác nhận tới email mới; email đăng nhập chỉ đổi
//     sau khi bấm link trong thư.
export function AccountSecurity({ email }: { email: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordResult, setPasswordResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailResult, setEmailResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordResult(null);
    if (newPassword.length < 8) {
      setPasswordResult({ ok: false, message: 'Mật khẩu mới cần ít nhất 8 ký tự.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordResult({ ok: false, message: 'Hai lần nhập mật khẩu mới không khớp.' });
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordResult({ ok: false, message: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
      return;
    }

    setPasswordBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (signInError) {
      setPasswordBusy(false);
      setPasswordResult({ ok: false, message: 'Mật khẩu hiện tại không đúng.' });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordBusy(false);
    if (error) {
      setPasswordResult({
        ok: false,
        message: /weak|least|short/i.test(error.message)
          ? 'Mật khẩu mới quá yếu. Hãy dùng mật khẩu dài hơn, có cả chữ và số.'
          : 'Không đổi được mật khẩu. Vui lòng thử lại.',
      });
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordResult({ ok: true, message: 'Đã đổi mật khẩu.' });
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailResult(null);
    const target = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setEmailResult({ ok: false, message: 'Email không hợp lệ.' });
      return;
    }
    if (target === email.toLowerCase()) {
      setEmailResult({ ok: false, message: 'Đây đang là email đăng nhập của bạn.' });
      return;
    }

    setEmailBusy(true);
    const { error } = await supabase.auth.updateUser({ email: target });
    setEmailBusy(false);
    if (error) {
      setEmailResult({
        ok: false,
        message: /registered|already|exists/i.test(error.message)
          ? 'Email này đã được dùng cho tài khoản khác.'
          : /rate|limit/i.test(error.message)
            ? 'Bạn vừa yêu cầu đổi email. Vui lòng chờ ít phút rồi thử lại.'
            : 'Không gửi được yêu cầu đổi email. Vui lòng thử lại.',
      });
      return;
    }
    setNewEmail('');
    setEmailResult({
      ok: true,
      message: `Đã gửi thư xác nhận tới ${target}. Email đăng nhập chỉ đổi sau khi bạn bấm link trong thư.`,
    });
  }

  const sectionClass = 'border-brand-border rounded-[10px] border bg-white p-4 sm:p-5';

  return (
    <div className="flex max-w-[560px] flex-col gap-4">
      <form onSubmit={changePassword} className={sectionClass}>
        <h2 className="mb-3 text-[15px] font-bold">🔑 Đổi mật khẩu</h2>
        <div className="flex flex-col gap-3">
          <Field label="Mật khẩu hiện tại" required>
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Mật khẩu mới" required hint="Ít nhất 8 ký tự.">
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          <Field label="Nhập lại mật khẩu mới" required>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </Field>
        </div>
        {passwordResult && (
          <div
            role="status"
            className={`mt-3 text-[13px] ${passwordResult.ok ? 'text-status-green font-semibold' : 'text-brand-red'}`}
          >
            {passwordResult.message}
          </div>
        )}
        <Button type="submit" disabled={passwordBusy} className="mt-4">
          {passwordBusy ? 'Đang đổi...' : 'Đổi mật khẩu'}
        </Button>
      </form>

      <form onSubmit={changeEmail} className={sectionClass}>
        <h2 className="mb-1 text-[15px] font-bold">✉️ Email đăng nhập</h2>
        <div className="text-brand-sub mb-3 text-[13px] break-words">
          Hiện tại: <strong className="text-brand-ink">{email}</strong>
        </div>
        <Field
          label="Email mới"
          required
          hint="Chúng tôi gửi thư xác nhận tới email mới. Trước khi bạn bấm link trong thư, bạn vẫn đăng nhập bằng email cũ."
        >
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
          />
        </Field>
        {emailResult && (
          <div
            role="status"
            className={`mt-3 text-[13px] ${emailResult.ok ? 'text-status-green font-semibold' : 'text-brand-red'}`}
          >
            {emailResult.message}
          </div>
        )}
        <Button type="submit" disabled={emailBusy} className="mt-4">
          {emailBusy ? 'Đang gửi...' : 'Gửi thư xác nhận'}
        </Button>
      </form>
    </div>
  );
}
