'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const CARRIERS = ['GHTK', 'GHN', 'Viettel Post', 'Tự vận chuyển'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_BANNER_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Logo/banner: upload lên bucket product-media (đã public — xem
// 20260923090100_product_media_bucket.sql), path {supplier_id}/shop/... —
// policy bucket chỉ kiểm tra segment đầu nên dùng lại được, không cần
// bucket riêng. Các field còn lại update thẳng supplier_profiles — RLS
// supplier_profiles_modify_own đã cho phép, không cần RPC.
export function ShopSettingsForm({
  userId,
  supplierId,
  logoUrl,
  bannerUrl,
  contactPhone,
  contactZalo,
  workingHours,
  websiteUrl,
  preferredCarriers,
  defaultProcessingDays,
}: {
  userId: string;
  supplierId: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  contactPhone: string | null;
  contactZalo: string | null;
  workingHours: string | null;
  websiteUrl: string | null;
  preferredCarriers: string[];
  defaultProcessingDays: number | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [logo, setLogo] = useState(logoUrl);
  const [banner, setBanner] = useState(bannerUrl);
  const [contactPhoneVal, setContactPhoneVal] = useState(contactPhone ?? '');
  const [contactZaloVal, setContactZaloVal] = useState(contactZalo ?? '');
  const [workingHoursVal, setWorkingHoursVal] = useState(workingHours ?? '');
  const [websiteUrlVal, setWebsiteUrlVal] = useState(websiteUrl ?? '');
  const [carriers, setCarriers] = useState(new Set(preferredCarriers));
  const [processingDays, setProcessingDays] = useState(
    defaultProcessingDays != null ? String(defaultProcessingDays) : '',
  );

  const [uploading, setUploading] = useState<'logo' | 'banner' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadImage(file: File, kind: 'logo' | 'banner') {
    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.');
      return;
    }
    const maxBytes = kind === 'logo' ? MAX_LOGO_BYTES : MAX_BANNER_BYTES;
    if (file.size > maxBytes) {
      setError(`File vượt quá ${maxBytes / (1024 * 1024)}MB.`);
      return;
    }

    setUploading(kind);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${supplierId}/shop/${kind}-${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage.from('product-media').upload(path, file, {
      upsert: false,
    });
    if (uploadError) {
      setUploading(null);
      setError('Không thể tải ảnh lên. Vui lòng thử lại.');
      return;
    }

    const { data: pub } = supabase.storage.from('product-media').getPublicUrl(path);
    const column = kind === 'logo' ? 'logo_url' : 'banner_url';
    const { error: updateError } = await supabase
      .from('supplier_profiles')
      .update({ [column]: pub.publicUrl })
      .eq('id', supplierId);

    setUploading(null);
    if (updateError) {
      setError('Đã tải ảnh lên nhưng không lưu được. Vui lòng thử lại.');
      return;
    }

    if (kind === 'logo') setLogo(pub.publicUrl);
    else setBanner(pub.publicUrl);
    router.refresh();
  }

  function toggleCarrier(name: string) {
    setCarriers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from('supplier_profiles')
      .update({
        contact_phone: contactPhoneVal.trim() || null,
        contact_zalo: contactZaloVal.trim() || null,
        working_hours: workingHoursVal.trim() || null,
        website_url: websiteUrlVal.trim() || null,
        preferred_carriers: Array.from(carriers),
        default_processing_days: processingDays ? Number(processingDays) : null,
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
      <div className="mb-1.5 text-xs font-semibold">Banner gian hàng</div>
      <div
        className="relative mb-2.5 flex h-[120px] w-full items-center justify-center overflow-hidden rounded-[10px] text-[13px] text-white/60"
        style={{ background: banner ? undefined : 'linear-gradient(120deg,#1A3A2A,#2d5a3d)' }}
      >
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage public URL
          <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {!banner && '1200 × 300px khuyến nghị'}
        <button
          type="button"
          disabled={uploading !== null}
          onClick={() => bannerInputRef.current?.click()}
          className="absolute right-2.5 bottom-2.5 rounded-md bg-black/55 px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-60"
        >
          {uploading === 'banner' ? '⏳ Đang tải...' : '📷 Đổi banner'}
        </button>
      </div>
      <input
        ref={bannerInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadImage(file, 'banner');
          e.target.value = '';
        }}
      />
      <div className="text-brand-light mb-4 text-[11px]">Hiển thị ở đầu gian hàng công khai. JPG/PNG/WebP, tối đa 5MB.</div>

      <div className="mb-1.5 text-xs font-semibold">Logo gian hàng</div>
      <div className="mb-1 flex items-center gap-3.5">
        <div className="bg-brand-red flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-xl text-3xl text-white">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage public URL
            <img src={logo} alt="" className="h-full w-full object-cover" />
          ) : (
            '🏭'
          )}
        </div>
        <button
          type="button"
          disabled={uploading !== null}
          onClick={() => logoInputRef.current?.click()}
          className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink rounded-md border-[1.5px] px-3.5 py-2 text-[11.5px] font-semibold disabled:opacity-60"
        >
          {uploading === 'logo' ? '⏳ Đang tải...' : '📷 Đổi logo'}
        </button>
      </div>
      <input
        ref={logoInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadImage(file, 'logo');
          e.target.value = '';
        }}
      />
      <div className="text-brand-light mb-5 text-[11px]">Hình vuông, tối thiểu 200×200px. JPG/PNG/WebP, tối đa 2MB.</div>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div>
          <div className="mb-1.5 text-xs font-semibold">Hotline</div>
          <input
            value={contactPhoneVal}
            onChange={(e) => setContactPhoneVal(e.target.value)}
            placeholder="0977 654 321"
            className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
          />
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold">Zalo/WhatsApp</div>
          <input
            value={contactZaloVal}
            onChange={(e) => setContactZaloVal(e.target.value)}
            placeholder="0977 654 321"
            className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
          />
        </div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-2.5">
        <div>
          <div className="mb-1.5 text-xs font-semibold">Giờ làm việc</div>
          <input
            value={workingHoursVal}
            onChange={(e) => setWorkingHoursVal(e.target.value)}
            placeholder="8:00 – 17:30, Thứ 2 – Thứ 7"
            className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
          />
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold">Website (không bắt buộc)</div>
          <input
            value={websiteUrlVal}
            onChange={(e) => setWebsiteUrlVal(e.target.value)}
            placeholder="https://gomthienphu.vn"
            className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
          />
        </div>
      </div>

      <div className="mb-1.5 text-xs font-semibold">Đơn vị vận chuyển ưu tiên</div>
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        {CARRIERS.map((c) => (
          <label
            key={c}
            className={`flex cursor-pointer items-center gap-2.5 rounded-lg border-[1.5px] px-3 py-2.5 ${
              carriers.has(c) ? 'border-brand-red bg-[#FFF8F8]' : 'border-brand-border'
            }`}
          >
            <input
              type="checkbox"
              checked={carriers.has(c)}
              onChange={() => toggleCarrier(c)}
              className="accent-brand-red h-4 w-4"
            />
            <span className="text-[12.5px] font-semibold">{c}</span>
          </label>
        ))}
      </div>

      <div className="mb-1">
        <div className="mb-1.5 text-xs font-semibold">Thời gian xử lý đơn mặc định (ngày)</div>
        <input
          type="number"
          value={processingDays}
          onChange={(e) => setProcessingDays(e.target.value)}
          className="border-brand-border focus:border-brand-red w-full max-w-[140px] rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none"
        />
        <div className="text-brand-light mt-1 text-[11px]">
          Thời gian từ lúc xác nhận thanh toán đến khi bắt đầu sản xuất.
        </div>
      </div>

      {error && <div className="text-brand-red mt-3 text-[11.5px]">{error}</div>}

      <div className="mt-4 flex justify-end">
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
