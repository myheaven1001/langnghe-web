'use client';

import { useRef } from 'react';

// Same GET-form pattern as RfqFilterBar (see src/app/rfq/_components) — a
// real server query round-trip through /orders' own searchParams, works
// without JS too.
export function OrderFilterBar({
  status,
  q,
  range,
  sort,
}: {
  status: string;
  q: string;
  range: string;
  sort: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      method="get"
      action="/orders"
      className="mb-3.5 flex flex-wrap items-center gap-2.5"
    >
      {status !== 'all' && <input type="hidden" name="status" value={status} />}

      <div className="relative min-w-[200px] max-w-[320px] flex-1">
        <span className="text-brand-light pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs">
          🔍
        </span>
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Tìm theo tên xưởng, mã vận đơn..."
          className="border-brand-border focus:border-brand-red w-full rounded-lg border py-2 pr-3 pl-8 text-[12.5px] outline-none"
        />
      </div>

      <select
        name="range"
        defaultValue={range}
        onChange={() => formRef.current?.submit()}
        className="border-brand-border focus:border-brand-red rounded-lg border bg-white px-3 py-2 text-[12.5px] outline-none"
      >
        <option value="30">30 ngày qua</option>
        <option value="90">90 ngày qua</option>
        <option value="all">Toàn bộ thời gian</option>
      </select>

      <select
        name="sort"
        defaultValue={sort}
        onChange={() => formRef.current?.submit()}
        className="border-brand-border focus:border-brand-red rounded-lg border bg-white px-3 py-2 text-[12.5px] outline-none"
      >
        <option value="newest">Mới nhất</option>
        <option value="value">Giá trị cao nhất</option>
      </select>

      <button type="submit" className="text-brand-red text-[12.5px] font-semibold hover:underline">
        Tìm
      </button>
    </form>
  );
}
