import type { Metadata } from 'next';
import Link from 'next/link';
import { Inter, Inter_Tight, Playfair_Display } from 'next/font/google';
import LoginForm from './LoginForm';
import { safeNextPath, withNext } from '@/lib/safe-next';

export const metadata: Metadata = {
  title: 'Đăng nhập — LàngNghề.vn',
};

// Fonts scoped to /login to match the login_page.html mockup's identity
// (Inter / Inter Tight / Playfair Display) without changing the rest of
// the app, which uses Geist.
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

const BENEFITS = [
  {
    icon: '📋',
    title: 'Theo dõi RFQ & đơn hàng',
    desc: 'Xem trạng thái báo giá và đơn hàng realtime',
  },
  {
    icon: '🔔',
    title: 'Thông báo tức thì',
    desc: 'Không bỏ lỡ báo giá mới hay đơn hàng quan trọng',
  },
  {
    icon: '💬',
    title: 'Nhắn tin trực tiếp',
    desc: 'Đàm phán với xưởng ngay trên sàn',
  },
];

const STATS = [
  { num: '97%', label: 'Tỷ lệ phản hồi RFQ' },
  { num: '4h', label: 'Thời gian báo giá TB' },
  { num: '4.9★', label: 'Đánh giá trung bình' },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; type?: string; email?: string; next?: string }>;
}) {
  const { message, type, email, next: rawNext } = await searchParams;
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
          Chưa có tài khoản? <strong className="text-white">Đăng ký miễn phí</strong>
        </span>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_420px]">
        {/* LEFT */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,#0d2418_0%,#1A3A2A_55%,#2d5a3d_100%)] px-10 py-12 lg:flex">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[140px] tracking-[16px] opacity-[.04]">
            🏺🧺🪵
          </div>
          <div className="relative">
            <div className="mb-3.5 text-[10px] font-semibold tracking-[.12em] text-[#C4622D] uppercase">
              Chào mừng trở lại
            </div>
            <div className="mb-3.5 font-[family-name:var(--font-playfair)] text-[30px] leading-[1.25] font-semibold text-white">
              Chợ sỉ làng nghề Việt Nam
            </div>
            <div className="mb-7 text-[13px] leading-[1.7] text-white/60">
              Đăng nhập để tiếp tục kết nối với 1.200+ xưởng làng nghề và 8.000+ buyer trên toàn
              quốc.
            </div>
            <div className="flex flex-col gap-3.5">
              {BENEFITS.map((b) => (
                <div key={b.title} className="flex items-start gap-3">
                  <div className="mt-px shrink-0 text-lg">{b.icon}</div>
                  <div>
                    <strong className="mb-0.5 block text-[13px] font-semibold text-white">
                      {b.title}
                    </strong>
                    <span className="text-xs leading-normal text-white/50">{b.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative mt-8 flex gap-5">
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="font-[family-name:var(--font-inter-tight)] text-xl font-bold text-white">
                  {s.num}
                </div>
                <div className="mt-0.5 text-[10px] text-white/40">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col justify-center bg-white px-9 py-10">
          <div className="text-[22px] font-bold">Đăng nhập</div>
          <div className="mt-1 mb-7 text-[13px] leading-normal text-[#555]">
            Chào mừng trở lại — tiếp tục mua bán sỉ dễ dàng hơn.
          </div>

          <LoginForm message={message} type={type} email={email} next={next} />

          <div className="mt-5 text-center text-xs text-[#555]">
            Chưa có tài khoản?{' '}
            <Link
              href={withNext('/register', next)}
              className="font-semibold text-[#E53333] hover:underline"
            >
              Đăng ký miễn phí ngay
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
