'use client';

import { useState } from 'react';

// Thanh toán online (nâng cấp gói / mua credit) là việc của Giai đoạn 9
// (VNPay/Momo, xem PROJECT_ROADMAP.md) — 3.9 chỉ yêu cầu hiển thị dữ liệu
// thật, chưa nối cổng thanh toán. Thay vì giả một luồng mua hàng (alert()
// như prototype, hoặc một nút trông như hoạt động nhưng không làm gì),
// bấm vào chỉ hiện rõ trạng thái thật: chưa hỗ trợ.
export function ComingSoonButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  const [showNote, setShowNote] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setShowNote((v) => !v)} className={className}>
        {children}
      </button>
      {showNote && (
        <div className="text-brand-light mt-2 text-center text-[10.5px] leading-relaxed">
          🚧 Thanh toán trực tuyến chưa được nối — tính năng này sẽ mở ở Giai đoạn 9.
        </div>
      )}
    </div>
  );
}
