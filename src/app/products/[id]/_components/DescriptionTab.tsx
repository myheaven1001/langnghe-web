import { DESCRIPTION_FEATURES, DESCRIPTION_SPECS, ORDER_NOTES } from './data';

function DescBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold">
        <span className="bg-brand-red inline-block h-3.5 w-[3px] rounded-sm" />
        {title}
      </div>
      {items.map((item) => (
        <div key={item} className="text-brand-sub mb-1.5 flex items-start gap-2 text-xs leading-[1.5]">
          <span className="text-brand-red mt-px shrink-0">•</span>
          {item}
        </div>
      ))}
    </div>
  );
}

// Matches #tab-desc from the prototype.
export function DescriptionTab() {
  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <DescBlock title="Đặc điểm sản phẩm" items={DESCRIPTION_FEATURES} />
        <DescBlock title="Thông số kỹ thuật" items={DESCRIPTION_SPECS} />
      </div>
      <div className="mt-2">
        <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold">
          <span className="bg-brand-red inline-block h-3.5 w-[3px] rounded-sm" />
          Lưu ý khi đặt hàng
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {ORDER_NOTES.map((note) => (
            <div key={note} className="text-brand-sub flex items-start gap-2 text-xs leading-[1.5]">
              <span className="text-brand-red mt-px shrink-0">•</span>
              {note}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
