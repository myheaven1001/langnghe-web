'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface ToggleDef {
  key: 'show_phone_public' | 'show_address_public' | 'allow_direct_message' | 'is_hidden';
  label: string;
  sub: string;
}

const TOGGLES: ToggleDef[] = [
  {
    key: 'show_phone_public',
    label: 'Hiển thị số điện thoại công khai',
    sub: 'Buyer có thể gọi trực tiếp mà không cần nhắn tin trước',
  },
  {
    key: 'show_address_public',
    label: 'Hiển thị địa chỉ chi tiết',
    sub: 'Ẩn để chỉ hiện tỉnh/thành nếu muốn bảo mật vị trí xưởng',
  },
  {
    key: 'allow_direct_message',
    label: 'Cho phép nhắn tin trực tiếp',
    sub: 'Buyer chưa gửi RFQ vẫn có thể nhắn tin hỏi trước',
  },
  {
    key: 'is_hidden',
    label: 'Tạm ẩn toàn bộ gian hàng',
    sub: 'Ẩn khỏi tìm kiếm và không nhận RFQ mới (VD: nghỉ Tết)',
  },
];

function Switch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="relative inline-block h-[22px] w-[38px] shrink-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute h-0 w-0 opacity-0"
      />
      <span className="bg-brand-border peer-checked:bg-brand-green absolute inset-0 cursor-pointer rounded-full transition-colors after:absolute after:top-[3px] after:left-[3px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  );
}

// Autosave từng công tắc — cùng pattern với /settings/notifications (3.8).
// Cột is_hidden lưu thật, nhưng CHƯA có nơi nào ở tầng public (tìm kiếm,
// multi-RFQ category-match) lọc theo cột này — các trang duyệt công khai
// (search/category) vẫn dùng dữ liệu cứng từ Giai đoạn 2, chưa nối query
// thật, nên chưa có gì để lọc. Sẽ cần cập nhật khi các trang đó nối dữ liệu
// thật.
export function VisibilityToggles({
  supplierId,
  initial,
}: {
  supplierId: string;
  initial: Record<ToggleDef['key'], boolean>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: ToggleDef['key'], next: boolean) {
    const prev = values;
    setValues((v) => ({ ...v, [key]: next }));
    setError(null);

    const { error } = await supabase.from('supplier_profiles').update({ [key]: next }).eq('id', supplierId);
    if (error) {
      setValues(prev);
      setError('Không thể lưu thay đổi. Vui lòng thử lại.');
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {TOGGLES.map((t) => (
        <div key={t.key} className="flex items-center justify-between border-b border-[#F2F0EC] py-3 last:border-b-0">
          <div>
            <div className="text-[12.5px] font-semibold">{t.label}</div>
            <div className="text-brand-light mt-0.5 text-[11px]">{t.sub}</div>
          </div>
          <Switch checked={values[t.key]} onChange={(next) => toggle(t.key, next)} />
        </div>
      ))}
      {error && <div className="text-brand-red mt-2 text-[11.5px]">{error}</div>}
    </div>
  );
}
