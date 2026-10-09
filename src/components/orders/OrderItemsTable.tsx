import Link from 'next/link';
import { formatVnd } from '@/lib/format';
import { sortOrderItems, type OrderItemRow } from '@/lib/orders';

// Các dòng hàng của một đơn + tổng cộng. Dùng chung cho trang đơn của buyer,
// xưởng và admin. Tên / giá là bản chép lúc đặt (order_items), nên không đổi
// khi xưởng sửa sản phẩm sau đó. `linkProducts`: tên dẫn về trang sản phẩm
// (đơn đặt thẳng có product_id; đơn từ báo giá thì không).
export function OrderItemsTable({
  items,
  total,
  linkProducts = false,
}: {
  items: OrderItemRow[];
  total: number;
  linkProducts?: boolean;
}) {
  const sorted = sortOrderItems(items);

  return (
    <div>
      {sorted.length === 0 ? (
        <div className="text-brand-light text-[13px]">Đơn chưa có dòng hàng nào.</div>
      ) : (
        sorted.map((item, i) => (
          <div
            key={item.id ?? i}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-[#F2F0EC] py-2.5 first:pt-0"
          >
            <div className="min-w-0 flex-1 basis-[180px]">
              {linkProducts && item.product_id ? (
                <Link
                  href={`/products/${item.product_id}`}
                  className="text-brand-ink hover:text-brand-red text-[13px] font-bold break-words"
                >
                  {item.product_name}
                </Link>
              ) : (
                <div className="text-[13px] font-bold break-words">{item.product_name}</div>
              )}
              {item.variant_label && (
                <div className="text-brand-sub text-xs break-words">{item.variant_label}</div>
              )}
              <div className="text-brand-sub text-xs">
                {item.quantity.toLocaleString('vi-VN')} {item.unit ?? ''} ×{' '}
                {formatVnd(item.unit_price ?? 0)}
              </div>
            </div>
            <div className="shrink-0 text-[13px] font-semibold">
              {formatVnd(item.line_total ?? item.quantity * (item.unit_price ?? 0))}
            </div>
          </div>
        ))
      )}
      <div className="text-brand-ink flex justify-between pt-3 text-sm font-bold">
        <span>Tổng cộng</span>
        <span>{formatVnd(total)}</span>
      </div>
    </div>
  );
}
