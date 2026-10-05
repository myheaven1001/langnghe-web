'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatAddressLine, type BuyerAddress } from '@/lib/addresses';

const MAX_ADDRESSES = 20;
const PHONE_PATTERN = /^[0-9+ .()-]{8,20}$/;

const INPUT =
  'border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none';

const EMPTY = {
  label: '',
  recipient_name: '',
  phone: '',
  address_line: '',
  ward: '',
  district: '',
  province: '',
  is_default: false,
};
type FormValues = typeof EMPTY;

// Ghi thẳng bảng buyer_addresses từ client — RLS chỉ cho buyer sửa sổ của
// chính mình; trigger trong DB giữ "đúng 1 địa chỉ mặc định" (địa chỉ đầu
// tiên tự thành mặc định, đặt mặc định mới thì cái cũ tự bỏ).
export function AddressBook({
  buyerId,
  addresses,
  nextHref,
}: {
  buyerId: string;
  addresses: BuyerAddress[];
  nextHref: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // null = không mở form; 'new' = thêm mới; còn lại = id đang sửa.
  const [editing, setEditing] = useState<string | null>(addresses.length === 0 ? 'new' : null);
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openForm(address?: BuyerAddress) {
    setError(null);
    setEditing(address?.id ?? 'new');
    setValues(
      address
        ? {
            label: address.label,
            recipient_name: address.recipient_name,
            phone: address.phone,
            address_line: address.address_line,
            ward: address.ward,
            district: address.district,
            province: address.province,
            is_default: address.is_default,
          }
        : EMPTY,
    );
  }

  const set = (key: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const row = {
      label: values.label.trim(),
      recipient_name: values.recipient_name.trim(),
      phone: values.phone.trim(),
      address_line: values.address_line.trim(),
      ward: values.ward.trim(),
      district: values.district.trim(),
      province: values.province.trim(),
      is_default: values.is_default,
    };
    if (row.recipient_name.length < 2) return setError('Vui lòng nhập tên người nhận.');
    if (!PHONE_PATTERN.test(row.phone))
      return setError('Số điện thoại không hợp lệ (8–20 ký tự số).');
    if (row.address_line.length < 5) return setError('Vui lòng nhập số nhà, tên đường.');
    if (row.province.length < 2) return setError('Vui lòng nhập tỉnh/thành phố.');

    setBusy(true);
    setError(null);
    const { error } =
      editing === 'new'
        ? await supabase.from('buyer_addresses').insert({ ...row, buyer_id: buyerId })
        : await supabase.from('buyer_addresses').update(row).eq('id', editing);
    setBusy(false);

    if (error) {
      setError(
        error.message.includes('ADDRESS_LIMIT_REACHED')
          ? `Mỗi tài khoản lưu tối đa ${MAX_ADDRESSES} địa chỉ.`
          : 'Không lưu được địa chỉ. Vui lòng kiểm tra lại và thử lại.',
      );
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function run(action: PromiseLike<{ error: unknown }>, failMessage: string) {
    setBusy(true);
    setError(null);
    const { error } = await action;
    setBusy(false);
    if (error) {
      setError(failMessage);
      return;
    }
    router.refresh();
  }

  const setDefault = (id: string) =>
    run(
      supabase.from('buyer_addresses').update({ is_default: true }).eq('id', id),
      'Không đặt được địa chỉ mặc định. Vui lòng thử lại.',
    );

  const remove = (a: BuyerAddress) => {
    if (!window.confirm(`Xoá địa chỉ của ${a.recipient_name}? Đơn hàng đã tạo không bị ảnh hưởng.`))
      return;
    return run(
      supabase.from('buyer_addresses').delete().eq('id', a.id),
      'Không xoá được địa chỉ. Vui lòng thử lại.',
    );
  };

  return (
    <div className="max-w-[720px]">
      {nextHref && addresses.length > 0 && (
        <div className="border-brand-green mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border bg-[#F2FBF6] px-4 py-3 text-[12.5px]">
          <span>Đã có địa chỉ giao hàng — bạn có thể quay lại chấp nhận báo giá.</span>
          <Link
            href={nextHref}
            className="bg-brand-green rounded-md px-3 py-1.5 font-semibold text-white"
          >
            ← Quay lại báo giá
          </Link>
        </div>
      )}

      {error && editing === null && (
        <div className="border-status-red-soft bg-status-red-soft text-status-red mb-3 rounded-lg border px-3 py-2 text-xs">
          {error}
        </div>
      )}

      {addresses.length === 0 && editing === null && (
        <div className="border-brand-border text-brand-sub mb-4 rounded-[10px] border bg-white px-4 py-6 text-center text-[13px]">
          Bạn chưa lưu địa chỉ giao hàng nào.
        </div>
      )}

      <div className="space-y-3">
        {addresses.map((a) => (
          <div
            key={a.id}
            className="border-brand-border rounded-[10px] border bg-white px-4 py-3.5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 text-[13px]">
                <div className="font-semibold">
                  {a.recipient_name} — {a.phone}
                  {a.label && <span className="text-brand-sub font-normal"> · {a.label}</span>}
                  {a.is_default && (
                    <span className="bg-status-green-soft text-status-green ml-2 rounded px-1.5 py-0.5 text-[10.5px] font-semibold">
                      Mặc định
                    </span>
                  )}
                </div>
                <div className="text-brand-sub mt-0.5">{formatAddressLine(a)}</div>
              </div>
              <div className="flex shrink-0 gap-3 text-xs font-semibold">
                {!a.is_default && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDefault(a.id)}
                    className="text-brand-sub hover:text-brand-ink disabled:opacity-50"
                  >
                    Đặt mặc định
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openForm(a)}
                  className="text-brand-sub hover:text-brand-ink disabled:opacity-50"
                >
                  Sửa
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(a)}
                  className="text-brand-red disabled:opacity-50"
                >
                  Xoá
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing === null ? (
        addresses.length < MAX_ADDRESSES && (
          <button
            type="button"
            onClick={() => openForm()}
            className="bg-brand-red hover:bg-brand-red-dark mt-4 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            + Thêm địa chỉ
          </button>
        )
      ) : (
        <form
          onSubmit={handleSubmit}
          className="border-brand-border mt-4 rounded-[10px] border bg-white p-[18px]"
        >
          <div className="mb-3.5 text-sm font-bold">
            {editing === 'new' ? 'Thêm địa chỉ mới' : 'Sửa địa chỉ'}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Người nhận *</span>
              <input
                className={INPUT}
                value={values.recipient_name}
                onChange={set('recipient_name')}
                maxLength={100}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Số điện thoại *</span>
              <input
                className={INPUT}
                type="tel"
                value={values.phone}
                onChange={set('phone')}
                maxLength={20}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold">Số nhà, tên đường *</span>
              <input
                className={INPUT}
                value={values.address_line}
                onChange={set('address_line')}
                maxLength={300}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Phường/xã</span>
              <input className={INPUT} value={values.ward} onChange={set('ward')} maxLength={100} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Quận/huyện (nếu có)</span>
              <input
                className={INPUT}
                value={values.district}
                onChange={set('district')}
                maxLength={100}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Tỉnh/thành phố *</span>
              <input
                className={INPUT}
                value={values.province}
                onChange={set('province')}
                maxLength={100}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Tên gợi nhớ</span>
              <input
                className={INPUT}
                value={values.label}
                onChange={set('label')}
                maxLength={50}
                placeholder="VD: Kho Hà Nội"
              />
            </label>
          </div>

          {/* Địa chỉ đang là mặc định không bỏ mặc định trực tiếp được (DB giữ nguyên). */}
          {!(editing !== 'new' && addresses.find((a) => a.id === editing)?.is_default) &&
            addresses.length > 0 && (
              <label className="mt-3 flex items-center gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={values.is_default}
                  onChange={(e) => setValues((v) => ({ ...v, is_default: e.target.checked }))}
                />
                Đặt làm địa chỉ mặc định
              </label>
            )}

          {error && (
            <div className="border-status-red-soft bg-status-red-soft text-status-red mt-3 rounded-lg border px-3 py-2 text-xs">
              {error}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="bg-brand-red hover:bg-brand-red-dark rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Đang lưu...' : 'Lưu địa chỉ'}
            </button>
            {addresses.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(null)}
                className="border-brand-border rounded-lg border px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50"
              >
                Huỷ
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
