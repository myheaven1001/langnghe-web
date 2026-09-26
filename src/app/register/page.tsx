import type { Metadata } from 'next';
import Link from 'next/link';
import { Inter, Inter_Tight, Playfair_Display } from 'next/font/google';
import RegisterForm from './RegisterForm';
import { safeNextPath, withNext } from '@/lib/safe-next';

export const metadata: Metadata = {
  title: 'Đăng ký — LàngNghề.vn',
};

// Same fonts as /login, scoped to this route only.
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
const playfair = Playfair_Display({
  subsets: ['latin', 'vietnamese'],
  weight: ['600'],
  variable: '--font-playfair',
});

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; email?: string; role?: string; next?: string }>;
}) {
  const { message, email, role, next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);

  return (
    <div
      className={`${inter.variable} ${interTight.variable} ${playfair.variable} flex flex-1 flex-col bg-[#F5F3EF] font-[family-name:var(--font-inter)] text-[13px] text-[#1F1F1F]`}
    >
      <header className="flex items-center gap-3 bg-[#E53333] px-5 py-2.5">
        <div className="font-[family-name:var(--font-inter-tight)] text-[19px] font-bold text-white">
          LàngNghề<span className="ml-[3px] text-[13px] font-normal text-white/60">.vn</span>
        </div>
        <span className="ml-auto text-xs text-white/75">
          Đã có tài khoản?{' '}
          <Link
            href={withNext('/login', next)}
            className="font-semibold text-white hover:underline"
          >
            Đăng nhập
          </Link>
        </span>
      </header>

      <RegisterForm
        message={message}
        email={email}
        next={next}
        initialRole={role === 'supplier' ? 'supplier' : role === 'buyer' ? 'buyer' : undefined}
      />
    </div>
  );
}
