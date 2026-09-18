'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardBody, CardHeader } from '@/components/ui';
import { formatVnd } from '@/lib/format';

interface PriceTierInput {
  minQty: string;
  maxQty: string;
  unitPrice: string;
}

interface VariantInput {
  color: string;
  size: string;
  material: string;
  stockQty: string;
  sku: string;
}

interface ExistingMedia {
  id: string;
  path: string;
  url: string;
  isPrimary: boolean;
}

interface ProductFormInitial {
  name: string;
  categoryId: string;
  description: string;
  acceptOem: boolean;
  acceptCustom: boolean;
  minOrderQty: string;
  leadTimeDays: string;
  status: string;
  priceTiers: PriceTierInput[];
  variants: VariantInput[];
  media: ExistingMedia[];
}

const EMPTY_TIER: PriceTierInput = { minQty: '', maxQty: '', unitPrice: '' };
const EMPTY_VARIANT: VariantInput = { color: '', size: '', material: '', stockQty: '', sku: '' };

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Không có RPC atomic ở đây (khác accept-quote/create-rfq) — tạo/sửa sản
// phẩm là việc riêng của 1 supplier trên chính hàng của họ, không có tác
// dụng phụ sang buyer/supplier khác cần bảo vệ atomic; lỗi giữa chừng chỉ
// để lại 1 dòng products nháp mà chính họ sửa/xóa lại được, không phải rủi
// ro như order/quote 2 bên.
export function ProductForm({
  mode,
  productId,
  supplierId,
  categories,
  initial,
}: {
  mode: 'create' | 'edit';
  productId?: string;
  supplierId: string;
  categories: { id: string; name: string }[];
  initial?: ProductFormInitial;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [acceptOem, setAcceptOem] = useState(initial?.acceptOem ?? false);
  const [acceptCustom, setAcceptCustom] = useState(initial?.acceptCustom ?? false);
  const [minOrderQty, setMinOrderQty] = useState(initial?.minOrderQty ?? '');
  const [leadTimeDays, setLeadTimeDays] = useState(initial?.leadTimeDays ?? '');
  const [tiers, setTiers] = useState<PriceTierInput[]>(initial?.priceTiers.length ? initial.priceTiers : [EMPTY_TIER]);
  const [variants, setVariants] = useState<VariantInput[]>(initial?.variants ?? []);
  const [existingMedia, setExistingMedia] = useState<ExistingMedia[]>(initial?.media ?? []);
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<'draft' | 'active' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const previewThumb = existingMedia[0]?.url ?? (pendingFiles[0] ? URL.createObjectURL(pendingFiles[0]) : null);
  const lowestTier = tiers
    .map((t) => Number(t.unitPrice))
    .filter((n) => n > 0)
    .sort((a, b) => a - b)[0];

  function addFiles(files: FileList | null) {
    if (!files) return;
    const totalCount = existingMedia.length + pendingFiles.length + files.length;
    if (totalCount > 10) {
      setSubmitError('Tối đa 10 ảnh cho mỗi sản phẩm.');
      return;
    }
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function removeExistingMedia(id: string) {
    setExistingMedia((prev) => prev.filter((m) => m.id !== id));
    setRemovedMediaIds((prev) => [...prev, id]);
  }

  function updateTier(i: number, patch: Partial<PriceTierInput>) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  function updateVariant(i: number, patch: Partial<VariantInput>) {
    setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }

  function validate() {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Vui lòng nhập tên sản phẩm.';
    if (!categoryId) next.category = 'Vui lòng chọn ngành hàng.';
    if (!description.trim()) next.description = 'Vui lòng mô tả sản phẩm.';
    const moq = Number(minOrderQty);
    if (!minOrderQty || moq < 1) next.minOrderQty = 'Nhập số lượng đặt tối thiểu hợp lệ.';
    const lead = Number(leadTimeDays);
    if (!leadTimeDays || lead < 1) next.leadTimeDays = 'Nhập thời gian sản xuất hợp lệ.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function uploadPendingMedia(targetProductId: string, startSortOrder: number) {
    const uploaded: { r2_key: string; cdn_url: string; is_primary: boolean; sort_order: number }[] = [];
    for (let i = 0; i < pendingFiles.length; i++) {
      const file = pendingFiles[i];
      const path = `${supplierId}/${targetProductId}/${Date.now()}-${i}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from('product-media').upload(path, file);
      if (uploadError) throw new Error('Không thể tải ảnh lên. Vui lòng thử lại.');
      const { data: pub } = supabase.storage.from('product-media').getPublicUrl(path);
      uploaded.push({
        r2_key: path,
        cdn_url: pub.publicUrl,
        is_primary: existingMedia.length === 0 && uploaded.length === 0,
        sort_order: startSortOrder + i,
      });
    }
    if (uploaded.length > 0) {
      const { error } = await supabase.from('product_media').insert(
        uploaded.map((u) => ({
          product_id: targetProductId,
          media_type: 'image' as const,
          status: 'ready' as const,
          r2_key: u.r2_key,
          cdn_url: u.cdn_url,
          thumbnail_url: u.cdn_url,
          is_primary: u.is_primary,
          sort_order: u.sort_order,
        })),
      );
      if (error) throw new Error('Đã tải ảnh lên nhưng không lưu được vào sản phẩm.');
    }
  }

  async function handleSubmit(targetStatus: 'draft' | 'active') {
    if (!validate()) return;
    setSubmitting(targetStatus);
    setSubmitError(null);

    try {
      const productPayload = {
        name: name.trim(),
        category_id: categoryId,
        description: description.trim(),
        accept_oem: acceptOem,
        accept_custom: acceptCustom,
        min_order_qty: Number(minOrderQty),
        lead_time_days: Number(leadTimeDays),
        status: targetStatus,
      };

      let targetProductId = productId;

      if (mode === 'create') {
        const { data, error } = await supabase
          .from('products')
          .insert({ ...productPayload, supplier_id: supplierId })
          .select('id')
          .single();
        if (error || !data) throw new Error('Không thể tạo sản phẩm. Vui lòng thử lại.');
        targetProductId = data.id;
      } else {
        const { error } = await supabase.from('products').update(productPayload).eq('id', targetProductId!);
        if (error) throw new Error('Không thể lưu thay đổi sản phẩm.');
      }

      if (removedMediaIds.length > 0) {
        await supabase.storage
          .from('product-media')
          .remove(initial!.media.filter((m) => removedMediaIds.includes(m.id)).map((m) => m.path));
        await supabase.from('product_media').delete().in('id', removedMediaIds);
      }

      await uploadPendingMedia(targetProductId!, existingMedia.length);

      // Đơn giản hơn diff từng dòng: xóa hết bậc giá/biến thể cũ rồi insert
      // lại toàn bộ set hiện tại — chấp nhận được vì số dòng nhỏ (vài bậc
      // giá/biến thể mỗi sản phẩm).
      await supabase.from('price_tiers').delete().eq('product_id', targetProductId!);
      const validTiers = tiers.filter((t) => t.minQty && t.unitPrice);
      if (validTiers.length > 0) {
        const { error } = await supabase.from('price_tiers').insert(
          validTiers.map((t) => ({
            product_id: targetProductId,
            min_qty: Number(t.minQty),
            max_qty: t.maxQty ? Number(t.maxQty) : null,
            unit_price: Number(t.unitPrice),
          })),
        );
        if (error) throw new Error('Không thể lưu bảng giá. Kiểm tra lại các bậc giá có bị trùng khoảng số lượng không.');
      }

      await supabase.from('product_variants').delete().eq('product_id', targetProductId!);
      const validVariants = variants.filter((v) => v.color || v.size || v.material || v.sku);
      if (validVariants.length > 0) {
        const { error } = await supabase.from('product_variants').insert(
          validVariants.map((v) => ({
            product_id: targetProductId,
            color: v.color.trim() || null,
            size: v.size.trim() || null,
            material: v.material.trim() || null,
            stock_qty: v.stockQty ? Number(v.stockQty) : 0,
            sku: v.sku.trim() || null,
          })),
        );
        if (error) throw new Error('Không thể lưu biến thể — SKU có thể đã được dùng cho sản phẩm khác.');
      }

      router.push('/supplier/products');
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]">
      {/* LEFT */}
      <div>
        <Card>
          <CardHeader title={<>📝 Thông tin cơ bản</>} />
          <CardBody padded>
            <div className="mb-4">
              <div className="mb-1.5 text-xs font-semibold">
                Tên sản phẩm <span className="text-brand-red">*</span>
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Bát đĩa gốm men rạn Bát Tràng — bộ 6 món"
                className={`w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none focus:border-brand-red ${
                  errors.name ? 'border-brand-red' : 'border-brand-border'
                }`}
              />
              {errors.name && <div className="text-brand-red mt-1 text-[11px]">{errors.name}</div>}
            </div>

            <div className="mb-4">
              <div className="mb-1.5 text-xs font-semibold">
                Ngành hàng <span className="text-brand-red">*</span>
              </div>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={`w-full rounded-lg border-[1.5px] bg-white px-3 py-2.5 text-[13px] outline-none focus:border-brand-red ${
                  errors.category ? 'border-brand-red' : 'border-brand-border'
                }`}
              >
                <option value="">-- Chọn ngành hàng --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.category && <div className="text-brand-red mt-1 text-[11px]">{errors.category}</div>}
            </div>

            <div className="mb-4">
              <div className="mb-1.5 text-xs font-semibold">
                Mô tả chi tiết <span className="text-brand-red">*</span>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 1500))}
                rows={4}
                placeholder="Chất liệu, hoa văn, kích thước, cách đóng gói, khả năng tùy chỉnh..."
                className={`w-full resize-none rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none focus:border-brand-red ${
                  errors.description ? 'border-brand-red' : 'border-brand-border'
                }`}
              />
              <div className="text-brand-light mt-1 text-right text-[10.5px]">{description.length}/1500 ký tự</div>
              {errors.description && <div className="text-brand-red text-[11px]">{errors.description}</div>}
            </div>

            <label className="mb-2.5 flex items-start gap-2.5 text-[12.5px]">
              <input
                type="checkbox"
                checked={acceptOem}
                onChange={(e) => setAcceptOem(e.target.checked)}
                className="accent-brand-red mt-0.5 h-3.5 w-3.5 shrink-0"
              />
              <span className="text-brand-sub">
                <strong className="text-brand-ink">Nhận làm OEM</strong> — sản xuất theo mẫu/thiết kế
                riêng của buyer
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-[12.5px]">
              <input
                type="checkbox"
                checked={acceptCustom}
                onChange={(e) => setAcceptCustom(e.target.checked)}
                className="accent-brand-red mt-0.5 h-3.5 w-3.5 shrink-0"
              />
              <span className="text-brand-sub">
                <strong className="text-brand-ink">Nhận tùy chỉnh</strong> — in logo, đổi màu sắc, đóng
                gói riêng theo yêu cầu
              </span>
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<>📸 Hình ảnh</>} />
          <CardBody padded>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {existingMedia.map((m) => (
                <div key={m.id} className="relative aspect-square overflow-hidden rounded-lg border-[1.5px] border-brand-border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage public URL */}
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                  {m.isPrimary && (
                    <div className="bg-brand-red absolute right-1 bottom-1 left-1 rounded px-1 py-0.5 text-center text-[8.5px] font-bold text-white">
                      Ảnh chính
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeExistingMedia(m.id)}
                    className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-[10px] text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {pendingFiles.map((file, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-lg border-[1.5px] border-brand-border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview trước khi upload */}
                  <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" />
                  {existingMedia.length === 0 && i === 0 && (
                    <div className="bg-brand-red absolute right-1 bottom-1 left-1 rounded px-1 py-0.5 text-center text-[8.5px] font-bold text-white">
                      Ảnh chính
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removePendingFile(i)}
                    className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-[10px] text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {existingMedia.length + pendingFiles.length < 10 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="border-brand-border hover:border-brand-red text-brand-light flex aspect-square items-center justify-center rounded-lg border-[1.5px] border-dashed bg-[#FAFAF8] text-xl"
                >
                  +
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="text-brand-light mt-2.5 text-[11px]">
              Tối đa 10 ảnh. Ảnh đầu tiên là ảnh đại diện. JPG/PNG/WEBP, tối đa 10MB/file.
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={<>💰 Bảng giá theo số lượng</>}
            action={
              <button
                type="button"
                onClick={() => setTiers((prev) => [...prev, EMPTY_TIER])}
                className="text-brand-red text-[11.5px] font-semibold"
              >
                + Thêm bậc giá
              </button>
            }
          />
          <CardBody padded>
            <div className="mb-1.5 grid grid-cols-[1fr_1fr_1fr_30px] gap-2 text-[10.5px] font-bold tracking-[.04em] text-brand-light uppercase">
              <span>Từ số lượng</span>
              <span>Đến số lượng</span>
              <span>Đơn giá (VNĐ)</span>
              <span />
            </div>
            {tiers.map((t, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_1fr_30px] gap-2">
                <input
                  type="number"
                  value={t.minQty}
                  onChange={(e) => updateTier(i, { minQty: e.target.value })}
                  className="border-brand-border focus:border-brand-red rounded-md border-[1.5px] px-2.5 py-2 text-xs outline-none"
                />
                <input
                  type="number"
                  value={t.maxQty}
                  onChange={(e) => updateTier(i, { maxQty: e.target.value })}
                  placeholder="Bỏ trống = không giới hạn"
                  className="border-brand-border focus:border-brand-red rounded-md border-[1.5px] px-2.5 py-2 text-xs outline-none"
                />
                <input
                  type="number"
                  value={t.unitPrice}
                  onChange={(e) => updateTier(i, { unitPrice: e.target.value })}
                  className="border-brand-border focus:border-brand-red rounded-md border-[1.5px] px-2.5 py-2 text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={() => setTiers((prev) => prev.filter((_, idx) => idx !== i))}
                  className="border-brand-border text-brand-light hover:border-brand-red hover:text-brand-red rounded-md border-[1.5px] text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="text-brand-light mt-1 text-[11px]">
              Giá càng thấp khi số lượng đặt càng lớn — khuyến khích đơn hàng sỉ lớn hơn.
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={<>🎨 Biến thể sản phẩm</>}
            action={
              <button
                type="button"
                onClick={() => setVariants((prev) => [...prev, EMPTY_VARIANT])}
                className="text-brand-red text-[11.5px] font-semibold"
              >
                + Thêm biến thể
              </button>
            }
          />
          <CardBody padded>
            {variants.length > 0 && (
              <div className="mb-1.5 grid grid-cols-[1fr_1fr_1fr_80px_100px_30px] gap-2 text-[10px] font-bold tracking-[.04em] text-brand-light uppercase">
                <span>Màu sắc</span>
                <span>Kích thước</span>
                <span>Chất liệu</span>
                <span>Tồn kho</span>
                <span>SKU</span>
                <span />
              </div>
            )}
            {variants.map((v, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_1fr_80px_100px_30px] gap-2">
                <input
                  value={v.color}
                  onChange={(e) => updateVariant(i, { color: e.target.value })}
                  className="border-brand-border focus:border-brand-red rounded-md border-[1.5px] px-2 py-2 text-xs outline-none"
                />
                <input
                  value={v.size}
                  onChange={(e) => updateVariant(i, { size: e.target.value })}
                  className="border-brand-border focus:border-brand-red rounded-md border-[1.5px] px-2 py-2 text-xs outline-none"
                />
                <input
                  value={v.material}
                  onChange={(e) => updateVariant(i, { material: e.target.value })}
                  className="border-brand-border focus:border-brand-red rounded-md border-[1.5px] px-2 py-2 text-xs outline-none"
                />
                <input
                  type="number"
                  value={v.stockQty}
                  onChange={(e) => updateVariant(i, { stockQty: e.target.value })}
                  className="border-brand-border focus:border-brand-red rounded-md border-[1.5px] px-2 py-2 text-xs outline-none"
                />
                <input
                  value={v.sku}
                  onChange={(e) => updateVariant(i, { sku: e.target.value })}
                  className="border-brand-border focus:border-brand-red rounded-md border-[1.5px] px-2 py-2 text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={() => setVariants((prev) => prev.filter((_, idx) => idx !== i))}
                  className="border-brand-border text-brand-light hover:border-brand-red hover:text-brand-red rounded-md border-[1.5px] text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="text-brand-light mt-1 text-[11px]">
              Để trống nếu sản phẩm không có biến thể màu sắc/kích thước.
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<>🏭 Thông tin sản xuất</>} />
          <CardBody padded>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1.5 text-xs font-semibold">
                  Số lượng đặt tối thiểu (MOQ) <span className="text-brand-red">*</span>
                </div>
                <input
                  type="number"
                  value={minOrderQty}
                  onChange={(e) => setMinOrderQty(e.target.value)}
                  className={`w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none focus:border-brand-red ${
                    errors.minOrderQty ? 'border-brand-red' : 'border-brand-border'
                  }`}
                />
                {errors.minOrderQty && <div className="text-brand-red mt-1 text-[11px]">{errors.minOrderQty}</div>}
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold">
                  Thời gian sản xuất (ngày) <span className="text-brand-red">*</span>
                </div>
                <input
                  type="number"
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(e.target.value)}
                  className={`w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none focus:border-brand-red ${
                    errors.leadTimeDays ? 'border-brand-red' : 'border-brand-border'
                  }`}
                />
                {errors.leadTimeDays && <div className="text-brand-red mt-1 text-[11px]">{errors.leadTimeDays}</div>}
              </div>
            </div>
          </CardBody>
        </Card>

        {submitError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#FFCDD2] bg-[#FFF0F0] px-3.5 py-2.5 text-xs text-[#C62828]">
            <span>❌</span>
            <span>{submitError}</span>
          </div>
        )}

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => handleSubmit('draft')}
            className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink rounded-lg border-[1.5px] px-4.5 py-2.5 text-[13px] font-semibold disabled:opacity-60"
          >
            {submitting === 'draft' ? 'Đang lưu...' : 'Lưu nháp'}
          </button>
          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => handleSubmit('active')}
            className="bg-brand-red hover:bg-brand-red-dark rounded-lg px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {submitting === 'active' ? 'Đang đăng...' : '✓ Đăng bán sản phẩm'}
          </button>
        </div>
      </div>

      {/* RIGHT RAIL — PREVIEW */}
      <div>
        <div className="border-brand-border sticky top-[72px] mb-4 rounded-[10px] border bg-white p-4">
          <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
            Xem trước như buyer thấy
          </div>
          <span className="bg-brand-bg text-brand-sub mb-3 inline-block rounded-full px-2.5 py-1 text-[10.5px] font-semibold">
            {mode === 'edit' && initial?.status === 'active' ? '✓ Đang bán' : '📝 Nháp'}
          </span>
          <div className="bg-brand-bg mb-2.5 flex aspect-square items-center justify-center overflow-hidden rounded-lg text-4xl">
            {previewThumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview thumbnail
              <img src={previewThumb} alt="" className="h-full w-full object-cover" />
            ) : (
              '📦'
            )}
          </div>
          <div className="mb-1 text-[13px] leading-relaxed font-bold">{name || 'Tên sản phẩm'}</div>
          <div className="text-brand-red mb-0.5 text-[15px] font-bold">
            {lowestTier ? `từ ${formatVnd(lowestTier)}` : 'Chưa có giá'}
          </div>
          <div className="text-brand-light text-[11px]">
            MOQ {minOrderQty || '—'} · sản xuất {leadTimeDays || '—'} ngày
          </div>
        </div>

        <div className="border-brand-border rounded-[10px] border bg-white p-4">
          <div className="text-brand-sub mb-3 text-xs font-bold tracking-[.04em] uppercase">
            💡 Mẹo đăng sản phẩm tốt hơn
          </div>
          {[
            ['📸', 'Dùng ảnh chụp thật, đủ sáng — sản phẩm nhiều ảnh rõ nét tạo tin tưởng hơn.'],
            ['💰', 'Bảng giá 3 bậc trở lên giúp buyer dễ so sánh và đặt số lượng lớn hơn.'],
            ['📝', 'Mô tả rõ chất liệu, cách đóng gói giảm câu hỏi lặp lại từ buyer.'],
          ].map(([icon, text]) => (
            <div key={text} className="text-brand-sub mb-2.5 flex gap-2 text-xs leading-relaxed last:mb-0">
              <span className="shrink-0">{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
