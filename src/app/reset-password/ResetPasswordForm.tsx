'use client';

import { useFormStatus } from 'react-dom';
import { resetPassword } from '@/app/auth/actions';
import PasswordPair from '@/app/auth/_components/PasswordPair';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-[#E53333] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c62828] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? '⏳ Đang lưu...' : 'Lưu mật khẩu mới'}
    </button>
  );
}

export default function ResetPasswordForm({ message, type }: { message?: string; type?: string }) {
  const isError = type !== 'success' && !!message;

  return (
    <form action={resetPassword} className="flex flex-col gap-4">
      {message && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
            isError
              ? 'border-[#FFCDD2] bg-[#FFF0F0] text-[#C62828]'
              : 'border-[#B7E4C7] bg-[#F0FFF4] text-[#1A7A3E]'
          }`}
        >
          <span>{isError ? '❌' : '✅'}</span>
          <span>{message}</span>
        </div>
      )}

      <PasswordPair
        passwordLabel="Mật khẩu mới"
        confirmLabel="Nhập lại mật khẩu mới"
        hint="Ít nhất 8 ký tự."
      />

      <SubmitButton />
    </form>
  );
}
