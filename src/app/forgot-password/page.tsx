import Link from 'next/link';
import { Inter, Inter_Tight, Playfair_Display } from 'next/font/google';
import ForgotPasswordForm from './ForgotPasswordForm';

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

// Ported from forgot_password_page.html: 3 bước — nhập email (trang này) →
// nhập OTP 6 số (/verify-email, mode=reset) → đặt mật khẩu mới
// (/reset-password). Cũng là đường để tài khoản cũ (đăng ký khi còn dùng
// OTP thuần, chưa có mật khẩu) đặt mật khẩu lần đầu.
const HOW_IT_WORKS = [
  {
    icon: '1',
    title: 'Nhập email đăng ký',
    desc: 'Email bạn đã dùng khi tạo tài khoản',
  },
  {
    icon: '2',
    title: 'Nhập mã OTP 6 số',
    desc: 'Gửi đến email của bạn để xác nhận đúng chủ tài khoản',
  },
  {
    icon: '3',
    title: 'Đặt mật khẩu mới',
    desc: 'Dùng mật khẩu mới để đăng nhập từ lần sau',
  },
];

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; type?: string }>;
}) {
  const { message, type } = await searchParams;

  return (
    <div
      className={`${inter.variable} ${interTight.variable} ${playfair.variable} flex flex-1 flex-col bg-[#F5F3EF] font-[family-name:var(--font-inter)] text-[13px] text-[#1F1F1F]`}
    >
      <header className="flex items-center gap-3 bg-[#E53333] px-5 py-2.5">
        <div className="font-[family-name:var(--font-inter-tight)] text-[19px] font-bold text-white">
          LàngNghề<span className="ml-[3px] text-[13px] font-normal text-white/60">.vn</span>
        </div>
        <Link href="/login" className="ml-auto text-xs text-white/75 hover:text-white">
          ← Quay lại đăng nhập
        </Link>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_420px]">
        {/* LEFT */}
        <div className="relative hidden flex-col justify-center overflow-hidden bg-[linear-gradient(160deg,#0d2418_0%,#1A3A2A_100%)] px-10 py-12 lg:flex">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[120px] opacity-[.04]">
            🔐
          </div>
          <div className="relative">
            <div className="mb-3.5 text-[10px] font-semibold tracking-[.12em] text-[#C4622D] uppercase">
              Khôi phục tài khoản
            </div>
            <div className="mb-3 font-[family-name:var(--font-inter-tight)] text-[26px] leading-[1.3] font-bold text-white">
              Lấy lại quyền truy cập tài khoản
            </div>
            <div className="mb-8 text-[13px] leading-[1.7] text-white/60">
              Chỉ cần email đã đăng ký — chúng tôi gửi mã xác minh, rồi bạn đặt mật khẩu mới để đăng
              nhập lại.
            </div>
            <div className="flex flex-col gap-4">
              {HOW_IT_WORKS.map((step) => (
                <div key={step.title} className="flex items-start gap-3.5">
                  <div className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#C4622D] text-xs font-bold text-white">
                    {step.icon}
                  </div>
                  <div>
                    <strong className="mb-0.5 block text-[13px] font-semibold text-white">
                      {step.title}
                    </strong>
                    <span className="text-xs text-white/50">{step.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col justify-center bg-white px-9 py-10">
          <div className="mb-4 text-[44px]">🔐</div>
          <div className="text-[22px] font-bold">Quên mật khẩu?</div>
          <div className="mt-1 mb-7 text-[13px] leading-normal text-[#555]">
            Nhập email tài khoản của bạn — chúng tôi sẽ gửi mã OTP 6 số để bạn đặt mật khẩu mới.
          </div>

          <ForgotPasswordForm message={message} type={type} />

          <div className="mt-5 text-center text-xs text-[#555]">
            Nhớ cách đăng nhập rồi?{' '}
            <Link href="/login" className="font-semibold text-[#E53333] hover:underline">
              Quay lại đăng nhập
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
