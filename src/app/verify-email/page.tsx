import { Inter, Inter_Tight, Playfair_Display } from 'next/font/google';
import { redirect } from 'next/navigation';
import VerifyEmailForm from './VerifyEmailForm';

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

const STATS = [
  { num: '1.200+', label: 'Nhà cung cấp' },
  { num: '8.000+', label: 'Buyer' },
  { num: '30s', label: 'Xác minh trung bình' },
];

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string;
    mode?: string;
    type?: string;
    message?: string;
    resent?: string;
    verified?: string;
    step?: string;
    role?: string;
    r?: string;
  }>;
}) {
  const {
    email,
    mode: rawMode,
    type,
    message,
    resent,
    verified,
    step,
    role,
    r,
  } = await searchParams;
  const mode = rawMode === 'reset' ? 'reset' : 'register';
  const showProfileStep = step === 'profile' && (role === 'buyer' || role === 'supplier');

  // Không có email trong URL nghĩa là vào thẳng trang này mà chưa qua bước
  // gửi OTP — không có gì để xác minh, đưa về nơi khởi đầu hợp lý.
  if (!email) {
    redirect(mode === 'reset' ? '/forgot-password' : '/register');
  }

  return (
    <div
      className={`${inter.variable} ${interTight.variable} ${playfair.variable} flex flex-1 flex-col bg-[#F5F3EF] font-[family-name:var(--font-inter)] text-[13px] text-[#1F1F1F]`}
    >
      <header className="flex items-center gap-3 bg-[#E53333] px-5 py-2.5">
        <div className="font-[family-name:var(--font-inter-tight)] text-[19px] font-bold text-white">
          LàngNghề<span className="ml-[3px] text-[13px] font-normal text-white/60">.vn</span>
        </div>
        <span className="ml-auto text-xs text-white/75">
          Cần trợ giúp? <strong className="text-white">Liên hệ hỗ trợ</strong>
        </span>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_460px]">
        {/* LEFT */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,#0d2418_0%,#1A3A2A_55%,#2d5a3d_100%)] px-10 py-12 lg:flex">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[140px] tracking-[16px] opacity-[.04]">
            🏺🧺🪵
          </div>
          <div className="relative">
            <div className="mb-3.5 text-[10px] font-semibold tracking-[.12em] text-[#C4622D] uppercase">
              {mode === 'reset' ? 'Khôi phục tài khoản' : 'Chỉ còn một bước nữa'}
            </div>
            <div className="mb-3.5 font-[family-name:var(--font-playfair)] text-[30px] leading-[1.25] font-semibold text-white">
              {mode === 'reset'
                ? 'Xác minh email để đặt mật khẩu mới'
                : 'Xác minh email để bắt đầu mua bán sỉ'}
            </div>
            <div className="mb-7 text-[13px] leading-[1.7] text-white/60">
              Xác minh giúp bảo vệ tài khoản của bạn và đảm bảo mọi giao dịch trên LàngNghề.vn đều
              an toàn, minh bạch.
            </div>

            <div className="flex flex-col">
              {(showProfileStep
                ? [
                    { state: 'done' as const, label: 'Tạo tài khoản', sub: 'Đã hoàn tất' },
                    { state: 'done' as const, label: 'Xác minh email', sub: 'Đã hoàn tất' },
                    { state: 'active' as const, label: 'Hoàn thiện hồ sơ', sub: 'Đang thực hiện' },
                    {
                      state: 'todo' as const,
                      label: 'Khám phá & bắt đầu',
                      sub: 'Tìm nguồn hàng hoặc đăng sản phẩm',
                    },
                  ]
                : [
                    { state: 'done' as const, label: 'Tạo tài khoản', sub: 'Đã hoàn tất' },
                    { state: 'active' as const, label: 'Xác minh email', sub: 'Đang thực hiện' },
                    {
                      state: 'todo' as const,
                      label: 'Khám phá & bắt đầu',
                      sub: 'Tìm nguồn hàng hoặc đăng sản phẩm',
                    },
                  ]
              ).map((s, i, arr) => (
                <div key={s.label} className="relative flex gap-3 pb-5.5">
                  {i < arr.length - 1 && (
                    <div className="absolute top-6.5 bottom-0 left-[11px] w-[1.5px] bg-white/15" />
                  )}
                  <div
                    className={`z-10 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      s.state === 'done'
                        ? 'bg-[#00A650] text-white'
                        : s.state === 'active'
                          ? 'bg-[#C4622D] text-white'
                          : 'border-[1.5px] border-white/25 bg-white/10 text-white/40'
                    }`}
                  >
                    {s.state === 'done' ? '✓' : i + 1}
                  </div>
                  <div>
                    <div
                      className={`pt-0.5 text-[13px] font-semibold ${s.state === 'todo' ? 'text-white/45' : 'text-white'}`}
                    >
                      {s.label}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-white/45">{s.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative mt-8 flex gap-5">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="font-[family-name:var(--font-inter-tight)] text-xl font-bold text-white">
                  {s.num}
                </div>
                <div className="mt-0.5 text-[10px] text-white/40">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col items-center justify-center bg-white px-11 py-12 text-center">
          <VerifyEmailForm
            email={email}
            mode={mode}
            message={message}
            isError={type === 'error'}
            justResent={resent === '1'}
            verified={verified === '1'}
            profileRole={showProfileStep ? (role as 'buyer' | 'supplier') : undefined}
            attempt={r ?? ''}
          />
        </div>
      </div>
    </div>
  );
}
