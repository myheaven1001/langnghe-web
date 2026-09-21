'use client';

import { useState } from 'react';
import PasswordInput from './PasswordInput';

// Cặp "Mật khẩu" + "Nhập lại mật khẩu": báo lỗi ngay khi gõ và chặn submit
// (qua setCustomValidity) cho tới khi hai ô khớp nhau. Server vẫn kiểm tra lại
// trong validatePassword() (auth/actions.ts) — đây chỉ là lớp UX phía trước.
export default function PasswordPair({
  passwordLabel = 'Mật khẩu *',
  confirmLabel = 'Nhập lại mật khẩu *',
  hint = 'Ít nhất 8 ký tự.',
}: {
  passwordLabel?: string;
  confirmLabel?: string;
  hint?: string;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const mismatch = confirm !== password ? 'Mật khẩu nhập lại không khớp.' : undefined;

  return (
    <>
      <PasswordInput
        id="password"
        name="password"
        label={passwordLabel}
        autoComplete="new-password"
        minLength={8}
        hint={hint}
        value={password}
        onChange={setPassword}
      />
      <PasswordInput
        id="confirmPassword"
        name="confirmPassword"
        label={confirmLabel}
        autoComplete="new-password"
        minLength={8}
        value={confirm}
        onChange={setConfirm}
        customError={mismatch}
        showError={confirm.length > 0}
      />
    </>
  );
}
