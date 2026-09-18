import Link from 'next/link';

// Matches .about-cta from the prototype. Both buttons go to /register,
// which already handles buyer/supplier role selection.
export function AboutCta() {
  return (
    <div className="rounded-lg bg-[#C4622D] p-7 text-center">
      <div className="font-[family-name:var(--font-playfair)] mb-2 text-2xl text-white">
        Sẵn sàng mua sỉ thông minh hơn?
      </div>
      <div className="mb-4.5 text-[13px] text-white/75">
        Đăng ký miễn phí — nhận ngay 5 yêu cầu báo giá/tháng không giới hạn đơn hàng
      </div>
      <div className="flex justify-center gap-2.5">
        <Link
          href="/register"
          className="rounded-md bg-white px-6 py-2.5 text-[13px] font-semibold text-[#C4622D]"
        >
          🛒 Đăng ký mua sỉ
        </Link>
        <Link
          href="/register"
          className="rounded-md border border-white/30 bg-white/15 px-6 py-2.5 text-[13px] font-semibold text-white"
        >
          🏭 Đăng ký làm nhà cung cấp
        </Link>
      </div>
    </div>
  );
}
