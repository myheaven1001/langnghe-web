'use client';

import { useRef } from 'react';

// Same GET-form pattern as RfqFilterBar/OrderFilterBar.
export function ProductFilterBar({
  categories,
  status,
  q,
  category,
}: {
  categories: { id: string; name: string }[];
  status: string;
  q: string;
  category: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      method="get"
      action="/supplier/products"
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
          placeholder="Tìm theo tên sản phẩm..."
          className="border-brand-border focus:border-brand-red w-full rounded-lg border py-2 pr-3 pl-8 text-[12.5px] outline-none"
        />
      </div>

      <select
        name="category"
        defaultValue={category}
        onChange={() => formRef.current?.submit()}
        className="border-brand-border focus:border-brand-red rounded-lg border bg-white px-3 py-2 text-[12.5px] outline-none"
      >
        <option value="">Tất cả ngành hàng</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <button type="submit" className="text-brand-red text-[12.5px] font-semibold hover:underline">
        Tìm
      </button>
    </form>
  );
}
