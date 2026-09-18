'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, CardBody, CardHeader, Modal, ModalActions, ModalIcon, ModalSub, ModalTitle } from '@/components/ui';

type RfqType = 'single' | 'multi';

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

interface SupplierResult {
  id: string;
  shop_name: string;
  village_origin: string | null;
  craft_category: string | null;
}

const UNITS = ['Cái', 'Bộ', 'Kg', 'Mét', 'Thùng', 'Container'];
const DEADLINE_OPTIONS = [
  { days: 1, label: '24h', sub: 'Gấp' },
  { days: 3, label: '3 ngày', sub: 'Phổ biến' },
  { days: 7, label: '7 ngày', sub: 'Thong thả' },
  { days: 14, label: '14 ngày', sub: 'Không gấp' },
];

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Ported from rfq_create_page.html. Data hiện đang read-write trực tiếp
// Supabase từ client (tìm xưởng: public read qua RLS; gửi RFQ: qua Edge
// Function create-rfq để đảm bảo atomic — xem
// supabase/functions/create-rfq/index.ts).
export default function RfqCreateForm({
  categories,
  quotaUsed,
  quotaResetAt,
  creditBalance,
  planLabel,
  monthlyQuota,
  multiRfqAllowed,
  maxSuppliersPerRfq,
}: {
  categories: CategoryOption[];
  quotaUsed: number;
  quotaResetAt: string | null;
  creditBalance: number;
  planLabel: string;
  monthlyQuota: number | null;
  multiRfqAllowed: boolean;
  maxSuppliersPerRfq: number;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [rfqType, setRfqType] = useState<RfqType>('single');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');

  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplierResults, setSupplierResults] = useState<SupplierResult[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<SupplierResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState(UNITS[1]);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [deadlineDays, setDeadlineDays] = useState(3);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ rfq_id: string; used_credit: boolean } | null>(null);

  const maxSuppliers = rfqType === 'single' ? 1 : maxSuppliersPerRfq;
  const selectedCategory = categories.find((c) => c.id === categoryId);

  // Xưởng theo ngành hàng đang chọn, lọc thêm theo ô tìm kiếm — debounce
  // 300ms để không bắn 1 query mỗi phím gõ.
  useEffect(() => {
    // Toàn bộ setState nằm trong callback bất đồng bộ (kể cả nhánh "chưa
    // chọn ngành hàng") — không gọi setState đồng bộ ngay trong thân effect
    // để tránh cascading render (react-hooks/set-state-in-effect).
    const timer = setTimeout(async () => {
      if (!selectedCategory) {
        setSupplierResults([]);
        return;
      }

      setSearching(true);
      let q = supabase
        .from('supplier_profiles')
        .select('id, shop_name, village_origin, craft_category')
        .order('rating_avg', { ascending: false })
        .limit(20);

      if (supplierQuery.trim()) {
        const term = `%${supplierQuery.trim()}%`;
        q = q.or(`shop_name.ilike.${term},village_origin.ilike.${term}`);
      } else {
        q = q.ilike('craft_category', `%${selectedCategory.name.split(' ')[0]}%`);
      }

      const { data } = await q;
      setSupplierResults(data ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [supabase, supplierQuery, selectedCategory]);

  function toggleSupplier(s: SupplierResult) {
    setSelectedSuppliers((prev) => {
      const already = prev.some((p) => p.id === s.id);
      if (already) return prev.filter((p) => p.id !== s.id);
      if (rfqType === 'single') return [s];
      if (prev.length >= maxSuppliers) return prev;
      return [...prev, s];
    });
  }

  function setType(t: RfqType) {
    if (t === 'multi' && !multiRfqAllowed) return;
    setRfqType(t);
    setSelectedSuppliers((prev) => (t === 'single' ? prev.slice(0, 1) : prev));
  }

  function clearErr(field: string) {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit() {
    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = 'Vui lòng nhập tiêu đề yêu cầu';
    if (description.trim().length < 20) nextErrors.description = 'Vui lòng mô tả yêu cầu (tối thiểu 20 ký tự)';
    const qty = Number(quantity);
    if (!quantity || qty < 1) nextErrors.quantity = 'Nhập số lượng hợp lệ';
    if (!categoryId) nextErrors.category = 'Vui lòng chọn ngành hàng';
    if (selectedSuppliers.length === 0) nextErrors.suppliers = 'Vui lòng chọn ít nhất 1 xưởng để gửi yêu cầu báo giá.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);

    const { data, error } = await supabase.functions.invoke('create-rfq', {
      body: {
        title: title.trim(),
        requirements: description.trim(),
        quantity: qty,
        unit,
        budgetMin: budgetMin ? Number(budgetMin) : null,
        budgetMax: budgetMax ? Number(budgetMax) : null,
        deadlineDays,
        rfqType,
        categoryId,
        supplierIds: selectedSuppliers.map((s) => s.id),
      },
    });

    setSubmitting(false);

    if (error) {
      // supabase-js bọc response non-2xx của Edge Function vào error.context
      // (một Response) — đọc lại body JSON để lấy đúng message tiếng Việt
      // Edge Function đã dịch, thay vì hiện "Edge Function returned a
      // non-2xx status code" chung chung.
      let message = 'Có lỗi xảy ra khi gửi yêu cầu. Vui lòng thử lại.';
      try {
        const ctx = (error as { context?: Response }).context;
        const body = await ctx?.json();
        if (body?.error) message = body.error;
      } catch {
        // giữ message mặc định ở trên
      }
      setSubmitError(message);
      return;
    }

    setSuccess(data as { rfq_id: string; used_credit: boolean });
  }

  return (
    <div>
      <div className="mb-2 text-[11.5px] text-[#999]">
        <Link href="/dashboard" className="text-[#666] hover:text-[#E53333]">
          Dashboard
        </Link>{' '}
        / <span>Gửi RFQ mới</span>
      </div>

      <div className="mb-5">
        <div className="text-xl font-bold">Gửi yêu cầu báo giá (RFQ)</div>
        <div className="mt-1 text-[12.5px] text-[#666]">
          Mô tả nhu cầu của bạn — xưởng phù hợp sẽ gửi báo giá trong vòng vài giờ.
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]">
        {/* LEFT: FORM */}
        <div>
          <Card>
            <CardHeader title="1️⃣ Chọn loại yêu cầu" />
            <CardBody padded>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setType('single')}
                  className={`flex-1 rounded-lg border-[1.5px] p-3.5 text-left transition-colors ${
                    rfqType === 'single' ? 'border-[#E53333] bg-[#FFF8F8]' : 'border-[#E0DDD8] hover:border-[#C4622D]'
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-base">🎯</span>
                    <span className="text-[13px] font-bold">RFQ đơn</span>
                  </div>
                  <div className="text-[11px] leading-normal text-[#666]">
                    Gửi cho 1 xưởng cụ thể — phù hợp khi bạn đã chọn được nhà cung cấp ưng ý.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setType('multi')}
                  disabled={!multiRfqAllowed}
                  className={`flex-1 rounded-lg border-[1.5px] p-3.5 text-left transition-colors ${
                    rfqType === 'multi' ? 'border-[#E53333] bg-[#FFF8F8]' : 'border-[#E0DDD8]'
                  } ${multiRfqAllowed ? 'hover:border-[#C4622D]' : 'cursor-not-allowed opacity-60'}`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-base">🧮</span>
                    <span className="text-[13px] font-bold">Multi-RFQ</span>
                  </div>
                  <div className="text-[11px] leading-normal text-[#666]">
                    Gửi đồng thời nhiều xưởng để so sánh báo giá — tối đa{' '}
                    <strong>{maxSuppliersPerRfq} xưởng</strong> với gói hiện tại.
                  </div>
                  {!multiRfqAllowed && (
                    <div className="mt-1.5 text-[10px] font-semibold text-[#C4622D]">
                      🔒 Nâng cấp gói để dùng Multi-RFQ
                    </div>
                  )}
                </button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="2️⃣ Chọn xưởng nhận báo giá"
              action={
                <span className="text-[11px] text-[#666]">
                  Đã chọn <strong className="text-[#E53333]">{selectedSuppliers.length}</strong>/{maxSuppliers}
                </span>
              }
            />
            <CardBody padded>
              <div className="relative mb-2.5">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-[#999]">🔍</span>
                <input
                  value={supplierQuery}
                  onChange={(e) => setSupplierQuery(e.target.value)}
                  type="text"
                  placeholder="Tìm xưởng theo tên, làng nghề..."
                  className="w-full rounded-lg border-[1.5px] border-[#E0DDD8] py-2.5 pr-3 pl-8 text-[13px] outline-none focus:border-[#E53333]"
                />
              </div>

              <div className="mb-2 flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
                {searching && <div className="py-3 text-center text-xs text-[#999]">Đang tìm...</div>}
                {!searching && supplierResults.length === 0 && (
                  <div className="py-3 text-center text-xs text-[#999]">
                    Chưa có xưởng nào khớp — thử ngành hàng hoặc từ khóa khác.
                  </div>
                )}
                {supplierResults.map((s) => {
                  const selected = selectedSuppliers.some((p) => p.id === s.id);
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => toggleSupplier(s)}
                      className={`flex items-center gap-2.5 rounded-lg border-[1.5px] p-2 text-left transition-colors ${
                        selected ? 'border-[#E53333] bg-[#FFF8F8]' : 'border-[#E0DDD8] hover:border-[#C4622D]'
                      }`}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[#F5F3EF] text-[15px]">
                        🏺
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-semibold">{s.shop_name}</div>
                        <div className="truncate text-[11px] text-[#999]">
                          {s.village_origin ?? 'Chưa rõ làng nghề'} · {s.craft_category ?? ''}
                        </div>
                      </div>
                      <div
                        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] text-white ${
                          selected ? 'border-[#E53333] bg-[#E53333]' : 'border-[#E0DDD8]'
                        }`}
                      >
                        {selected && '✓'}
                      </div>
                    </button>
                  );
                })}
              </div>
              {errors.suppliers && <div className="text-[11px] text-[#E53333]">{errors.suppliers}</div>}
              {!errors.suppliers && (
                <div className="text-[11px] text-[#999]">
                  {rfqType === 'single'
                    ? 'RFQ đơn chỉ gửi cho 1 xưởng — chọn xưởng bạn muốn nhận báo giá.'
                    : `Bạn có thể chọn tối đa ${maxSuppliers} xưởng để so sánh báo giá.`}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="3️⃣ Thông tin yêu cầu" />
            <CardBody padded>
              <div className="mb-4">
                <div className="mb-1.5 text-xs font-semibold">
                  Tiêu đề yêu cầu <span className="text-[#E53333]">*</span>
                </div>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    clearErr('title');
                  }}
                  type="text"
                  placeholder="VD: Bát đĩa gốm men rạn Bát Tràng — 2.000 bộ"
                  className={`w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none focus:border-[#E53333] ${
                    errors.title ? 'border-[#E53333] bg-[#FFF8F8]' : 'border-[#E0DDD8]'
                  }`}
                />
                {errors.title && <div className="mt-1 text-[11px] text-[#E53333]">{errors.title}</div>}
              </div>

              <div className="mb-4">
                <div className="mb-1.5 text-xs font-semibold">
                  Ngành hàng <span className="text-[#E53333]">*</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => {
                        setCategoryId(c.id);
                        setSelectedSuppliers([]);
                      }}
                      className={`rounded-full border-[1.5px] px-3 py-1.5 text-xs transition-colors ${
                        c.id === categoryId
                          ? 'border-[#1A3A2A] bg-[#1A3A2A] text-white'
                          : 'border-[#E0DDD8] text-[#666] hover:border-[#C4622D]'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <div className="mb-1.5 text-xs font-semibold">
                  Mô tả chi tiết yêu cầu <span className="text-[#E53333]">*</span>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value.slice(0, 1000));
                    clearErr('description');
                  }}
                  rows={4}
                  placeholder="VD: Bát đĩa men rạn hoa văn cổ, đường kính 20cm, đóng gói theo bộ 6 món, có thể in logo theo yêu cầu..."
                  className={`w-full resize-none rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none focus:border-[#E53333] ${
                    errors.description ? 'border-[#E53333] bg-[#FFF8F8]' : 'border-[#E0DDD8]'
                  }`}
                />
                <div className="mt-1 text-right text-[10.5px] text-[#999]">{description.length}/1000 ký tự</div>
                {errors.description && (
                  <div className="mt-1 text-[11px] text-[#E53333]">{errors.description}</div>
                )}
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2.5">
                <div>
                  <div className="mb-1.5 text-xs font-semibold">
                    Số lượng <span className="text-[#E53333]">*</span>
                  </div>
                  <input
                    value={quantity}
                    onChange={(e) => {
                      setQuantity(e.target.value.replace(/[^0-9]/g, ''));
                      clearErr('quantity');
                    }}
                    type="text"
                    inputMode="numeric"
                    placeholder="2000"
                    className={`w-full rounded-lg border-[1.5px] px-3 py-2.5 text-[13px] outline-none focus:border-[#E53333] ${
                      errors.quantity ? 'border-[#E53333] bg-[#FFF8F8]' : 'border-[#E0DDD8]'
                    }`}
                  />
                  {errors.quantity && <div className="mt-1 text-[11px] text-[#E53333]">{errors.quantity}</div>}
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-semibold">Đơn vị</div>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full rounded-lg border-[1.5px] border-[#E0DDD8] px-3 py-2.5 text-[13px] outline-none focus:border-[#E53333]"
                  >
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-semibold">Loại RFQ</div>
                  <input
                    disabled
                    value={rfqType === 'single' ? 'Đơn' : 'Multi'}
                    className="w-full rounded-lg border-[1.5px] border-[#E0DDD8] bg-[#F5F3EF] px-3 py-2.5 text-[13px] text-[#999]"
                  />
                </div>
              </div>

              <div className="mb-4">
                <div className="mb-1.5 text-xs font-semibold">
                  Khoảng ngân sách dự kiến{' '}
                  <span className="font-normal text-[#999]">(không bắt buộc)</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={budgetMin}
                    onChange={(e) => setBudgetMin(e.target.value.replace(/[^0-9]/g, ''))}
                    type="text"
                    inputMode="numeric"
                    placeholder="Từ — VNĐ"
                    className="w-full rounded-lg border-[1.5px] border-[#E0DDD8] px-3 py-2.5 text-[13px] outline-none focus:border-[#E53333]"
                  />
                  <span className="text-[#999]">—</span>
                  <input
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(e.target.value.replace(/[^0-9]/g, ''))}
                    type="text"
                    inputMode="numeric"
                    placeholder="Đến — VNĐ"
                    className="w-full rounded-lg border-[1.5px] border-[#E0DDD8] px-3 py-2.5 text-[13px] outline-none focus:border-[#E53333]"
                  />
                </div>
                <div className="mt-1 text-[11px] text-[#999]">
                  Giúp xưởng báo giá sát với khả năng chi trả của bạn, tăng tỷ lệ phản hồi.
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold">Thời hạn nhận báo giá</div>
                <div className="flex gap-2">
                  {DEADLINE_OPTIONS.map((d) => (
                    <button
                      type="button"
                      key={d.days}
                      onClick={() => setDeadlineDays(d.days)}
                      className={`flex-1 rounded-lg border-[1.5px] px-1.5 py-2.5 text-center text-xs font-semibold transition-colors ${
                        deadlineDays === d.days
                          ? 'border-[#E53333] bg-[#FFF8F8] text-[#E53333]'
                          : 'border-[#E0DDD8] text-[#666] hover:border-[#C4622D]'
                      }`}
                    >
                      {d.label}
                      <span className="mt-0.5 block text-[10px] font-normal text-[#999]">{d.sub}</span>
                    </button>
                  ))}
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
              disabled={submitting}
              onClick={handleSubmit}
              className="rounded-lg bg-[#E53333] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#c62828] disabled:cursor-not-allowed disabled:bg-[#E0DDD8]"
            >
              {submitting ? '⏳ Đang gửi...' : '🚀 Gửi yêu cầu báo giá'}
            </button>
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div>
          <div className="mb-4 rounded-[10px] border border-[#E0DDD8] bg-white p-4">
            <div className="mb-3 text-xs font-bold tracking-[.04em] text-[#666] uppercase">
              Hạn mức RFQ tháng này
            </div>
            <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-md bg-[#F5F3EF] px-2.5 py-1 text-xs font-bold">
              {planLabel}
            </div>
            <div className="mb-1.5 flex justify-between text-[11.5px] text-[#666]">
              <span>Đã dùng</span>
              <span>
                <strong>{quotaUsed}</strong>/{monthlyQuota ?? '∞'} RFQ
              </span>
            </div>
            {monthlyQuota !== null && (
              <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-[#F5F3EF]">
                <div
                  className="h-full rounded-full bg-[#FF6A00]"
                  style={{ width: `${Math.min(100, (quotaUsed / monthlyQuota) * 100)}%` }}
                />
              </div>
            )}
            <div className="mb-2.5 text-[11px] leading-relaxed text-[#666]">
              {monthlyQuota === null
                ? 'Gói của bạn không giới hạn số lượng RFQ mỗi tháng.'
                : `Còn ${Math.max(0, monthlyQuota - quotaUsed)} yêu cầu trong tháng này. Reset vào ${formatDate(quotaResetAt)}.`}{' '}
              Bạn còn <strong className="text-[#1F1F1F]">{creditBalance} credit</strong> RFQ có thể dùng thêm khi
              hết hạn mức.
            </div>
            <Link
              href="/settings/membership"
              className="block w-full rounded-md bg-[#1A3A2A] py-2 text-center text-xs font-semibold text-white hover:bg-[#123020]"
            >
              Nâng cấp gói →
            </Link>
          </div>

          <div className="rounded-[10px] border border-[#E0DDD8] bg-white p-4">
            <div className="mb-3 text-xs font-bold tracking-[.04em] text-[#666] uppercase">
              💡 Mẹo nhận báo giá tốt hơn
            </div>
            {[
              ['📐', 'Nêu rõ kích thước, chất liệu, màu sắc — xưởng báo giá chính xác hơn.'],
              ['📸', 'Đính kèm ảnh mẫu hoặc bản vẽ nếu có, giảm hiểu lầm khi trao đổi.'],
              ['💰', 'Cho khoảng ngân sách dự kiến để nhận phản hồi phù hợp hơn.'],
              ['⏱️', 'Thời hạn hợp lý (3–7 ngày) thường nhận được nhiều báo giá chất lượng hơn "gấp 24h".'],
            ].map(([icon, text]) => (
              <div key={text} className="mb-2.5 flex gap-2 text-xs leading-relaxed text-[#666] last:mb-0">
                <span className="shrink-0">{icon}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={!!success} centered maxWidth="400px">
        <ModalIcon>🎉</ModalIcon>
        <ModalTitle>Đã gửi yêu cầu báo giá!</ModalTitle>
        <ModalSub>
          Yêu cầu của bạn đã được gửi tới <strong>{selectedSuppliers.length}</strong> xưởng. Bạn sẽ nhận thông
          báo ngay khi có báo giá đầu tiên.
          {success?.used_credit && ' Yêu cầu này đã dùng 1 credit vì bạn đã hết hạn mức tháng này.'}
        </ModalSub>
        <ModalActions vertical>
          <Link
            href="/rfq"
            className="rounded-lg bg-[#E53333] py-2.5 text-sm font-semibold text-white hover:bg-[#c62828]"
          >
            📋 Xem RFQ của tôi
          </Link>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            className="rounded-lg border-[1.5px] border-[#E0DDD8] py-2.5 text-sm font-semibold text-[#1F1F1F]"
          >
            Ở lại trang này
          </button>
        </ModalActions>
      </Modal>
    </div>
  );
}
