'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const CAPACITY_OPTIONS = [
  { value: '', label: '-- Chưa rõ --' },
  { value: '250', label: 'Dưới 500 sản phẩm' },
  { value: '2500', label: '500 – 5.000 sản phẩm' },
  { value: '12500', label: '5.000 – 20.000 sản phẩm' },
  { value: '25000', label: 'Trên 20.000 sản phẩm' },
];

// Update trực tiếp — RLS supplier_profiles_modify_own (FOR ALL) đã cho
// phép supplier tự sửa hồ sơ của mình, không cần RPC.
export function WorkshopForm({
  userId,
  categories,
  shopName,
  villageOrigin,
  taxCode,
  craftCategory,
  foundingYear,
  monthlyCapacity,
}: {
  userId: string;
  categories: { id: string; name: string }[];
  shopName: string;
  villageOrigin: string | null;
  taxCode: string | null;
  craftCategory: string | null;
  foundingYear: number | null;
  monthlyCapacity: number | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [values, setValues] = useState({
    shopName,
    villageOrigin: villageOrigin ?? '',
    taxCode: taxCode ?? '',
    craftCategory: craftCategory ?? '',
    foundingYear: foundingYear != null ? String(foundingYear) : '',
    monthlyCapacity: monthlyCapacity != null ? String(monthlyCapacity) : '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.shopName.trim()) {
      setError('Vui lòng nhập tên xưởng / thương hiệu.');
      return;
    }
    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from('supplier_profiles')
      .update({
        shop_name: values.shopName.trim(),
        village_origin: values.villageOrigin.trim() || null,
        tax_code: values.taxCode.trim() || null,
        craft_category: values.craftCategory || null,
        founding_year: values.foundingYear ? Number(values.foundingYear) : null,
        monthly_capacity: values.monthlyCapacity ? Number(values.monthlyCapacity) : null,
      })
      .eq('user_id', userId);

    setSaving(false);
    if (error) {
      setError('Không thể lưu thay đổi. Vui lòng thử lại.');
      return;
    }

    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
          Tên xưởng / thương hiệu <span className="text-brand-red">*</span>
        </div>
        <input
          value={values.shopName}
          onChange={(e) => setValues((v) => ({ ...v, shopName: e.target.value }))}
          className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div>
          <div className="mb-1.5 text-xs font-semibold">Làng nghề xuất xứ</div>
          <input
            value={values.villageOrigin}
            onChange={(e) => setValues((v) => ({ ...v, villageOrigin: e.target.value }))}
            placeholder="Bát Tràng, Gia Lâm, Hà Nội"
            className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
          />
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold">Mã số thuế</div>
          <input
            value={values.taxCode}
            onChange={(e) => setValues((v) => ({ ...v, taxCode: e.target.value }))}
            className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
          />
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1.5 text-xs font-semibold">Ngành hàng chính</div>
        <select
          value={values.craftCategory}
          onChange={(e) => setValues((v) => ({ ...v, craftCategory: e.target.value }))}
          className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] bg-white px-3 py-2.5 text-[13px] outline-none"
        >
          <option value="">-- Chọn ngành hàng --</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div>
          <div className="mb-1.5 text-xs font-semibold">Năm thành lập</div>
          <input
            type="number"
            value={values.foundingYear}
            onChange={(e) => setValues((v) => ({ ...v, foundingYear: e.target.value }))}
            min={1900}
            max={2100}
            className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
          />
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold">Công suất sản xuất / tháng</div>
          <select
            value={values.monthlyCapacity}
            onChange={(e) => setValues((v) => ({ ...v, monthlyCapacity: e.target.value }))}
            className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] bg-white px-3 py-2.5 text-[13px] outline-none"
          >
            {CAPACITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="text-brand-red mb-3 text-[11.5px]">{error}</div>}

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={saving}
          className={`rounded-lg px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-60 ${
            saved ? 'bg-brand-green' : 'bg-brand-red hover:bg-brand-red-dark'
          }`}
        >
          {saving ? 'Đang lưu...' : saved ? '✓ Đã lưu' : 'Lưu thay đổi'}
        </button>
      </div>
    </form>
  );
}
