'use client';

import { useEffect, useRef, useState } from 'react';

// Ô mật khẩu có nút Hiện/Ẩn, dùng chung cho đăng nhập, đăng ký, hoàn thiện
// hồ sơ và đặt lại mật khẩu — cùng style với các ô input khác của luồng auth.
//
// `customError`: nếu có, đặt làm setCustomValidity() của <input> để trình
// duyệt chặn submit form (và hiện đúng câu này) cho tới khi hết lỗi — dùng
// bởi PasswordPair để ép "nhập lại mật khẩu" phải khớp.
export default function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  placeholder,
  hint,
  minLength,
  labelRight,
  value,
  onChange,
  customError,
  showError,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  placeholder?: string;
  hint?: string;
  minLength?: number;
  labelRight?: React.ReactNode;
  value?: string;
  onChange?: (value: string) => void;
  customError?: string;
  /** Hiện `customError` ngay dưới ô (không đợi bấm gửi). */
  showError?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.setCustomValidity(customError ?? '');
  }, [customError]);

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
          ref={inputRef}
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          aria-invalid={showError && customError ? true : undefined}
          className={`w-full rounded-lg border-[1.5px] py-2.5 pr-14 pl-3.5 text-[13px] transition-colors outline-none focus:border-[#E53333] ${
            showError && customError ? 'border-[#E53333]' : 'border-[#E0DDD8]'
          }`}
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
      {showError && customError ? (
        <div className="mt-1.5 text-[11px] text-[#E53333]">{customError}</div>
      ) : (
        hint && <div className="mt-1.5 text-[11px] text-[#999]">{hint}</div>
      )}
    </div>
  );
}
