import { PRICE_DETAIL_ROWS } from './data';

// Matches #tab-price from the prototype.
export function PriceDetailTab() {
  return (
    <div>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {['Số lượng', 'Đơn giá/cái', 'Tổng (ví dụ)', 'Tiết kiệm so với giá thấp nhất', 'Ghi chú'].map(
              (h) => (
                <th
                  key={h}
                  className="border-brand-border border bg-[#F5F5F5] px-3.5 py-2.5 text-left font-semibold"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {PRICE_DETAIL_ROWS.map((row, i) => (
            <tr
              key={row.qtyLabel}
              className={row.best ? 'bg-[#FFF3F3] font-semibold' : i % 2 === 1 ? 'bg-[#FAFAFA]' : ''}
            >
              <td className={`border-brand-border border px-3.5 py-2.5 ${row.best ? 'text-brand-red' : ''}`}>
                {row.qtyLabel}
              </td>
              <td className={`border-brand-border border px-3.5 py-2.5 ${row.best ? 'text-brand-red' : ''}`}>
                {row.unitPrice}
              </td>
              <td className={`border-brand-border border px-3.5 py-2.5 ${row.best ? 'text-brand-red' : ''}`}>
                {row.exampleTotal}
              </td>
              <td className={`border-brand-border border px-3.5 py-2.5 ${row.best ? 'text-brand-red' : ''}`}>
                {row.save}
              </td>
              <td className={`border-brand-border border px-3.5 py-2.5 ${row.best ? 'text-brand-red' : ''}`}>
                {row.note}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-brand-sub mt-3.5 text-xs leading-[1.7]">
        <strong>Lưu ý về giá:</strong> Giá trên chưa bao gồm phí vận chuyển. Phí ship phụ thuộc vào địa
        chỉ giao và đơn vị vận chuyển. Với đơn từ 500 cái trở lên, xưởng có thể hỗ trợ một phần phí
        ship — liên hệ trực tiếp để thương lượng.
      </div>
    </div>
  );
}
