'use client';

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { confirmOtp, resendOtp } from '@/app/auth/actions';

// Supabase mặc định giới hạn 1 yêu cầu OTP / 60 giây cho mỗi email — dùng
// đúng 60s ở đây (thay vì 45s trong mockup) để nút "Gửi lại mã" không bao
// giờ bấm được sớm hơn mức Supabase thực sự cho phép.
const RESEND_SECONDS = 60;

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="mb-4 w-full rounded-lg bg-[#E53333] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#c62828] disabled:cursor-not-allowed disabled:bg-[#E0DDD8]"
    >
      {pending ? '⏳ Đang xác minh...' : 'Xác nhận'}
    </button>
  );
}

function ResendButton({ seconds }: { seconds: number }) {
  const { pending } = useFormStatus();
  const disabled = seconds > 0 || pending;
  return (
    <button
      type="submit"
      disabled={disabled}
      className={
        disabled
          ? 'cursor-not-allowed font-semibold text-[#999]'
          : 'font-semibold text-[#E53333] underline'
      }
    >
      {pending ? 'Đang gửi...' : 'Gửi lại mã'}
    </button>
  );
}

export default function VerifyEmailForm({
  email,
  mode,
  message,
  isError,
  justResent,
  verified,
  attempt,
}: {
  email: string;
  mode: 'register' | 'login';
  message?: string;
  isError: boolean;
  justResent: boolean;
  verified: boolean;
  // Nonce ngẫu nhiên sinh ở server mỗi lần redirect về trang này (xem
  // verifyUrl() trong auth/actions.ts) — đổi giá trị ngay cả khi 2 lần
  // liên tiếp trả về CÙNG một message lỗi (ví dụ nhập sai OTP 2 lần).
  attempt: string;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // "Adjust state during render" — pattern chính thức của React để phản
  // ứng với prop đổi mà KHÔNG cần useEffect (tránh cascading render / lỗi
  // react-hooks/set-state-in-effect). Chạy đồng bộ trong render, trước khi
  // commit ra DOM, nên không gây nháy UI.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevAttempt, setPrevAttempt] = useState(attempt);
  if (attempt !== prevAttempt) {
    setPrevAttempt(attempt);
    setDigits(Array(6).fill(''));
    // Chỉ khởi động lại đếm ngược khi attempt mới này THỰC SỰ là do vừa
    // gửi lại OTP (justResent) — một lượt verify SAI không hề gọi lại
    // signInWithOtp() ở server, nên không được phép kéo dài thời gian
    // chờ của nút "Gửi lại mã" so với giới hạn thật của Supabase.
    if (justResent) {
      setSeconds(RESEND_SECONDS);
    }
  }

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  useEffect(() => {
    // Thao tác DOM thuần (focus) — hợp lệ trong effect, không setState.
    if (isError) {
      inputRefs.current[0]?.focus();
    }
  }, [attempt, isError]);

  function setDigit(i: number, raw: string) {
    const v = raw.replace(/[^0-9]/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
    if (v && i < 5) inputRefs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const paste = e.clipboardData
      .getData('text')
      .replace(/[^0-9]/g, '')
      .slice(0, 6);
    if (!paste) return;
    setDigits((prev) => {
      const next = [...prev];
      paste.split('').forEach((ch, idx) => {
        if (idx < 6) next[idx] = ch;
      });
      return next;
    });
    inputRefs.current[Math.min(paste.length, 5)]?.focus();
  }

  const token = digits.join('');
  const complete = digits.every((d) => d.length === 1);

  if (verified) {
    return (
      <div className="w-full max-w-[340px]">
        <div className="mb-4 text-[54px]">🎉</div>
        <div className="mb-2 text-xl font-bold text-[#1A3A2A]">Email đã được xác minh!</div>
        <div className="mb-6 text-[13px] leading-[1.7] text-[#555]">
          Tài khoản của bạn đã sẵn sàng. Chào mừng đến với cộng đồng mua bán sỉ làng nghề
          LàngNghề.vn.
        </div>
        <div className="mb-5 rounded-lg bg-[#F5F3EF] p-3.5 text-left">
          <div className="mb-2 text-xs font-semibold">Bước tiếp theo</div>
          {[
            'Hoàn thiện hồ sơ công ty để tăng độ tin cậy',
            'Khám phá 8.400+ sản phẩm làng nghề',
            'Gửi yêu cầu báo giá đầu tiên — miễn phí',
          ].map((step, i) => (
            <div key={step} className="mb-1.5 flex items-center gap-2 text-xs text-[#555]">
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#E53333] text-[10px] font-bold text-white">
                {i + 1}
              </span>
              {step}
            </div>
          ))}
        </div>
        <Link
          href="/"
          className="block w-full rounded-lg bg-[#E53333] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c62828]"
        >
          🛒 Vào Dashboard ngay
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[340px]">
      <div className="mb-4 text-[46px]">📧</div>
      <div className="mb-2 text-[22px] font-bold">Xác minh email của bạn</div>
      <div className="text-[13px] leading-[1.6] text-[#555]">
        Nhập mã 6 số chúng tôi vừa gửi đến
      </div>
      <div className="mb-6.5 text-[13px] font-bold">
        {email}{' '}
        <Link
          href={mode === 'login' ? '/login' : '/register'}
          className="ml-1.5 text-xs font-semibold text-[#E53333] underline"
        >
          Đổi email
        </Link>
      </div>

      <form action={confirmOtp}>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="token" value={token} />

        <div className="mb-2.5 flex justify-center gap-2.5">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              className={`h-[54px] w-[46px] rounded-[10px] border-[1.5px] text-center font-[family-name:var(--font-inter-tight)] text-[22px] font-bold transition-colors outline-none ${
                isError
                  ? 'border-[#E53333] bg-[#FFF8F8]'
                  : d
                    ? 'border-[#00A650]'
                    : 'border-[#E0DDD8] focus:border-[#E53333]'
              }`}
            />
          ))}
        </div>

        {isError && message && (
          <div className="mb-2.5 flex items-center justify-center gap-1.5 text-xs text-[#E53333]">
            <span>❌</span>
            <span>{message}</span>
          </div>
        )}
        {!isError && justResent && (
          <div className="mb-2.5 flex items-center justify-center gap-1.5 text-xs text-[#00A650]">
            <span>✓</span>
            <span>Đã gửi lại mã xác minh mới.</span>
          </div>
        )}

        <SubmitButton disabled={!complete} />
      </form>

      {/* Form riêng, KHÔNG lồng trong <form> xác nhận ở trên (HTML không
          cho phép form lồng form) — submit độc lập tới resendOtp. */}
      <div className="mb-6 text-xs text-[#555]">
        Chưa nhận được mã? <FormWithResend email={email} mode={mode} seconds={seconds} />{' '}
        {seconds > 0 && (
          <span className="text-[#999]">(00:{String(seconds).padStart(2, '0')})</span>
        )}
      </div>

      <div className="border-t border-[#E0DDD8] pt-4 text-xs leading-[1.6] text-[#555]">
        Không thấy email? Kiểm tra thư mục <strong>Spam/Quảng cáo</strong>, hoặc liên hệ hỗ trợ nếu
        vẫn không nhận được mã sau vài phút.
      </div>
      <div className="mt-4.5 text-xs text-[#555]">
        Sai tài khoản?{' '}
        <Link href="/login" className="font-semibold text-[#E53333]">
          Quay lại đăng nhập
        </Link>
      </div>
    </div>
  );
}

function FormWithResend({
  email,
  mode,
  seconds,
}: {
  email: string;
  mode: 'register' | 'login';
  seconds: number;
}) {
  return (
    <form action={resendOtp} className="inline">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="mode" value={mode} />
      <ResendButton seconds={seconds} />
    </form>
  );
}
