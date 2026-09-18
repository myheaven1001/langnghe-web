'use client';

import { useState } from 'react';
import type { PriceTier } from './data';
import { DEFAULT_QTY, MIN_QTY, QTY_STEP, SUPPLIER } from './data';

const ASSURANCE_ITEMS = [
  { icon: '🔒', text: 'Thanh toán qua Escrow — an toàn 100%' },
  { icon: '🔄', text: 'Đổi trả nếu hàng không đúng mô tả' },
  { icon: '🚚', text: 'Giao hàng toàn quốc, tracking realtime' },
  { icon: '📞', text: 'Hỗ trợ tranh chấp 24/7' },
];

// Matches .order-panel from the prototype: supplier card, live price (driven
// by the selected tier from InfoPanel), quantity stepper + running total,
// action buttons and the escrow/assurance list. `qty` is local state — it's
// the only thing in this panel that doesn't need to be shared with the rest
// of the page, so keeping it here (instead of lifted to ProductDetailClient)
// keeps quantity edits from re-rendering the gallery/tabs/related-products.
export function OrderPanel({ tier, onOpenRFQ }: { tier: PriceTier; onOpenRFQ: () => void }) {
  const [qty, setQty] = useState(DEFAULT_QTY);
  const total = qty * tier.price;

  return (
    <div className="p-4">
      <div className="bg-[#FAFAFA] border-brand-border mb-3.5 flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5">
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#1A3A2A,#2d5a3d)] text-base">
          {SUPPLIER.avatar}
        </div>
        <div>
          <div className="text-brand-ink text-[13px] font-semibold">{SUPPLIER.name}</div>
          <div className="text-brand-sub mt-0.5 text-[11px]">
            ★ {SUPPLIER.rating} · {SUPPLIER.responseTime} · {SUPPLIER.yearsOnPlatform}
          </div>
        </div>
        <div className="text-brand-light ml-auto text-sm">›</div>
      </div>

      <div className="mb-3.5">
        <div className="text-brand-sub mb-[3px] text-[11px]">Đơn giá hiện tại ({tier.qtyLabel}):</div>
        <div className="font-tight text-brand-red text-[28px] leading-none font-bold">
          {tier.priceLabel} <span className="text-brand-sub text-sm font-normal">/cái</span>
        </div>
        <div className="text-brand-green mt-1 text-[11px] font-medium">{tier.note}</div>
      </div>

      <div className="mb-3">
        <div className="text-brand-ink mb-1.5 flex justify-between text-xs font-semibold">
          Số lượng: <span className="text-brand-sub font-normal">MOQ tối thiểu: {MIN_QTY} cái</span>
        </div>
        <div className="border-brand-border flex w-fit items-center overflow-hidden rounded border">
          <button
            type="button"
            onClick={() => setQty(Math.max(MIN_QTY, qty - QTY_STEP))}
            className="bg-[#FAFAFA] flex h-[34px] w-[34px] items-center justify-center text-lg hover:bg-[#f0ede5]"
          >
            −
          </button>
          <input
            type="number"
            value={qty}
            min={MIN_QTY}
            onChange={(e) => setQty(Math.max(MIN_QTY, Number(e.target.value) || MIN_QTY))}
            className="font-tight border-brand-border h-[34px] w-14 border-x text-center text-sm font-semibold outline-none"
          />
          <button
            type="button"
            onClick={() => setQty(qty + QTY_STEP)}
            className="bg-[#FAFAFA] flex h-[34px] w-[34px] items-center justify-center text-lg hover:bg-[#f0ede5]"
          >
            +
          </button>
        </div>
        <div className="text-brand-sub mt-1.5 text-[11px]">
          Tổng tiền ước tính:{' '}
          <strong className="font-tight text-brand-red">{total.toLocaleString('vi-VN')}đ</strong>
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onOpenRFQ}
          className="bg-brand-red hover:bg-brand-red-dark w-full rounded-md py-2.5 text-sm font-semibold text-white transition-colors"
        >
          📋 Gửi yêu cầu báo giá (RFQ)
        </button>
        <button
          type="button"
          className="text-brand-orange w-full rounded-md border-[1.5px] border-[#FF6A00] bg-[#FFF3E0] py-2.5 text-sm font-semibold transition-colors hover:bg-[#FFE0B2]"
        >
          🛒 Đặt hàng ngay
        </button>
        <button
          type="button"
          className="text-brand-ink bg-[#FAFAFA] border-brand-border hover:border-brand-ink w-full rounded-md border py-2.5 text-sm font-semibold transition-colors"
        >
          💬 Nhắn tin cho xưởng
        </button>
      </div>

      <div className="flex flex-col gap-1.5 rounded-[5px] border border-[#B3E5FC] bg-[#F0F9FF] p-2.5">
        {ASSURANCE_ITEMS.map((item) => (
          <div key={item.text} className="flex items-center gap-1.5 text-[11px] text-[#0277BD]">
            <span className="text-[13px]">{item.icon}</span>
            {item.text}
          </div>
        ))}
      </div>
    </div>
  );
}
