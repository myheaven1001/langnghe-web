'use client';

import { useFormStatus } from 'react-dom';
import { sendLoginOtp } from '@/app/auth/actions';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mb-4 w-full rounded-lg bg-[#E53333] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c62828] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? '⏳ Đang gửi mã...' : 'Gửi mã xác minh'}
    </button>
  );
}

// Không còn password/role tabs — Supabase Auth dùng email OTP 6 số (xem
// src/app/auth/actions.ts và src/app/verify-email). Role chỉ cần chọn lúc
// ĐĂNG KÝ (/register), vì role của user đã có sẵn trong public.users khi
// họ quay lại đăng nhập.
export default function LoginForm({ message, type }: { message?: string; type?: string }) {
  const isError = type !== 'success' && !!message;

  return (
    <form action={sendLoginOtp} className="flex flex-col">
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
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="ban@shopname.com"
          className="w-full rounded-lg border-[1.5px] border-[#E0DDD8] px-3.5 py-2.5 text-[13px] transition-colors outline-none focus:border-[#E53333]"
        />
        <div className="mt-1.5 text-[11px] text-[#999]">
          Chúng tôi sẽ gửi mã xác minh 6 số đến email này — không cần mật khẩu.
        </div>
      </div>

      <SubmitButton />

      <div className="mb-3.5 flex items-center gap-2.5 text-[11px] text-[#999] before:h-px before:flex-1 before:bg-[#E0DDD8] before:content-[''] after:h-px after:flex-1 after:bg-[#E0DDD8] after:content-['']">
        Hoặc đăng nhập bằng
      </div>
      <div className="flex gap-2">
        {[
          { icon: '🔵', label: 'Google' },
          { icon: '🔷', label: 'Facebook' },
          { icon: '📱', label: 'Zalo' },
        ].map((p) => (
          <button
            key={p.label}
            type="button"
            disabled
            title="Chưa hỗ trợ — chỉ hiển thị demo giao diện"
            className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-[#E0DDD8] py-2.5 text-xs font-medium text-[#1F1F1F] opacity-60"
          >
            {p.icon} {p.label}
          </button>
        ))}
      </div>
    </form>
  );
}
