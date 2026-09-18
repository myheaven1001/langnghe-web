import { RELATED_PRODUCTS } from './data';

// Matches the trailing "Sản phẩm tương tự" block from the prototype.
export function RelatedProducts() {
  return (
    <div className="border-brand-border overflow-hidden rounded border bg-white">
      <div className="border-brand-border flex items-center justify-between border-b px-4 py-3">
        <div className="text-[15px] font-bold">Sản phẩm tương tự từ Bát Tràng</div>
        <a href="#" className="text-brand-blue text-xs">
          Xem thêm →
        </a>
      </div>
      <div className="grid grid-cols-2 gap-2.5 p-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {RELATED_PRODUCTS.map((product) => (
          <a
            key={product.id}
            href="#"
            className="border-brand-border block overflow-hidden rounded border bg-white transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)]"
          >
            <div className="flex h-[120px] items-center justify-center bg-[#f8f5f0] text-4xl">
              {product.emoji}
            </div>
            <div className="p-2">
              <div className="text-brand-ink mb-1 line-clamp-2 text-xs leading-[1.4] font-medium">
                {product.name}
              </div>
              <div className="font-tight text-brand-red text-sm font-bold">{product.price}</div>
              <div className="text-brand-sub text-[11px]">{product.moq}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
