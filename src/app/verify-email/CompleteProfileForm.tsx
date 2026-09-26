'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { completeProfile } from '@/app/auth/actions';
import PasswordPair from '@/app/auth/_components/PasswordPair';
import { BUYER_CITIES } from '@/lib/constants';

const CRAFT_CATEGORIES = ['Gốm sứ', 'Mây tre đan', 'Đồ gỗ', 'Lụa & thêu', 'Sơn mài', 'Đúc đồng'];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-[#E53333] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c62828] disabled:cursor-not-allowed disabled:bg-[#E0DDD8]"
    >
      {pending ? '⏳ Đang lưu...' : 'Hoàn tất hồ sơ →'}
    </button>
  );
}

// Matches step 2 ("Thông tin công ty"/"Thông tin xưởng") of
// register_buyer_supplier.html, scoped down to only the fields that exist
// on buyer_profiles/supplier_profiles today (no category-đa-lựa-chọn, quy
// mô, mục đích mua, số thợ, mô tả, hay upload ảnh/GPKD — những field đó
// chưa có cột tương ứng, để dành cho /settings/profile ở Giai đoạn 3.7).
export default function CompleteProfileForm({
  email,
  mode,
  role,
  next,
}: {
  email: string;
  mode: 'register' | 'reset';
  role: 'buyer' | 'supplier';
  next?: string | null;
}) {
  const defaultName = email.split('@')[0];
  const [craftCategory, setCraftCategory] = useState(CRAFT_CATEGORIES[0]);

  return (
    <div className="w-full max-w-[340px] text-left">
      <div className="mb-1.5 text-center text-[22px] font-bold">Hoàn thiện hồ sơ</div>
      <div className="mb-6 text-center text-[13px] leading-[1.6] text-[#555]">
        {role === 'buyer'
          ? 'Giúp xưởng hiểu về bạn và ưu tiên báo giá tốt hơn.'
          : 'Buyer sẽ thấy thông tin này trên gian hàng của bạn.'}
      </div>

      <form action={completeProfile} className="flex flex-col gap-3.5">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="role" value={role} />
        {next && <input type="hidden" name="next" value={next} />}

        {mode === 'reset' && (
          <>
            <PasswordPair
              passwordLabel="Mật khẩu mới *"
              confirmLabel="Nhập lại mật khẩu *"
              hint="Ít nhất 8 ký tự — tài khoản này chưa có mật khẩu đăng nhập."
            />
          </>
        )}

        {role === 'buyer' ? (
          <>
            <div>
              <label htmlFor="companyName" className="mb-1.5 block text-xs font-semibold">
                Tên công ty / cửa hàng <span className="text-[#E53333]">*</span>
              </label>
              <input
                id="companyName"
                name="companyName"
                type="text"
                required
                defaultValue={defaultName}
                placeholder="Shop Decor Hà Nội"
                className="w-full rounded-md border-[1.5px] border-[#E0DDD8] px-3 py-2.5 text-[13px] outline-none focus:border-[#E53333]"
              />
            </div>
            <div>
              <label htmlFor="city" className="mb-1.5 block text-xs font-semibold">
                Tỉnh / Thành phố
              </label>
              <select
                id="city"
                name="city"
                defaultValue=""
                className="w-full rounded-md border-[1.5px] border-[#E0DDD8] bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#E53333]"
              >
                <option value="">-- Chọn --</option>
                {BUYER_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="taxCode" className="mb-1.5 block text-xs font-semibold">
                Mã số thuế
              </label>
              <input
                id="taxCode"
                name="taxCode"
                type="text"
                placeholder="0100000000 (nếu có)"
                className="w-full rounded-md border-[1.5px] border-[#E0DDD8] px-3 py-2.5 text-[13px] outline-none focus:border-[#E53333]"
              />
              <div className="mt-1.5 text-[11px] text-[#999]">
                Không bắt buộc — giúp tăng uy tín
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="shopName" className="mb-1.5 block text-xs font-semibold">
                Tên xưởng / thương hiệu <span className="text-[#E53333]">*</span>
              </label>
              <input
                id="shopName"
                name="shopName"
                type="text"
                required
                defaultValue={defaultName}
                placeholder="Xưởng Gốm Thiên Phú"
                className="w-full rounded-md border-[1.5px] border-[#E0DDD8] px-3 py-2.5 text-[13px] outline-none focus:border-[#E53333]"
              />
            </div>
            <div>
              <label htmlFor="villageOrigin" className="mb-1.5 block text-xs font-semibold">
                Làng nghề xuất xứ
              </label>
              <input
                id="villageOrigin"
                name="villageOrigin"
                type="text"
                placeholder="Bát Tràng, Gia Lâm, Hà Nội"
                className="w-full rounded-md border-[1.5px] border-[#E0DDD8] px-3 py-2.5 text-[13px] outline-none focus:border-[#E53333]"
              />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold">Ngành hàng chính</div>
              <input type="hidden" name="craftCategory" value={craftCategory} />
              <div className="flex flex-wrap gap-1.5">
                {CRAFT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCraftCategory(cat)}
                    className={`rounded-full border-[1.5px] px-2.5 py-1 text-xs transition-colors ${
                      cat === craftCategory
                        ? 'border-[#1A3A2A] bg-[#1A3A2A] text-white'
                        : 'border-[#E0DDD8] text-[#555]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="foundingYear" className="mb-1.5 block text-xs font-semibold">
                  Năm thành lập
                </label>
                <input
                  id="foundingYear"
                  name="foundingYear"
                  type="number"
                  min={1900}
                  max={2025}
                  placeholder="2005"
                  className="w-full rounded-md border-[1.5px] border-[#E0DDD8] px-3 py-2.5 text-[13px] outline-none focus:border-[#E53333]"
                />
              </div>
              <div>
                <label htmlFor="monthlyCapacity" className="mb-1.5 block text-xs font-semibold">
                  Công suất/tháng
                </label>
                <input
                  id="monthlyCapacity"
                  name="monthlyCapacity"
                  type="number"
                  min={0}
                  placeholder="2000"
                  className="w-full rounded-md border-[1.5px] border-[#E0DDD8] px-3 py-2.5 text-[13px] outline-none focus:border-[#E53333]"
                />
              </div>
            </div>
          </>
        )}

        <SubmitButton />
      </form>

      <div className="mt-4 text-center text-[11px] text-[#999]">
        Chỉ {role === 'buyer' ? 'tên công ty/cửa hàng' : 'tên xưởng'} là bắt buộc — các mục còn lại
        có thể bổ sung sau.
      </div>
    </div>
  );
}
