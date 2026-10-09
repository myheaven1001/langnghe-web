'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, Input, Pill, Select } from '@/components/ui';
import { adminErrorMessage } from '../../_lib/errors';

export interface CategoryRow {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  productCount: number;
}

interface FormState {
  id: string | null;
  name: string;
  parentId: string;
  icon: string;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  id: null,
  name: '',
  parentId: '',
  icon: '',
  sortOrder: '0',
  isActive: true,
};

// Danh mục ngành hàng dạng cây 2 tầng (kế hoạch 4.11). Thêm / sửa qua RPC
// admin_save_category() — có nhật ký. Không có xoá: ẩn danh mục (is_active =
// false) để sản phẩm và link cũ không gãy.
export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roots = categories
    .filter((c) => !c.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'vi'));
  const childrenOf = (id: string) =>
    categories
      .filter((c) => c.parent_id === id)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'vi'));
  const editingHasChildren = !!form?.id && categories.some((c) => c.parent_id === form.id);

  function open(next: FormState) {
    setError(null);
    setForm(next);
  }

  function edit(c: CategoryRow) {
    open({
      id: c.id,
      name: c.name,
      parentId: c.parent_id ?? '',
      icon: c.icon ?? '',
      sortOrder: String(c.sort_order),
      isActive: c.is_active,
    });
  }

  async function save(values: FormState) {
    if (values.name.trim().length < 2) {
      setError('Tên danh mục cần ít nhất 2 ký tự.');
      return false;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('admin_save_category', {
      p_id: values.id,
      p_name: values.name,
      p_parent_id: values.parentId || null,
      p_icon: values.icon,
      p_sort_order: Number(values.sortOrder) || 0,
      p_is_active: values.isActive,
    });
    setBusy(false);
    if (error) {
      setError(adminErrorMessage(error.message, 'Không lưu được danh mục. Vui lòng thử lại.'));
      return false;
    }
    router.refresh();
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form && (await save(form))) setForm(null);
  }

  const toggleActive = (c: CategoryRow) =>
    save({
      id: c.id,
      name: c.name,
      parentId: c.parent_id ?? '',
      icon: c.icon ?? '',
      sortOrder: String(c.sort_order),
      isActive: !c.is_active,
    });

  function renderRow(c: CategoryRow, child = false) {
    return (
      <div
        key={c.id}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[#F2F0EC] py-2.5 last:border-b-0 ${
          child ? 'pl-7' : ''
        } ${c.is_active ? '' : 'opacity-60'}`}
      >
        <div className="min-w-0 flex-1 basis-[180px]">
          <div className={`text-sm break-words ${child ? '' : 'font-bold'}`}>
            {c.icon ? `${c.icon} ` : ''}
            {c.name}
          </div>
          <div className="text-brand-sub text-xs break-all">
            /{c.slug} · {c.productCount} sản phẩm · thứ tự {c.sort_order}
          </div>
        </div>
        {!c.is_active && <Pill tone="gray">Đang ẩn</Pill>}
        <div className="ml-auto flex shrink-0 gap-1.5">
          <Button variant="ghost" disabled={busy} onClick={() => edit(c)}>
            Sửa
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => toggleActive(c)}>
            {c.is_active ? 'Ẩn' : 'Hiện lại'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="border-brand-border min-w-0 rounded-[10px] border bg-white px-4 py-2">
        {roots.length === 0 && (
          <div className="text-brand-sub py-6 text-center text-[13px]">Chưa có danh mục nào.</div>
        )}
        {roots.map((root) => (
          <div key={root.id}>
            {renderRow(root)}
            {childrenOf(root.id).map((child) => renderRow(child, true))}
          </div>
        ))}
        {error && !form && <div className="text-brand-red py-2 text-[13px]">{error}</div>}
      </div>

      <div className="min-w-0">
        {form ? (
          <form
            onSubmit={submit}
            className="border-brand-border rounded-[10px] border bg-white p-4"
          >
            <h2 className="mb-3 text-[15px] font-bold">
              {form.id ? 'Sửa danh mục' : 'Thêm danh mục'}
            </h2>
            <div className="flex flex-col gap-3">
              <Field label="Tên danh mục" required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={100}
                  placeholder="VD: Gốm sứ"
                />
              </Field>
              <Field
                label="Thuộc danh mục"
                hint={
                  editingHasChildren
                    ? 'Danh mục đang có danh mục con nên phải là danh mục gốc.'
                    : 'Để trống nếu là danh mục gốc.'
                }
              >
                <Select
                  value={form.parentId}
                  disabled={editingHasChildren}
                  onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                >
                  <option value="">— Danh mục gốc —</option>
                  {roots
                    .filter((r) => r.id !== form.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Biểu tượng" hint="Một emoji.">
                  <Input
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    maxLength={8}
                    placeholder="🏺"
                  />
                </Field>
                <Field label="Thứ tự" hint="Số nhỏ hiện trước.">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  />
                </Field>
              </div>
              <label className="flex min-h-10 items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="accent-brand-red h-5 w-5"
                />
                Hiện trên sàn
              </label>
              {form.id && (
                <div className="text-brand-sub text-xs">
                  Đổi tên không đổi đường dẫn của danh mục, nên link cũ vẫn chạy.
                </div>
              )}
            </div>
            {error && <div className="text-brand-red mt-3 text-[13px]">{error}</div>}
            <div className="mt-4 flex gap-2">
              <Button type="submit" variant="forest" disabled={busy}>
                {busy ? 'Đang lưu...' : 'Lưu'}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setForm(null)}>
                Hủy
              </Button>
            </div>
          </form>
        ) : (
          <Button onClick={() => open(EMPTY)}>+ Thêm danh mục</Button>
        )}
      </div>
    </div>
  );
}
