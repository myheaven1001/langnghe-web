'use client';

import Link from 'next/link';
import { formatVnd } from '@/lib/format';
import {
  qtyRangeLabel,
  type ProductView,
  type SupplierView,
  type TierView,
  type Viewer,
} from './types';

interface OrderProps {
  product: ProductView;
  supplier: SupplierView;
  viewer: Viewer;
  tiers: TierView[];
  tierIndex: number;
  unitPrice: number | null;
  qty: number;
  onQtyChange: (qty: number) => void;
  onOpenRfq: () => void;
}

// Nút hành động theo người xem. "Đặt hàng ngay" và "Nhắn tin" tạm ẩn tới
// bước 5 (giỏ hàng, mô hình tin nhắn mới).
function PrimaryAction({
  viewer,
  onOpenRfq,
  compact,
}: Pick<OrderProps, 'viewer' | 'onOpenRfq'> & { compact?: boolean }) {
  const base = `bg-brand-red hover:bg-brand-red-dark rounded-md font-semibold text-white transition-colors ${
    compact ? 'px-4 py-2.5 text-[13px]' : 'w-full py-2.5 text-sm'
  }`;

  if (viewer.kind === 'owner') {
    return (
      <Link href={viewer.editHref} className={`${base} block text-center`}>
        ✏️ Sửa sản phẩm
      </Link>
    );
  }
  if (viewer.kind === 'guest') {
    return (
      <Link href={viewer.loginHref} className={`${base} block text-center`}>
        📋 {compact ? 'Gửi RFQ' : 'Đăng nhập để gửi yêu cầu báo giá'}
      </Link>
    );
  }
  if (viewer.kind === 'other') {
    return (
      <div className="text-brand-sub rounded-md bg-[#FAFAFA] px-3 py-2 text-center text-[11.5px]">
        Chỉ tài khoản người mua gửi được yêu cầu báo giá.
      </div>
    );
  }
  return (
    <button type="button" onClick={onOpenRfq} className={base}>
      📋 {compact ? 'Gửi RFQ' : 'Gửi yêu cầu báo giá (RFQ)'}
    </button>
  );
}

// Khối bên phải (xl) / dưới cùng (lg trở xuống): xưởng, đơn giá theo bậc +
// biến thể, số lượng (không dưới MOQ, tự áp bậc giá), tổng tiền ước tính.
export function OrderPanel(props: OrderProps) {
  const { product, supplier, viewer, tiers, tierIndex, unitPrice, qty, onQtyChange, onOpenRfq } =
    props;
  const shopHref = supplier.slug ? `/shops/${supplier.slug}` : null;
  const nextTier = tiers[tierIndex + 1];

  return (
    <div className="p-4">
      <div className="border-brand-border mb-3.5 flex items-center gap-2.5 rounded-md border bg-[#FAFAFA] p-2.5">
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#1A3A2A,#2d5a3d)] text-base text-white">
          {supplier.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={supplier.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            '🏭'
          )}
        </div>
        <div className="min-w-0">
          <div className="text-brand-ink truncate text-[13px] font-semibold">
            {supplier.shopName}
          </div>
          <div className="text-brand-sub mt-0.5 text-[11px]">
            {[
              supplier.verified && '✓ Đã xác minh',
              supplier.responseRate != null && `Phản hồi ${Math.round(supplier.responseRate)}%`,
              supplier.foundingYear && `Từ ${supplier.foundingYear}`,
            ]
              .filter(Boolean)
              .join(' · ') || supplier.villageOrigin}
          </div>
        </div>
        {shopHref && (
          <Link
            href={shopHref}
            className="text-brand-blue ml-auto shrink-0 text-[11.5px] font-medium"
          >
            Xem gian hàng ›
          </Link>
        )}
      </div>

      {unitPrice != null ? (
        <div className="mb-3.5">
          <div className="text-brand-sub mb-[3px] text-[11px]">
            Đơn giá ({qtyRangeLabel(tiers[tierIndex])}):
          </div>
          <div className="font-tight text-brand-red text-[28px] leading-none font-bold">
            {formatVnd(unitPrice)} <span className="text-brand-sub text-sm font-normal">/cái</span>
          </div>
          {nextTier && (
            <div className="text-brand-green mt-1 text-[11px] font-medium">
              💡 Đặt từ {nextTier.minQty.toLocaleString('vi-VN')} cái →{' '}
              {formatVnd(nextTier.unitPrice)}/cái
            </div>
          )}
        </div>
      ) : (
        <div className="text-brand-sub mb-3.5 text-xs">Giá: liên hệ xưởng qua yêu cầu báo giá.</div>
      )}

      {viewer.kind !== 'owner' && (
        <div className="mb-3">
          <div className="text-brand-ink mb-1.5 flex justify-between text-xs font-semibold">
            Số lượng:
            <span className="text-brand-sub font-normal">
              Tối thiểu {product.moq.toLocaleString('vi-VN')} cái
            </span>
          </div>
          <div className="border-brand-border flex w-fit items-center overflow-hidden rounded border">
            <button
              type="button"
              aria-label="Giảm số lượng"
              onClick={() => onQtyChange(qty - Math.max(1, Math.round(product.moq / 2)))}
              className="flex h-[34px] w-[34px] items-center justify-center bg-[#FAFAFA] text-lg hover:bg-[#f0ede5]"
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              value={qty}
              min={product.moq}
              aria-label="Số lượng"
              onChange={(e) => onQtyChange(Number(e.target.value) || product.moq)}
              className="font-tight border-brand-border h-[34px] w-20 border-x text-center text-sm font-semibold outline-none"
            />
            <button
              type="button"
              aria-label="Tăng số lượng"
              onClick={() => onQtyChange(qty + Math.max(1, Math.round(product.moq / 2)))}
              className="flex h-[34px] w-[34px] items-center justify-center bg-[#FAFAFA] text-lg hover:bg-[#f0ede5]"
            >
              +
            </button>
          </div>
          {unitPrice != null && (
            <div className="text-brand-sub mt-1.5 text-[11px]">
              Tổng tiền ước tính:{' '}
              <strong className="font-tight text-brand-red">{formatVnd(qty * unitPrice)}</strong>{' '}
              (chưa gồm vận chuyển)
            </div>
          )}
        </div>
      )}

      <div className="mb-3">
        <PrimaryAction viewer={viewer} onOpenRfq={onOpenRfq} />
      </div>

      <div className="flex flex-col gap-1.5 rounded-[5px] border border-[#B3E5FC] bg-[#F0F9FF] p-2.5 text-[11px] text-[#0277BD]">
        <div>🏭 Xưởng báo giá trực tiếp, không qua trung gian</div>
        <div>📦 Theo dõi trạng thái đơn hàng trên LàngNghề.vn</div>
      </div>
    </div>
  );
}

// Thanh cố định ở đáy màn hình trên điện thoại/máy tính bảng: đơn giá + nút
// chính, để không phải cuộn xuống khối đặt hàng.
export function MobileBuyBar(props: OrderProps) {
  const { viewer, unitPrice, onOpenRfq } = props;
  return (
    <div className="border-brand-border fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-white px-4 py-2.5 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] lg:hidden">
      <div className="min-w-0 flex-1">
        <div className="text-brand-sub text-[10.5px]">Đơn giá</div>
        <div className="font-tight text-brand-red truncate text-lg leading-tight font-bold">
          {unitPrice != null ? formatVnd(unitPrice) : 'Liên hệ'}
        </div>
      </div>
      <PrimaryAction viewer={viewer} onOpenRfq={onOpenRfq} compact />
    </div>
  );
}
