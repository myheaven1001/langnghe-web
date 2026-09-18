'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BUYER_CITIES } from '@/lib/constants';

// Update trực tiếp từ client — an toàn vì buyer_profiles_modify_own (RLS,
// FOR ALL) đã cho phép buyer tự sửa hồ sơ của chính mình, không cần RPC.
export function ProfileForm({
  userId,
  companyName,
  taxCode,
  city,
  address,
}: {
  userId: string;
  companyName: string;
  taxCode: string | null;
  city: string | null;
  address: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [values, setValues] = useState({
    companyName,
    taxCode: taxCode ?? '',
    city: city ?? '',
    address: address ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.companyName.trim()) {
      setError('Vui lòng nhập tên công ty / cửa hàng.');
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from('buyer_profiles')
      .update({
        company_name: values.companyName.trim(),
        tax_code: values.taxCode.trim() || null,
        city: values.city || null,
        address: values.address.trim() || null,
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
          Tên công ty / cửa hàng <span className="text-brand-red">*</span>
        </div>
        <input
          type="text"
          value={values.companyName}
          onChange={(e) => setValues((v) => ({ ...v, companyName: e.target.value }))}
          className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div>
          <div className="mb-1.5 text-xs font-semibold">Mã số thuế</div>
          <input
            type="text"
            value={values.taxCode}
            onChange={(e) => setValues((v) => ({ ...v, taxCode: e.target.value }))}
            className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
            Tỉnh / Thành phố <span className="text-brand-red">*</span>
          </div>
          <select
            value={values.city}
            onChange={(e) => setValues((v) => ({ ...v, city: e.target.value }))}
            className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] bg-white px-3 py-2.5 text-[13px] outline-none"
          >
            <option value="">-- Chọn --</option>
            {BUYER_CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1.5 text-xs font-semibold">Địa chỉ chi tiết</div>
        <input
          type="text"
          value={values.address}
          onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
          placeholder="Số nhà, đường, phường/xã, quận/huyện"
          className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
        />
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
