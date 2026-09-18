'use client';

import { useRef } from 'react';

// Same GET-form pattern as admin/orders' AdminOrderFilterBar — search chỉ
// theo tên (company_name/shop_name), không theo email: public.users không
// lưu email (sống ở auth.users, ngoài tầm truy vấn của client thường) —
// xem comment ở page.tsx.
export function AdminUserFilterBar({
  tab,
  q,
  sort,
  sorts,
}: {
  tab: string;
  q: string;
  sort: string;
  sorts: readonly { key: string; label: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      method="get"
      action="/admin/users"
      className="mb-3.5 flex flex-wrap items-center gap-2.5"
    >
      {tab !== 'all' && <input type="hidden" name="tab" value={tab} />}

      <div className="relative max-w-[320px] min-w-[200px] flex-1">
        <span className="text-brand-light pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs">
          🔍
        </span>
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Tìm theo tên..."
          className="border-brand-border focus:border-brand-forest w-full rounded-lg border py-2 pr-3 pl-8 text-[12.5px] outline-none"
        />
      </div>

      <select
        name="sort"
        defaultValue={sort}
        onChange={() => formRef.current?.submit()}
        className="border-brand-border focus:border-brand-forest rounded-lg border bg-white px-3 py-2 text-[12.5px] outline-none"
      >
        {sorts.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
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
