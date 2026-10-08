'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { formatVnd } from '@/lib/format';
import { IMAGE_ACCEPT, isSupportedImage, prepareImage } from '@/lib/image-prep';

interface PriceTierInput {
  minQty: string;
  maxQty: string;
  unitPrice: string;
}

interface VariantInput {
  // id biến thể đã lưu — save_product() sửa tại chỗ thay vì tạo mới.
  id?: string;
  // Mã tạm phía web (không lưu): để ảnh trỏ tới biến thể kể cả khi biến thể
  // chưa có id hoặc đang bị sửa tên. Biến thể đã lưu dùng luôn id.
  uid?: string;
  color: string;
  size: string;
  material: string;
  stockQty: string;
  // Cộng/trừ vào đơn giá theo bậc (VND), có thể âm; trống = 0.
  priceAdjustment: string;
  sku: string;
}

interface ExistingMedia {
  id: string;
  path: string;
  url: string;
  isPrimary: boolean;
  /** id biến thể mà ảnh đang gắn trong database (null = ảnh chung). */
  variantId?: string | null;
}

// Ảnh mới chọn, đã nén, chưa tải lên. `url` là blob URL để xem trước (tạo 1
// lần, thu hồi khi bỏ ảnh / rời trang).
interface PendingImage {
  key: string;
  file: File;
  url: string;
}

// "màu|kích thước|chất liệu" chữ thường — save_product() dùng khoá này để
// tìm biến thể của ảnh (20261005092700).
function variantKey(v: { color: string; size: string; material: string }) {
  return [v.color, v.size, v.material]
    .map((part) => part.trim())
    .join('|')
    .toLowerCase();
}

