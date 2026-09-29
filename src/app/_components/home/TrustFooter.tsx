import { Fragment } from 'react';

// Những điều sàn đang làm được thật (bỏ "Thanh toán Escrow", "Báo giá
// trong 4h" của bản mẫu — chưa có).
const TRUST_ITEMS = [
  { icon: '✅', title: 'Xưởng xác minh', sub: 'Sàn kiểm tra giấy tờ kinh doanh' },
  { icon: '🏭', title: 'Mua trực tiếp từ xưởng', sub: 'Không qua trung gian' },
  { icon: '📋', title: 'Gửi RFQ', sub: 'Nhiều xưởng cùng báo giá' },
  { icon: '🚚', title: 'Giao toàn quốc', sub: 'GHN, GHTK, Viettel Post' },
  { icon: '🆓', title: 'Miễn phí cho buyer', sub: 'Không thu phí giao dịch' },
];

export function TrustFooter() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded border border-[#E5DDD1] bg-white p-3.5 sm:gap-x-8 sm:px-5">
      {TRUST_ITEMS.map((item, i) => (
        <Fragment key={item.title}>
          <div className="flex items-center gap-2">
            <div className="text-xl">{item.icon}</div>
            <div>
              <strong className="block text-xs font-semibold text-[#2A2420]">{item.title}</strong>
              <span className="text-[11px] text-[#6B6058]">{item.sub}</span>
            </div>
          </div>
          {i < TRUST_ITEMS.length - 1 && (
            <div className="hidden h-[30px] w-px bg-[#E5DDD1] sm:block" />
          )}
        </Fragment>
      ))}
    </div>
  );
}
