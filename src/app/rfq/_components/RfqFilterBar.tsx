'use client';

import { useRef } from 'react';

// GET form that round-trips through /rfq's own searchParams, so filtering
// stays a real server query (see page.tsx) instead of client-side hide/show
// like the rfq_list_page.html prototype did. Selects auto-submit; the text
// input relies on Enter / the (visually hidden) submit button, which also
// keeps this working with JS disabled.
export function RfqFilterBar({
  categories,
  status,
  q,
  category,
  sort,
}: {
  categories: { id: string; name: string }[];
  status: string;
  q: string;
  category: string;
  sort: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      method="get"
      action="/rfq"
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
          placeholder="Tìm theo tiêu đề RFQ..."
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

      <select
        name="sort"
        defaultValue={sort}
        onChange={() => formRef.current?.submit()}
        className="border-brand-border focus:border-brand-red rounded-lg border bg-white px-3 py-2 text-[12.5px] outline-none"
      >
        <option value="newest">Mới nhất</option>
        <option value="deadline">Sắp hết hạn</option>
      </select>

      <button
        type="submit"
        className="text-brand-red text-[12.5px] font-semibold hover:underline"
      >
        Tìm
      </button>
    </form>
  );
}