function variantLabel(v: { color: string; size: string; material: string }) {
  return [v.color, v.size, v.material]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ');
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

const MAX_IMAGES = 10;
const MAX_VARIANTS = 60;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const EMPTY_TIER: PriceTierInput = { minQty: '', maxQty: '', unitPrice: '' };
const EMPTY_VARIANT: VariantInput = {
  color: '',
  size: '',
  material: '',
  stockQty: '',
  priceAdjustment: '',
  sku: '',
};

const STEPS = ['Thông tin', 'Hình ảnh', 'Giá & biến thể', 'Sản xuất & đăng'] as const;
// Trường bắt buộc nằm ở bước nào — lỗi thì nhảy về đúng bước đó.
const FIELD_STEP: Record<string, number> = {
  name: 0,
  category: 0,
  description: 0,
  minOrderQty: 3,
  leadTimeDays: 3,
};

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function splitList(value: string) {
  return [
    ...new Set(
      value
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

// Mã lỗi từ save_product() (20261005091400) → câu tiếng Việt.
function saveErrorMessage(message: string): string {
  if (message.includes('PRICE_TIERS_OVERLAP')) {
    return 'Không thể lưu bảng giá. Kiểm tra lại các bậc giá có bị trùng khoảng số lượng không.';
  }
  if (message.includes('SKU_TAKEN')) return 'SKU đã được dùng cho sản phẩm khác. Vui lòng đổi SKU.';
  if (message.includes('INVALID_INPUT')) return 'Vui lòng kiểm tra lại thông tin sản phẩm.';
  if (message.includes('PRODUCT_NOT_FOUND'))
    return 'Không tìm thấy sản phẩm hoặc bạn không có quyền sửa.';
  if (message.includes('ACCOUNT_SUSPENDED')) return 'Tài khoản của bạn đang bị tạm khóa.';
  return 'Không thể lưu sản phẩm. Vui lòng thử lại.';
}

// Form sản phẩm dạng từng bước (kế hoạch 4.5), làm cho điện thoại trước:
//   1 Thông tin → 2 Hình ảnh → 3 Giá & biến thể → 4 Sản xuất & đăng (xem trước).
// Ảnh: chọn nhiều, kéo thả, chụp trực tiếp bằng camera; mọi ảnh được nén và
// đổi HEIC → JPEG trên máy trước khi tải (lib/image-prep). Biến thể: tạo
// nhanh cả bảng tổ hợp từ danh sách màu / kích thước / chất liệu.
// Lưu qua RPC save_product(): sản phẩm, bậc giá, biến thể, ảnh trong MỘT
// transaction. Ảnh tải lên kho trước (cần id sản phẩm cho đường dẫn, nên sản
// phẩm mới tự sinh id ở client); lưu thất bại thì xoá ảnh vừa tải.
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
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);

  const [name, setName] = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [acceptOem, setAcceptOem] = useState(initial?.acceptOem ?? false);
  const [acceptCustom, setAcceptCustom] = useState(initial?.acceptCustom ?? false);
  const [minOrderQty, setMinOrderQty] = useState(initial?.minOrderQty ?? '');
  const [leadTimeDays, setLeadTimeDays] = useState(initial?.leadTimeDays ?? '');
  const [tiers, setTiers] = useState<PriceTierInput[]>(
    initial?.priceTiers.length ? initial.priceTiers : [EMPTY_TIER],
  );
  const [variants, setVariants] = useState<VariantInput[]>(() =>
    (initial?.variants ?? []).map((v) => ({ ...v, uid: v.id ?? crypto.randomUUID() })),
  );
  // Ảnh (id ảnh đã lưu hoặc key ảnh mới) → uid biến thể. Không có = ảnh chung.
  const [imageVariant, setImageVariant] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (initial?.media ?? []).filter((m) => m.variantId).map((m) => [m.id, m.variantId as string]),
    ),
  );
  const [existingMedia, setExistingMedia] = useState<ExistingMedia[]>(initial?.media ?? []);
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Tạo nhanh bảng biến thể.
  const [genColors, setGenColors] = useState('');
  const [genSizes, setGenSizes] = useState('');
  const [genMaterials, setGenMaterials] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<'draft' | 'active' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Thu hồi blob URL còn lại khi rời trang.
  const pendingRef = useRef<PendingImage[]>([]);
  useEffect(() => {
    pendingRef.current = pendingImages;
  }, [pendingImages]);
  useEffect(() => () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const imageCount = existingMedia.length + pendingImages.length;
  const previewThumb = existingMedia[0]?.url ?? pendingImages[0]?.url ?? null;
  const lowestTier = tiers
    .map((t) => Number(t.unitPrice))
    .filter((n) => n > 0)
    .sort((a, b) => a - b)[0];
  const categoryName = categories.find((c) => c.id === categoryId)?.name;

  // ── Ảnh ────────────────────────────────────────────────────────────────
  async function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setImageError(null);

    const room = MAX_IMAGES - imageCount - preparing;
    if (room <= 0) {
      setImageError(`Tối đa ${MAX_IMAGES} ảnh cho mỗi sản phẩm.`);
      return;
    }
    const accepted = files.filter(isSupportedImage).slice(0, room);
    const problems: string[] = [];
    if (accepted.length < files.length) {
      problems.push(
        files.some((f) => !isSupportedImage(f))
          ? 'Chỉ nhận ảnh JPG, PNG, WEBP hoặc HEIC.'
          : `Tối đa ${MAX_IMAGES} ảnh — đã bỏ bớt ảnh thừa.`,
      );
    }

    setPreparing((n) => n + accepted.length);
    for (const file of accepted) {
      try {
        const prepared = await prepareImage(file);
        if (prepared.size > MAX_FILE_SIZE) {
          problems.push(`Ảnh "${file.name}" vẫn lớn hơn 10MB sau khi nén.`);
        } else {
          setPendingImages((prev) => [
            ...prev,
            { key: crypto.randomUUID(), file: prepared, url: URL.createObjectURL(prepared) },
          ]);
        }
      } catch (err) {
        problems.push(err instanceof Error ? err.message : `Không đọc được ảnh "${file.name}".`);
      } finally {
        setPreparing((n) => n - 1);
      }
    }
    if (problems.length > 0) setImageError(problems.join(' '));
  }

  function removePendingImage(key: string) {
    setPendingImages((prev) => {
      const target = prev.find((p) => p.key === key);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.key !== key);
    });
  }

  function removeExistingMedia(id: string) {
    setExistingMedia((prev) => prev.filter((m) => m.id !== id));
    setRemovedMediaIds((prev) => [...prev, id]);
  }

  // ── Giá, biến thể ──────────────────────────────────────────────────────
  function updateTier(i: number, patch: Partial<PriceTierInput>) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  function updateVariant(i: number, patch: Partial<VariantInput>) {
    setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }

  const genLists = [splitList(genColors), splitList(genSizes), splitList(genMaterials)];
  const genCount = genLists.some((l) => l.length > 0)
    ? genLists.reduce((n, l) => n * Math.max(1, l.length), 1)
    : 0;

  function generateVariants() {
    const [colors, sizes, materials] = genLists.map((l) => (l.length > 0 ? l : ['']));
    const key = (v: { color: string; size: string; material: string }) =>
      `${v.color}|${v.size}|${v.material}`.toLowerCase();
    setVariants((prev) => {
      const seen = new Set(prev.map(key));
      const next = [...prev];
      for (const color of colors) {
        for (const size of sizes) {
          for (const material of materials) {
            const candidate = {
              ...EMPTY_VARIANT,
              uid: crypto.randomUUID(),
              color,
              size,
              material,
            };
            if (next.length < MAX_VARIANTS && !seen.has(key(candidate))) {
              seen.add(key(candidate));
              next.push(candidate);
            }
          }
        }
      }
      return next;
    });
    setGenColors('');
    setGenSizes('');
    setGenMaterials('');
  }

  // ── Kiểm tra + lưu ─────────────────────────────────────────────────────
  function validate(onlyStep?: number) {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Vui lòng nhập tên sản phẩm.';
    if (!categoryId) next.category = 'Vui lòng chọn ngành hàng.';
    if (!description.trim()) next.description = 'Vui lòng mô tả sản phẩm.';
    if (!minOrderQty || Number(minOrderQty) < 1)
      next.minOrderQty = 'Nhập số lượng đặt tối thiểu hợp lệ.';
    if (!leadTimeDays || Number(leadTimeDays) < 1)
      next.leadTimeDays = 'Nhập thời gian sản xuất hợp lệ.';

    const relevant =
      onlyStep === undefined
        ? next
        : Object.fromEntries(
            Object.entries(next).filter(([field]) => FIELD_STEP[field] === onlyStep),
          );
    setErrors(relevant);
    return relevant;
  }

  function goNext() {
    if (Object.keys(validate(step)).length > 0) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0 });
  }

  function goTo(target: number) {
    setErrors({});
    setStep(target);
    window.scrollTo({ top: 0 });
  }

  // Khoá biến thể của một ảnh lúc lưu ('' = ảnh chung).
  function keyForImage(imageId: string) {
    const target = variants.find((v) => v.uid === imageVariant[imageId]);
    return target ? variantKey(target) : '';
  }

  // Tải ảnh mới lên kho; lỗi giữa chừng thì xoá những ảnh đã tải.
  async function uploadPendingMedia(targetProductId: string, startSortOrder: number) {
    const uploaded: {
      r2_key: string;
      cdn_url: string;
      sort_order: number;
      variant_key: string;
    }[] = [];
    for (let i = 0; i < pendingImages.length; i++) {
      const { file, key } = pendingImages[i];
      const path = `${supplierId}/${targetProductId}/${Date.now()}-${i}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from('product-media')
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        await removeFromStorage(uploaded.map((u) => u.r2_key));
        throw new Error('Không thể tải ảnh lên. Kiểm tra kết nối mạng rồi thử lại.');
      }
      const { data: pub } = supabase.storage.from('product-media').getPublicUrl(path);
      uploaded.push({
        r2_key: path,
        cdn_url: pub.publicUrl,
        sort_order: startSortOrder + i,
        variant_key: keyForImage(key),
      });
    }
    return uploaded;
  }

  async function removeFromStorage(paths: string[]) {
    if (paths.length > 0) await supabase.storage.from('product-media').remove(paths);
  }

  async function handleSubmit(targetStatus: 'draft' | 'active') {
    const found = validate();
    const firstBad = Object.keys(found)
      .map((field) => FIELD_STEP[field])
      .sort((a, b) => a - b)[0];
    if (firstBad !== undefined) {
      setStep(firstBad);
      window.scrollTo({ top: 0 });
      return;
    }
    if (preparing > 0) {
      setSubmitError('Ảnh đang được xử lý, vui lòng chờ vài giây.');
      return;
    }
    setSubmitting(targetStatus);
    setSubmitError(null);

    try {
      // Sản phẩm mới: sinh id trước để làm đường dẫn ảnh trong kho.
      const targetProductId = productId ?? crypto.randomUUID();
      const uploaded = await uploadPendingMedia(targetProductId, existingMedia.length);

      const { error } = await supabase.rpc('save_product', {
        p_product_id: targetProductId,
        p_product: {
          name: name.trim(),
          category_id: categoryId,
          description: description.trim(),
          accept_oem: acceptOem,
          accept_custom: acceptCustom,
          min_order_qty: Number(minOrderQty),
          lead_time_days: Number(leadTimeDays),
          status: targetStatus,
        },
        p_tiers: tiers
          .filter((t) => t.minQty && t.unitPrice)
          .map((t) => ({
            min_qty: Number(t.minQty),
            max_qty: t.maxQty ? Number(t.maxQty) : null,
            unit_price: Number(t.unitPrice),
          })),
        p_variants: variants
          .filter((v) => v.color || v.size || v.material || v.sku)
          .map((v) => ({
            id: v.id ?? null,
            color: v.color.trim(),
            size: v.size.trim(),
            material: v.material.trim(),
            stock_qty: v.stockQty ? Number(v.stockQty) : 0,
            price_adjustment: v.priceAdjustment ? Number(v.priceAdjustment) : 0,
            sku: v.sku.trim(),
          })),
        p_media_add: uploaded,
        p_media_remove: removedMediaIds,
        p_media_variants: existingMedia.map((m) => ({ id: m.id, variant_key: keyForImage(m.id) })),
      });

      if (error) {
        await removeFromStorage(uploaded.map((u) => u.r2_key));
        throw new Error(saveErrorMessage(error.message));
      }

      // Đã lưu xong mới xoá file ảnh bị bỏ khỏi kho (lỗi ở đây không ảnh
      // hưởng dữ liệu sản phẩm).
      if (removedMediaIds.length > 0 && initial) {
        await removeFromStorage(
          initial.media.filter((m) => removedMediaIds.includes(m.id)).map((m) => m.path),
        );
      }

      router.push('/supplier/products');
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setSubmitting(null);
    }
  }

  const stepHasError = (index: number) =>
    Object.keys(errors).some((field) => FIELD_STEP[field] === index);
  const sectionClass = 'border-brand-border rounded-[10px] border bg-white p-4 sm:p-5';
  const sectionTitle = 'mb-3 text-[15px] font-bold';
  const smallInput =
    'border-brand-border focus:border-brand-red min-h-10 w-full min-w-0 rounded-md border-[1.5px] bg-white px-2.5 text-sm outline-none';

  return (
    <div className="mx-auto max-w-[760px]">
      {/* CÁC BƯỚC */}
      <ol className="mb-4 flex gap-1.5">
        {STEPS.map((label, i) => {
          const state = i === step ? 'current' : i < step ? 'done' : 'todo';
          return (
            <li key={label} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={state === 'current' ? 'step' : undefined}
                className="flex min-h-10 w-full flex-col items-stretch gap-1.5 text-left"
              >
                <span
                  className={`h-1.5 rounded-full ${
                    stepHasError(i)
                      ? 'bg-brand-red'
                      : state === 'todo'
                        ? 'bg-brand-border'
                        : 'bg-brand-green'
                  }`}
                />
                <span
                  className={`truncate text-xs ${
                    state === 'current' ? 'text-brand-ink font-bold' : 'text-brand-sub'
                  }`}
                >
                  <span className="sm:hidden">{i + 1}</span>
                  <span className="hidden sm:inline">
                    {i + 1}. {label}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="text-brand-sub mb-3 text-[13px] sm:hidden">
        Bước {step + 1}/{STEPS.length}: <strong className="text-brand-ink">{STEPS[step]}</strong>
      </div>

      {/* BƯỚC 1 — THÔNG TIN */}
      {step === 0 && (
        <section className={sectionClass}>
          <h2 className={sectionTitle}>📝 Thông tin cơ bản</h2>
          <div className="flex flex-col gap-4">
            <Field label="Tên sản phẩm" required error={errors.name}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                placeholder="VD: Bát đĩa gốm men rạn Bát Tràng — bộ 6 món"
              />
            </Field>
            <Field label="Ngành hàng" required error={errors.category}>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">-- Chọn ngành hàng --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Mô tả chi tiết"
              required
              error={errors.description}
              hint={`${description.length}/1500 ký tự — chất liệu, hoa văn, kích thước, cách đóng gói.`}
            >
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 1500))}
                rows={5}
                placeholder="Chất liệu, hoa văn, kích thước, cách đóng gói, khả năng tùy chỉnh..."
              />
            </Field>

            <label className="flex min-h-10 items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={acceptOem}
                onChange={(e) => setAcceptOem(e.target.checked)}
                className="accent-brand-red mt-0.5 h-5 w-5 shrink-0"
              />
              <span className="text-brand-sub">
                <strong className="text-brand-ink">Nhận làm OEM</strong> — sản xuất theo mẫu/thiết
                kế riêng của buyer
              </span>
            </label>
            <label className="flex min-h-10 items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={acceptCustom}
                onChange={(e) => setAcceptCustom(e.target.checked)}
                className="accent-brand-red mt-0.5 h-5 w-5 shrink-0"
              />
              <span className="text-brand-sub">
                <strong className="text-brand-ink">Nhận tùy chỉnh</strong> — in logo, đổi màu sắc,
                đóng gói riêng theo yêu cầu
              </span>
            </label>
          </div>
        </section>
      )}

      {/* BƯỚC 2 — HÌNH ẢNH */}
      {step === 1 && (
        <section className={sectionClass}>
          <h2 className={sectionTitle}>
            📸 Hình ảnh{' '}
            <span className="text-brand-sub text-xs font-normal">
              ({imageCount}/{MAX_IMAGES})
            </span>
          </h2>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void addFiles(e.dataTransfer.files);
            }}
            className={`rounded-[10px] border-2 border-dashed px-4 py-5 text-center ${
              dragOver ? 'border-brand-red bg-[#FFF5F5]' : 'border-brand-border bg-[#FAFAF8]'
            }`}
          >
            <div className="text-brand-sub mb-3 hidden text-[13px] lg:block">
              Kéo thả ảnh vào đây, hoặc
            </div>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              <Button
                variant="secondary"
                disabled={imageCount >= MAX_IMAGES}
                onClick={() => fileInputRef.current?.click()}
              >
                🖼️ Chọn ảnh từ máy
              </Button>
              <Button
                variant="secondary"
                disabled={imageCount >= MAX_IMAGES}
                onClick={() => cameraInputRef.current?.click()}
                className="lg:hidden"
              >
                📷 Chụp ảnh
              </Button>
            </div>
            <div className="text-brand-sub mt-3 text-xs leading-relaxed">
              Tối đa {MAX_IMAGES} ảnh, ảnh đầu tiên là ảnh đại diện. JPG, PNG, WEBP, HEIC — ảnh tự
              được thu nhỏ và nén trước khi tải lên.
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {/* capture: mở thẳng camera sau trên điện thoại. */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {imageError && <div className="text-brand-red mt-3 text-[13px]">{imageError}</div>}

          {(imageCount > 0 || preparing > 0) && (
            <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {existingMedia.map((m, i) => (
                <div
                  key={m.id}
                  className="border-brand-border relative aspect-square overflow-hidden rounded-lg border-[1.5px]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage public URL */}
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && (
                    <div className="bg-brand-red absolute right-1 bottom-1 left-1 rounded px-1 py-0.5 text-center text-xs font-bold text-white">
                      Ảnh chính
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="Bỏ ảnh"
                    onClick={() => removeExistingMedia(m.id)}
                    className="absolute top-0 right-0 flex h-9 w-9 items-start justify-end p-1"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white">
                      ✕
                    </span>
                  </button>
                </div>
              ))}
              {pendingImages.map((p, i) => (
                <div
                  key={p.key}
                  className="border-brand-border relative aspect-square overflow-hidden rounded-lg border-[1.5px]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob xem trước, chưa tải lên */}
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  {existingMedia.length === 0 && i === 0 && (
                    <div className="bg-brand-red absolute right-1 bottom-1 left-1 rounded px-1 py-0.5 text-center text-xs font-bold text-white">
                      Ảnh chính
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-xs text-white">
                    {Math.max(1, Math.round(p.file.size / 1024))}KB
                  </div>
                  <button
                    type="button"
                    aria-label="Bỏ ảnh"
                    onClick={() => removePendingImage(p.key)}
                    className="absolute top-0 right-0 flex h-9 w-9 items-start justify-end p-1"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white">
                      ✕
                    </span>
                  </button>
                </div>
              ))}
              {Array.from({ length: preparing }).map((_, i) => (
                <div
                  key={`preparing-${i}`}
                  className="border-brand-border bg-brand-bg text-brand-sub flex aspect-square animate-pulse items-center justify-center rounded-lg border-[1.5px] text-xs"
                >
                  Đang xử lý…
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* BƯỚC 3 — GIÁ & BIẾN THỂ */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <section className={sectionClass}>
            <h2 className={sectionTitle}>💰 Bảng giá theo số lượng</h2>
            <div className="text-brand-sub mb-3 text-xs leading-relaxed">
              Mua càng nhiều giá càng thấp. Bỏ trống &quot;Đến&quot; ở bậc cuối = không giới hạn.
            </div>
            <div className="text-brand-sub mb-1 grid grid-cols-[1fr_1fr_1.3fr_40px] gap-2 text-xs font-semibold">
              <span>Từ SL</span>
              <span>Đến SL</span>
              <span>Đơn giá (đ)</span>
              <span />
            </div>
            {tiers.map((t, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_1.3fr_40px] gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label="Từ số lượng"
                  value={t.minQty}
                  onChange={(e) => updateTier(i, { minQty: e.target.value })}
                  className={smallInput}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label="Đến số lượng"
                  value={t.maxQty}
                  onChange={(e) => updateTier(i, { maxQty: e.target.value })}
                  placeholder="∞"
                  className={smallInput}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label="Đơn giá"
                  value={t.unitPrice}
                  onChange={(e) => updateTier(i, { unitPrice: e.target.value })}
                  className={smallInput}
                />
                <button
                  type="button"
                  aria-label="Xoá bậc giá"
                  onClick={() => setTiers((prev) => prev.filter((_, idx) => idx !== i))}
                  className="border-brand-border text-brand-sub hover:border-brand-red hover:text-brand-red min-h-10 rounded-md border-[1.5px] text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
            <Button variant="ghost" onClick={() => setTiers((prev) => [...prev, EMPTY_TIER])}>
              + Thêm bậc giá
            </Button>
          </section>

          <section className={sectionClass}>
            <h2 className={sectionTitle}>
              🎨 Biến thể{' '}
              <span className="text-brand-sub text-xs font-normal">
                ({variants.length}/{MAX_VARIANTS}) — bỏ qua nếu sản phẩm chỉ có một loại
              </span>
            </h2>

            <div className="bg-brand-bg mb-4 rounded-lg p-3">
              <div className="mb-2 text-[13px] font-semibold">Tạo nhanh bảng biến thể</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  value={genColors}
                  onChange={(e) => setGenColors(e.target.value)}
                  placeholder="Màu: trắng, xanh lam"
                  aria-label="Danh sách màu, cách nhau bằng dấu phẩy"
                  className={smallInput}
                />
                <input
                  value={genSizes}
                  onChange={(e) => setGenSizes(e.target.value)}
                  placeholder="Kích thước: 20cm, 30cm"
                  aria-label="Danh sách kích thước, cách nhau bằng dấu phẩy"
                  className={smallInput}
                />
                <input
                  value={genMaterials}
                  onChange={(e) => setGenMaterials(e.target.value)}
                  placeholder="Chất liệu: gốm, sứ"
                  aria-label="Danh sách chất liệu, cách nhau bằng dấu phẩy"
                  className={smallInput}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button variant="secondary" disabled={genCount === 0} onClick={generateVariants}>
                  Tạo {genCount > 0 ? `${genCount} ` : ''}biến thể
                </Button>
                <span className="text-brand-sub text-xs">
                  Cách nhau bằng dấu phẩy. Mỗi tổ hợp thành một dòng bên dưới.
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {variants.map((v, i) => (
                <div
                  key={v.uid ?? v.id ?? `new-${i}`}
                  className="border-brand-border rounded-lg border p-2.5"
                >
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_84px_104px_104px_40px]">
                    <input
                      value={v.color}
                      onChange={(e) => updateVariant(i, { color: e.target.value })}
                      placeholder="Màu sắc"
                      aria-label="Màu sắc"
                      className={smallInput}
                    />
                    <input
                      value={v.size}
                      onChange={(e) => updateVariant(i, { size: e.target.value })}
                      placeholder="Kích thước"
                      aria-label="Kích thước"
                      className={smallInput}
                    />
                    <input
                      value={v.material}
                      onChange={(e) => updateVariant(i, { material: e.target.value })}
                      placeholder="Chất liệu"
                      aria-label="Chất liệu"
                      className={smallInput}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={v.stockQty}
                      onChange={(e) => updateVariant(i, { stockQty: e.target.value })}
                      placeholder="Tồn kho"
                      aria-label="Tồn kho"
                      className={smallInput}
                    />
                    <input
                      type="number"
                      step="1000"
                      value={v.priceAdjustment}
                      onChange={(e) => updateVariant(i, { priceAdjustment: e.target.value })}
                      placeholder="± Giá (đ)"
                      aria-label="Chênh lệch giá so với bảng giá (đ), có thể âm"
                      className={smallInput}
                    />
                    <input
                      value={v.sku}
                      onChange={(e) => updateVariant(i, { sku: e.target.value })}
                      placeholder="SKU"
                      aria-label="SKU"
                      className={smallInput}
                    />
                    <button
                      type="button"
                      aria-label="Xoá biến thể"
                      onClick={() => setVariants((prev) => prev.filter((_, idx) => idx !== i))}
                      className="border-brand-border text-brand-sub hover:border-brand-red hover:text-brand-red col-span-2 min-h-10 rounded-md border-[1.5px] text-sm sm:col-span-3 lg:col-span-1"
                    >
                      ✕<span className="lg:hidden"> Xoá biến thể này</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              disabled={variants.length >= MAX_VARIANTS}
              className="mt-2"
              onClick={() =>
                setVariants((prev) => [...prev, { ...EMPTY_VARIANT, uid: crypto.randomUUID() }])
              }
            >
              + Thêm một biến thể
            </Button>
            <div className="text-brand-sub mt-1 text-xs">
              &quot;± Giá&quot; cộng/trừ vào đơn giá theo bậc cho riêng biến thể đó (có thể âm).
            </div>
          </section>

          {/* ẢNH THEO BIẾN THỂ — chỉ hiện khi có cả ảnh lẫn biến thể đã đặt tên. */}
          {imageCount > 0 && variants.some((v) => variantLabel(v)) && (
            <section className={sectionClass}>
              <h2 className={sectionTitle}>🖼️ Ảnh theo biến thể</h2>
              <div className="text-brand-sub mb-3 text-xs leading-relaxed">
                Chọn biến thể mà mỗi ảnh minh hoạ. Buyer chọn biến thể nào sẽ thấy ảnh của biến thể
                đó. Để &quot;Ảnh chung&quot; nếu ảnh dùng cho cả sản phẩm.
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {[
                  ...existingMedia.map((m) => ({ id: m.id, url: m.url })),
                  ...pendingImages.map((p) => ({ id: p.key, url: p.url })),
                ].map((img) => (
                  <div key={img.id} className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- ảnh xem trước */}
                    <img
                      src={img.url}
                      alt=""
                      className="border-brand-border h-14 w-14 shrink-0 rounded-md border object-cover"
                    />
                    <select
                      aria-label="Biến thể của ảnh"
                      value={
                        variants.some((v) => v.uid === imageVariant[img.id])
                          ? imageVariant[img.id]
                          : ''
                      }
                      onChange={(e) =>
                        setImageVariant((prev) => ({ ...prev, [img.id]: e.target.value }))
                      }
                      className={smallInput}
                    >
                      <option value="">Ảnh chung</option>
                      {variants
                        .filter((v) => variantLabel(v))
                        .map((v) => (
                          <option key={v.uid} value={v.uid}>
                            {variantLabel(v)}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* BƯỚC 4 — SẢN XUẤT & ĐĂNG */}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          <section className={sectionClass}>
            <h2 className={sectionTitle}>🏭 Thông tin sản xuất</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Số lượng đặt tối thiểu (MOQ)" required error={errors.minOrderQty}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={minOrderQty}
                  onChange={(e) => setMinOrderQty(e.target.value)}
                />
              </Field>
              <Field label="Thời gian sản xuất (ngày)" required error={errors.leadTimeDays}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={sectionTitle}>👀 Xem trước như buyer thấy</h2>
            <div className="flex gap-3">
              <div className="bg-brand-bg flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg text-3xl sm:h-32 sm:w-32">
                {previewThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- ảnh xem trước
                  <img src={previewThumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  '📦'
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm font-bold break-words">
                  {name || 'Tên sản phẩm'}
                </div>
                <div className="text-brand-red mt-0.5 text-base font-bold">
                  {lowestTier ? `từ ${formatVnd(lowestTier)}` : 'Chưa có giá'}
                </div>
                <div className="text-brand-sub mt-0.5 text-xs">
                  MOQ {minOrderQty || '—'} · sản xuất {leadTimeDays || '—'} ngày
                </div>
                <div className="text-brand-sub mt-0.5 text-xs">
                  {categoryName ?? 'Chưa chọn ngành hàng'} · {imageCount} ảnh ·{' '}
                  {variants.length > 0 ? `${variants.length} biến thể` : 'không có biến thể'}
                </div>
              </div>
            </div>
            {(imageCount === 0 || !lowestTier) && (
              <div className="bg-status-amber-soft text-status-amber mt-3 rounded-lg px-3 py-2 text-xs font-semibold">
                {imageCount === 0 && 'Sản phẩm chưa có ảnh. '}
                {!lowestTier && 'Chưa có bậc giá nào. '}
                Bạn vẫn lưu được, nhưng buyer ít quan tâm sản phẩm thiếu ảnh hoặc giá.
              </div>
            )}
            <div className="text-brand-sub mt-3 text-xs">
              Trạng thái hiện tại:{' '}
              <strong className="text-brand-ink">
                {mode === 'edit' && initial?.status === 'active' ? 'Đang bán' : 'Nháp'}
              </strong>
            </div>
          </section>
        </div>
      )}

      {submitError && (
        <div className="border-status-red-soft bg-status-red-soft text-status-red mt-4 rounded-lg border px-3.5 py-2.5 text-[13px]">
          {submitError}
        </div>
      )}

      {/* THANH HÀNH ĐỘNG — dính đáy; trên điện thoại nằm trên thanh điều hướng. */}
      <div className="border-brand-border sticky bottom-14 z-30 -mx-4 mt-4 flex gap-2 border-t bg-white px-4 py-2.5 lg:bottom-0 lg:mx-0 lg:rounded-[10px] lg:border">
        {step > 0 && (
          <Button variant="secondary" disabled={submitting !== null} onClick={() => goTo(step - 1)}>
            ‹ Quay lại
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <>
            <Button
              variant="ghost"
              disabled={submitting !== null}
              className="ml-auto"
              onClick={() => handleSubmit('draft')}
            >
              {submitting === 'draft' ? 'Đang lưu...' : 'Lưu nháp'}
            </Button>
            <Button onClick={goNext} disabled={submitting !== null}>
              Tiếp tục ›
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={submitting !== null}
              className="ml-auto"
              onClick={() => handleSubmit('draft')}
            >
              {submitting === 'draft' ? 'Đang lưu...' : 'Lưu nháp'}
            </Button>
            <Button disabled={submitting !== null} onClick={() => handleSubmit('active')}>
              {submitting === 'active' ? 'Đang đăng...' : '✓ Đăng bán'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
