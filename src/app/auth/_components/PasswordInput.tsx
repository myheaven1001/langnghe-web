'use client';

import { useState } from 'react';

// Ô mật khẩu có nút Hiện/Ẩn, dùng chung cho đăng nhập, hoàn thiện hồ sơ và
// đặt lại mật khẩu — cùng style với các ô input khác của luồng auth.
export default function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  placeholder,
  hint,
  minLength,
  labelRight,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  placeholder?: string;
  hint?: string;
  minLength?: number;
  labelRight?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={id} className="block text-xs font-semibold">
          {label}
        </label>
        {labelRight}
      </div>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="w-full rounded-lg border-[1.5px] border-[#E0DDD8] py-2.5 pr-14 pl-3.5 text-[13px] transition-colors outline-none focus:border-[#E53333]"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          className="absolute inset-y-0 right-0 px-3.5 text-[11px] font-semibold text-[#666] hover:text-[#E53333]"
        >
          {visible ? 'Ẩn' : 'Hiện'}
        </button>
      </div>
      {hint && <div className="mt-1.5 text-[11px] text-[#999]">{hint}</div>}
    </div>
  );
}
