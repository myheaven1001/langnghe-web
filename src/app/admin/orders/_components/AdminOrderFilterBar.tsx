'use client';

import { useRef } from 'react';

// Same GET-form pattern as supplier/orders' SupplierOrderFilterBar, posting
// to /admin/orders instead and searching across buyer + supplier names.
export function AdminOrderFilterBar({
  status,
  q,
  range,
}: {
  status: string;
  q: string;
  range: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      method="get"
      action="/admin/orders"
      className="mb-3.5 flex flex-wrap items-center gap-2.5"
    >
      {status !== 'all' && <input type="hidden" name="status" value={status} />}

      <div className="relative max-w-[320px] min-w-[200px] flex-1">
        <span className="text-brand-light pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs">
          🔍
        </span>
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Tìm theo tên buyer, xưởng, mã vận đơn..."
          className="border-brand-border focus:border-brand-forest w-full rounded-lg border py-2 pr-3 pl-8 text-[12.5px] outline-none"
        />
      </div>

      <select
        name="range"
        defaultValue={range}
        onChange={() => formRef.current?.submit()}
        className="border-brand-border focus:border-brand-forest rounded-lg border bg-white px-3 py-2 text-[12.5px] outline-none"
      >
        <option value="30">30 ngày qua</option>
        <option value="90">90 ngày qua</option>
        <option value="all">Toàn bộ thời gian</option>
      </select>

      <button
        type="submit"
        className="text-brand-forest text-[12.5px] font-semibold hover:underline"
      >
        Tìm
      </button>
    </form>
  );
}
