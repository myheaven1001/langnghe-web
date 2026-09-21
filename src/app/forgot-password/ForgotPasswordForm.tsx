'use client';

import { useFormStatus } from 'react-dom';
import { sendResetOtp } from '@/app/auth/actions';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mb-1.5 w-full rounded-lg bg-[#E53333] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c62828] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? '⏳ Đang gửi mã...' : 'Gửi mã xác minh →'}
    </button>
  );
}

// Gửi OTP tới email → /verify-email (mode=reset) → /reset-password để đặt
// mật khẩu mới. Cũng là đường để tài khoản cũ (đăng ký bằng OTP, chưa có mật
// khẩu) đặt mật khẩu lần đầu.
export default function ForgotPasswordForm({ message, type }: { message?: string; type?: string }) {
  const isError = type !== 'success' && !!message;

  return (
    <form action={sendResetOtp} className="flex flex-col">
      {message && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
            isError
              ? 'border-[#FFCDD2] bg-[#FFF0F0] text-[#C62828]'
              : 'border-[#B7E4C7] bg-[#F0FFF4] text-[#1A7A3E]'
          }`}
        >
          <span>{isError ? '❌' : '✅'}</span>
          <span>{message}</span>
        </div>
      )}

      <div className="mb-5">
        <label htmlFor="email" className="mb-1.5 block text-xs font-semibold">
          Email đăng ký
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="lan@shopname.com"
          className="w-full rounded-lg border-[1.5px] border-[#E0DDD8] px-3.5 py-2.5 text-[13px] transition-colors outline-none focus:border-[#E53333]"
        />
        <div className="mt-1.5 text-[11px] text-[#999]">
          Kiểm tra cả thư mục Spam nếu không thấy email.
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}
