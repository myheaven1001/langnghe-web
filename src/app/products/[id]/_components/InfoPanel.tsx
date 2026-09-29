import { formatVnd } from '@/lib/format';
import {
  qtyRangeLabel,
  savingPercent,
  type ProductView,
  type SupplierView,
  type TierView,
  type VariantView,
} from './types';

// Tên, làng nghề, bảng giá sỉ theo số lượng (bấm để chọn bậc), thông số và
// biến thể — tất cả từ database. Chọn biến thể cộng price_adjustment vào
// đơn giá ở khối đặt hàng.
export function InfoPanel({
  product,
  supplier,
  tiers,
  tierIndex,
  onSelectTier,
  variants,
  variantId,
  onSelectVariant,
}: {
  product: ProductView;
  supplier: SupplierView;
  tiers: TierView[];
  tierIndex: number;
  onSelectTier: (index: number) => void;
  variants: VariantView[];
  variantId: string | null;
  onSelectVariant: (id: string) => void;
}) {
  const specs = [
    {
      label: 'Đặt tối thiểu',
      value: `${product.moq.toLocaleString('vi-VN')} cái`,
      highlight: true,
    },
    product.leadTimeDays && { label: 'Thời gian SX', value: `${product.leadTimeDays} ngày` },
    product.category && { label: 'Ngành hàng', value: product.category.name },
    supplier.villageOrigin && { label: 'Làng nghề', value: supplier.villageOrigin },
    {
      label: 'OEM / in logo',
      value: product.acceptOem ? 'Có' : 'Không',
      highlight: product.acceptOem,
    },
    {
      label: 'Đặt theo mẫu',
      value: product.acceptCustom ? 'Có' : 'Không',
      highlight: product.acceptCustom,
    },
  ].filter(Boolean) as { label: string; value: string; highlight?: boolean }[];

  return (
    <div className="px-4 py-4 lg:px-5">
      {supplier.villageOrigin && (
        <div className="text-brand-sub mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-[.06em] uppercase">
          <span className="bg-brand-orange h-1.5 w-1.5 rounded-full" />
          {supplier.villageOrigin}
        </div>
      )}
      <h1 className="text-brand-ink mb-2.5 text-lg leading-[1.35] font-bold">{product.name}</h1>

      <div className="mb-3.5 flex flex-wrap items-center gap-2 text-xs">
        {supplier.rating != null && supplier.rating > 0 && (
          <span>
            <span className="text-[#FFB800]">★</span> <strong>{supplier.rating.toFixed(1)}</strong>{' '}
            <span className="text-brand-sub">đánh giá xưởng</span>
          </span>
        )}
        {supplier.verified && (
          <span className="text-brand-green rounded-sm bg-[#E8F5EE] px-2 py-0.5 text-[11px] font-semibold">
            ✓ Xưởng đã xác minh
          </span>
        )}
      </div>

      <div className="mb-3.5 rounded-md border border-[#FFE0DC] bg-[#FFF8F7] p-3.5">
        <div className="text-brand-red mb-2.5 text-[11px] font-semibold tracking-[.06em] uppercase">
          📊 Bảng giá sỉ theo số lượng
        </div>
        {tiers.length === 0 ? (
          <div className="text-brand-sub text-xs">
            Xưởng chưa đăng bảng giá — gửi yêu cầu báo giá để nhận giá.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-brand-sub text-left text-[11px]">
                <th className="border-brand-border border-b px-2 pb-1.5 font-medium">Số lượng</th>
                <th className="border-brand-border border-b px-2 pb-1.5 font-medium">Đơn giá</th>
                <th className="border-brand-border border-b px-2 pb-1.5 font-medium">Tiết kiệm</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, i) => {
                const saving = savingPercent(tiers, i);
                return (
                  <tr
                    key={tier.minQty}
                    onClick={() => onSelectTier(i)}
                    className={`cursor-pointer border-b border-[#f5f0ee] last:border-none ${
                      i === tierIndex ? 'bg-[#FFF3F3]' : ''
                    }`}
                  >
                    <td className="px-2 py-2 text-[13px]">{qtyRangeLabel(tier)}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`font-tight text-[15px] font-bold ${
                          i === tierIndex ? 'text-brand-red' : 'text-brand-ink'
                        }`}
                      >
                        {formatVnd(tier.unitPrice)}
                      </span>
                    </td>
                    <td className="text-brand-green px-2 py-2 text-[11px] font-medium">
                      {saving > 0 ? `↓ ${saving}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mb-3.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {specs.map((spec) => (
          <div key={spec.label} className="flex gap-1.5">
            <div className="text-brand-sub w-[95px] shrink-0 text-xs">{spec.label}</div>
            <div
              className={`text-xs font-medium ${spec.highlight ? 'text-brand-green' : 'text-brand-ink'}`}
            >
              {spec.value}
            </div>
          </div>
        ))}
      </div>

      {variants.length > 0 && (
        <div className="mb-1">
          <div className="text-brand-ink mb-1.5 text-xs font-semibold">Phân loại:</div>
          <div className="flex flex-wrap gap-1.5">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelectVariant(v.id)}
                className={`rounded border px-3 py-[5px] text-xs transition-colors ${
                  v.id === variantId
                    ? 'border-brand-red text-brand-red bg-[#FFF8F7]'
                    : 'border-brand-border hover:border-brand-red hover:text-brand-red'
                }`}
              >
                {v.label}
                {v.priceAdjustment !== 0 && (
                  <span className="text-brand-sub ml-1">
                    ({v.priceAdjustment > 0 ? '+' : '−'}
                    {formatVnd(Math.abs(v.priceAdjustment))})
                  </span>
                )}
                {v.stockQty > 0 && (
                  <span className="text-brand-green ml-1">· còn {v.stockQty}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
