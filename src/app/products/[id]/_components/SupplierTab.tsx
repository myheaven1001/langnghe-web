import { SUPPLIER, SUPPLIER_INFO, SUPPLIER_METRICS } from './data';

// Matches #tab-supplier from the prototype.
export function SupplierTab() {
  return (
    <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[200px_1fr]">
      <div className="text-center">
        <div className="mx-auto mb-2.5 flex h-20 w-20 items-center justify-center rounded-full bg-[linear-gradient(135deg,#1A3A2A,#2d5a3d)] text-4xl">
          {SUPPLIER.avatar}
        </div>
        <div className="mb-1 text-[15px] font-bold">{SUPPLIER.name}</div>
        <div className="text-brand-sub text-xs">{SUPPLIER.location}</div>
        <div className="my-2.5">
          <span className="text-brand-green rounded-sm bg-[#E8F5EE] px-2.5 py-[3px] text-[11px] font-semibold">
            ✓ Đã xác minh
          </span>
        </div>
        <button
          type="button"
          className="bg-brand-red w-full rounded py-2 text-xs font-semibold text-white"
        >
          Xem gian hàng
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold">
            <span className="bg-brand-red inline-block h-3.5 w-[3px] rounded-sm" />
            Thông tin xưởng
          </div>
          {SUPPLIER_INFO.map((item) => (
            <div key={item} className="text-brand-sub mb-1.5 flex items-start gap-2 text-xs leading-[1.5]">
              <span className="text-brand-red mt-px shrink-0">•</span>
              {item}
            </div>
          ))}
        </div>
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold">
            <span className="bg-brand-red inline-block h-3.5 w-[3px] rounded-sm" />
            Chỉ số hoạt động
          </div>
          {SUPPLIER_METRICS.map((item) => (
            <div key={item} className="text-brand-sub mb-1.5 flex items-start gap-2 text-xs leading-[1.5]">
              <span className="text-brand-red mt-px shrink-0">•</span>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
