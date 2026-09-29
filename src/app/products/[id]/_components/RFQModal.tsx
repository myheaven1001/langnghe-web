'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Modal, ModalTitle, ModalSub, ModalActions } from '@/components/ui';
import { formatVnd } from '@/lib/format';
import type { ProductView, SupplierView } from './types';

const DEADLINES = [
  { days: 7, label: 'Trong 7 ngày' },
  { days: 15, label: 'Trong 15 ngày' },
  { days: 30, label: 'Trong 30 ngày' },
];

// Gửi RFQ thật cho xưởng của sản phẩm: Edge Function create-rfq →
// create_rfq() kèm p_product_id (2.1c) — trừ hạn mức như gửi từ /rfq/new.
// Chỉ hiện với buyer (ProductDetailClient); khách được dẫn đi đăng nhập.
export function RFQModal({
  open,
  onClose,
  product,
  supplier,
  qty,
  variantLabel,
  unitPrice,
}: {
  open: boolean;
  onClose: () => void;
  product: ProductView;
  supplier: SupplierView;
  qty: number;
  variantLabel: string | null;
  unitPrice: number | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [quantity, setQuantity] = useState(String(qty));
  const [requirements, setRequirements] = useState(
    variantLabel ? `Phân loại: ${variantLabel}\n` : '',
  );
  const [budgetMax, setBudgetMax] = useState('');
  const [deadlineDays, setDeadlineDays] = useState(15);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRfqId, setCreatedRfqId] = useState<string | null>(null);

  async function handleSubmit() {
    const n = Number(quantity);
    if (!n || n < product.moq) {
      setError(`Số lượng tối thiểu là ${product.moq.toLocaleString('vi-VN')} cái.`);
      return;
    }
    if (!product.category) {
      setError('Sản phẩm chưa có ngành hàng — vui lòng gửi yêu cầu từ trang Gửi yêu cầu báo giá.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const { data, error: invokeError } = await supabase.functions.invoke('create-rfq', {
      body: {
        title: `Báo giá: ${product.name}`.slice(0, 250),
        requirements: requirements.trim() || null,
        quantity: n,
        unit: 'cái',
        budgetMin: null,
        budgetMax: budgetMax ? Number(budgetMax) : null,
        deadlineDays,
        rfqType: 'single',
        categoryId: product.category.id,
        supplierIds: [supplier.id],
        productId: product.id,
      },
    });
    setSubmitting(false);

    if (invokeError) {
      // Edge Function trả lỗi tiếng Việt trong body (xem create-rfq/index.ts).
      let message = 'Có lỗi xảy ra khi gửi yêu cầu. Vui lòng thử lại.';
      try {
        const body = await (invokeError as { context?: Response }).context?.json();
        if (body?.error) message = body.error;
      } catch {
        // giữ câu mặc định
      }
      setError(message);
      return;
    }
    setCreatedRfqId((data as { rfq_id: string }).rfq_id);
  }

  if (createdRfqId) {
    return (
      <Modal open={open} onClose={onClose} maxWidth="420px">
        <div className="py-2 text-center">
          <div className="mb-2 text-4xl">✅</div>
          <ModalTitle>Đã gửi yêu cầu báo giá</ModalTitle>
          <ModalSub>
            {supplier.shopName} sẽ nhận được thông báo và gửi báo giá cho bạn. Bạn theo dõi báo giá
            trong mục RFQ.
          </ModalSub>
          <ModalActions>
            <button
              type="button"
              onClick={onClose}
              className="border-brand-border flex-1 rounded border py-2.5 text-[13px]"
            >
              Đóng
            </button>
            <Link
              href={`/rfq/${createdRfqId}`}
              className="bg-brand-red flex-[2] rounded py-2.5 text-center text-[13px] font-semibold text-white"
            >
              Xem yêu cầu báo giá
            </Link>
          </ModalActions>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={submitting ? undefined : onClose} maxWidth="440px">
      <ModalTitle>📋 Gửi yêu cầu báo giá</ModalTitle>
      <ModalSub>
        {product.name} · {supplier.shopName}
      </ModalSub>

      <div className="flex flex-col gap-2.5">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">Số lượng cần đặt (cái) *</span>
          <input
            type="number"
            inputMode="numeric"
            min={product.moq}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="border-brand-border focus:border-brand-red w-full rounded border px-3 py-2 text-[13px] outline-none"
          />
          {unitPrice != null && Number(quantity) > 0 && (
            <span className="text-brand-sub mt-1 block text-[11px]">
              Ước tính theo bảng giá: {formatVnd(Number(quantity) * unitPrice)}
            </span>
          )}
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">Yêu cầu cụ thể</span>
          <textarea
            rows={3}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="Màu, kích thước, in logo, đóng gói, nơi giao hàng..."
            className="border-brand-border focus:border-brand-red w-full resize-none rounded border px-3 py-2 text-[13px] outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">Ngân sách tối đa (đ)</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              placeholder="Không bắt buộc"
              className="border-brand-border focus:border-brand-red w-full rounded border px-3 py-2 text-[13px] outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">Cần báo giá</span>
            <select
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(Number(e.target.value))}
              className="border-brand-border w-full rounded border bg-white px-3 py-2 text-[13px] outline-none"
            >
              {DEADLINES.map((d) => (
                <option key={d.days} value={d.days}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && <div className="text-brand-red mt-2.5 text-[12px]">{error}</div>}

      <ModalActions>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="border-brand-border flex-1 rounded border py-2.5 text-[13px] disabled:opacity-50"
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-brand-red flex-[2] rounded py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {submitting ? 'Đang gửi...' : 'Gửi yêu cầu báo giá'}
        </button>
      </ModalActions>
      <div className="text-brand-sub mt-2.5 text-center text-[11px]">
        Yêu cầu này tính vào hạn mức RFQ hằng tháng của bạn.
      </div>
    </Modal>
  );
}
