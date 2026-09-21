'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { registerAccount } from '@/app/auth/actions';
import PasswordPair from '@/app/auth/_components/PasswordPair';

type Role = 'buyer' | 'supplier';

const STATS = [
  { num: '1.200+', label: 'Nhà cung cấp' },
  { num: '8.400+', label: 'Sản phẩm' },
  { num: '4h', label: 'Thời gian báo giá TB' },
  { num: '0đ', label: 'Phí cho buyer' },
];

const LEFT_CONTENT: Record<
  Role,
  {
    emoji: string;
    eyebrow: string;
    title: string;
    sub: string;
    benefits: { icon: string; title: string; desc: string }[];
  }
> = {
  buyer: {
    emoji: '🛒',
    eyebrow: 'Dành cho người mua sỉ',
    title: 'Tìm nguồn hàng làng nghề chính gốc',
    sub: 'Kết nối trực tiếp với 1.200+ xưởng Bát Tràng, Chương Mỹ, Vạn Phúc — giá xưởng, không qua trung gian.',
    benefits: [
      {
        icon: '💰',
        title: 'Giá rẻ hơn 30–60%',
        desc: 'Mua thẳng từ xưởng, không phí hoa hồng, không markup đại lý',
      },
      {
        icon: '📋',
        title: 'Gửi RFQ miễn phí',
        desc: '5 yêu cầu báo giá/tháng, nhận phản hồi trong 4 giờ',
      },
      {
        icon: '🔒',
        title: 'Thanh toán Escrow an toàn',
        desc: 'Tiền chỉ về xưởng sau khi bạn nhận hàng đúng chất lượng',
      },
      {
        icon: '🚚',
        title: 'Giao hàng toàn quốc',
        desc: 'Tracking realtime qua GHN, GHTK, Viettel Post',
      },
    ],
  },
  supplier: {
    emoji: '🏭',
    eyebrow: 'Dành cho chủ xưởng & nhà sản xuất',
    title: 'Tiếp cận 8.000+ buyer mua sỉ toàn quốc',
    sub: 'Đăng sản phẩm một lần, buyer tự tìm đến bạn. Không cần đi chợ, không tốn phí quảng cáo Facebook.',
    benefits: [
      {
        icon: '📈',
        title: 'Khách mua sỉ chất lượng',
        desc: 'Buyer đã được xác minh — shop, công ty, xuất khẩu',
      },
      {
        icon: '🆓',
        title: '6 tháng đầu miễn phí hoàn toàn',
        desc: 'Không giới hạn sản phẩm, không phí listing',
      },
      {
        icon: '🔔',
        title: 'Thông báo RFQ ngay lập tức',
        desc: 'Phản hồi nhanh — tăng điểm uy tín, được ưu tiên hiển thị',
      },
      {
        icon: '📊',
        title: 'Analytics gian hàng',
        desc: 'Xem ai đang xem sản phẩm, xu hướng tìm kiếm',
      },
    ],
  },
};

function tabClass(active: boolean) {
  return `flex-1 rounded-md px-2 py-2 text-[13px] font-medium transition-colors ${
    active
      ? 'bg-white font-semibold text-[#1F1F1F] shadow-[0_1px_4px_rgba(0,0,0,.1)]'
      : 'text-[#555]'
  }`;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-[#E53333] py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#c62828] disabled:cursor-not-allowed disabled:bg-[#E0DDD8]"
    >
      {pending ? '⏳ Đang gửi mã...' : 'Gửi mã xác minh'}
    </button>
  );
}

export default function RegisterForm({
  message,
  email,
  initialRole,
}: {
  message?: string;
  email?: string;
  initialRole?: Role;
}) {
  const [role, setRole] = useState<Role>(initialRole ?? 'buyer');
  const leftContent = LEFT_CONTENT[role];

  return (
    <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_420px]">
      {/* LEFT */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,#0d2418_0%,#1A3A2A_55%,#2d5a3d_100%)] px-10 py-12 lg:flex">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[140px] opacity-[.04]">
          {leftContent.emoji}
        </div>
        <div className="relative">
          <div className="mb-3.5 text-[10px] font-semibold tracking-[.12em] text-[#C4622D] uppercase">
            {leftContent.eyebrow}
          </div>
          <div className="mb-3.5 font-[family-name:var(--font-playfair)] text-[30px] leading-[1.25] font-semibold text-white">
            {leftContent.title}
          </div>
          <div className="mb-7 text-[13px] leading-[1.7] text-white/60">{leftContent.sub}</div>
          <div className="flex flex-col gap-3">
            {leftContent.benefits.map((b) => (
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
        <div className="text-[22px] font-bold">Tạo tài khoản</div>
        <div className="mt-1 mb-7 text-[13px] leading-normal text-[#555]">
          Miễn phí — đặt mật khẩu, rồi xác minh email bằng mã 6 số.
        </div>

        <div className="mb-6 flex gap-1 rounded-lg bg-[#F5F3EF] p-1">
          <button
            type="button"
            onClick={() => setRole('buyer')}
            className={tabClass(role === 'buyer')}
          >
            🛒 Đăng ký mua sỉ
          </button>
          <button
            type="button"
            onClick={() => setRole('supplier')}
            className={tabClass(role === 'supplier')}
          >
            🏭 Đăng ký làm xưởng
          </button>
        </div>

        {message && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#FFCDD2] bg-[#FFF0F0] px-3.5 py-2.5 text-xs text-[#C62828]">
            <span>❌</span>
            <span>{message}</span>
          </div>
        )}

        <form action={registerAccount} className="flex flex-col gap-4">
          {/* role đi kèm request gửi OTP — trigger DB đọc field này để tạo
              đúng buyer_profiles/supplier_profiles sau khi verify (xem
              src/app/auth/actions.ts + supabase/migrations). */}
          <input type="hidden" name="role" value={role} />

          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-semibold">
              Email {role === 'buyer' ? 'công ty' : 'liên hệ'}{' '}
              <span className="text-[#E53333]">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={email}
              placeholder={role === 'buyer' ? 'lan@shopname.com' : 'minh@xuong-gom.vn'}
              className="w-full rounded-md border-[1.5px] border-[#E0DDD8] px-3 py-2.5 text-[13px] transition-colors outline-none focus:border-[#E53333]"
            />
            <div className="mt-1.5 text-[11px] text-[#999]">
              Chúng tôi gửi mã xác minh 6 số đến email này để tạo tài khoản{' '}
              {role === 'buyer' ? 'mua sỉ' : 'nhà cung cấp'}.
            </div>
          </div>

          <PasswordPair
            passwordLabel="Mật khẩu *"
            confirmLabel="Nhập lại mật khẩu *"
            hint="Ít nhất 8 ký tự."
          />

          <SubmitButton />
        </form>

        <div className="mt-4 text-center text-xs text-[#555]">
          Đã có tài khoản?{' '}
          <Link href="/login" className="font-semibold text-[#E53333] hover:underline">
            Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
