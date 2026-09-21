import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Inter, Inter_Tight } from 'next/font/google';
import { createClient } from '@/lib/supabase/server';
import ResetPasswordForm from './ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Đặt mật khẩu mới — LàngNghề.vn',
};

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
});
const interTight = Inter_Tight({
  subsets: ['latin', 'vietnamese'],
  weight: ['600', '700'],
  variable: '--font-inter-tight',
});

// Bước 3 của luồng quên mật khẩu (forgot-password → verify-email?mode=reset
// → đây). Chỉ vào được khi đã có session từ OTP; vào thẳng không qua OTP thì
// quay về bước đầu. Route này không nằm trong PRIVATE_PREFIXES của proxy vì
// người dùng đang bị "quên mật khẩu" có thể chưa 'active' — tự guard ở đây.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; type?: string }>;
}) {
  const { message, type } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/forgot-password');

  return (
    <div
      className={`${inter.variable} ${interTight.variable} flex flex-1 flex-col bg-[#F5F3EF] font-[family-name:var(--font-inter)] text-[13px] text-[#1F1F1F]`}
    >
      <header className="flex items-center gap-3 bg-[#E53333] px-5 py-2.5">
        <div className="font-[family-name:var(--font-inter-tight)] text-[19px] font-bold text-white">
          LàngNghề<span className="ml-[3px] text-[13px] font-normal text-white/60">.vn</span>
        </div>
        <Link href="/login" className="ml-auto text-xs text-white/75 hover:text-white">
          ← Quay lại đăng nhập
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px] rounded-xl border border-[#E0DDD8] bg-white px-9 py-10">
          <div className="mb-4 text-[44px]">🔑</div>
          <div className="text-[22px] font-bold">Đặt mật khẩu mới</div>
          <div className="mt-1 mb-7 text-[13px] leading-normal text-[#555]">
            Email <strong>{user.email}</strong> đã được xác minh. Chọn mật khẩu mới để đăng nhập từ
            lần sau.
          </div>

          <ResetPasswordForm message={message} type={type} />
        </div>
      </div>
    </div>
  );
}
