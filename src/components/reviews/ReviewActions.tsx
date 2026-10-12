'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Modal, ModalActions, ModalSub, ModalTitle, Textarea } from '@/components/ui';
import { RATING_LABEL, reviewErrorMessage } from '@/lib/reviews';

// Buyer chấm sao + nhận xét cho một đơn đã hoàn tất (RPC submit_review). Mỗi
// đơn một lần, gửi rồi không sửa được.
export function ReviewForm({ orderId }: { orderId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (rating < 1) {
      setError('Vui lòng chọn số sao.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('submit_review', {
      p_order_id: orderId,
      p_rating: rating,
      p_comment: comment.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(reviewErrorMessage(error.message, 'Không gửi được đánh giá. Vui lòng thử lại.'));
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div role="radiogroup" aria-label="Số sao" className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} sao`}
              onClick={() => setRating(n)}
              className={`flex h-10 w-10 items-center justify-center text-[26px] leading-none ${
                n <= rating ? 'text-[#FFB800]' : 'text-[#DDD8CF]'
              }`}
            >
              ★
            </button>
          ))}
        </div>
        {rating > 0 && <span className="text-brand-sub text-[13px]">{RATING_LABEL[rating]}</span>}
      </div>
      <Textarea
        rows={3}
        maxLength={1000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Chất lượng hàng, đóng gói, thời gian giao... (không bắt buộc)"
        className="mt-2"
      />
      {error && <div className="text-brand-red mt-2 text-xs">{error}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={busy} onClick={submit}>
          {busy ? 'Đang gửi...' : 'Gửi đánh giá'}
        </Button>
        <span className="text-brand-light text-xs">Hiện công khai, tên công ty được che bớt.</span>
      </div>
    </div>
  );
}

// Xưởng trả lời (hoặc sửa câu trả lời) một đánh giá — RPC reply_review.
export function ReviewReplyForm({
  reviewId,
  currentReply,
}: {
  reviewId: string;
  currentReply: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState(currentReply ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reply.trim()) {
      setError('Nhập nội dung trả lời.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('reply_review', {
      p_review_id: reviewId,
      p_reply: reply,
    });
    setBusy(false);
    if (error) {
      setError(reviewErrorMessage(error.message, 'Không lưu được. Vui lòng thử lại.'));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-brand-blue min-h-8 text-xs font-semibold"
      >
        {currentReply ? 'Sửa câu trả lời' : '↩ Trả lời'}
      </button>
    );
  }

  return (
    <div>
      <Textarea
        rows={3}
        maxLength={1000}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        placeholder="Câu trả lời hiện công khai dưới đánh giá"
      />
      {error && <div className="text-brand-red mt-1 text-xs">{error}</div>}
      <div className="mt-2 flex gap-2">
        <Button variant="primary" disabled={busy} onClick={submit}>
          {busy ? 'Đang lưu...' : 'Lưu trả lời'}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
          Huỷ
        </Button>
      </div>
    </div>
  );
}

// Admin ẩn (bắt buộc lý do) hoặc hiện lại một đánh giá — RPC
// admin_moderate_review, có nhật ký. Ẩn thì điểm của xưởng được tính lại.
export function ReviewModerateButton({ reviewId, hidden }: { reviewId: string; hidden: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(hide: boolean) {
    if (hide && !reason.trim()) {
      setError('Vui lòng ghi lý do ẩn.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('admin_moderate_review', {
      p_review_id: reviewId,
      p_hide: hide,
      p_reason: hide ? reason : null,
    });
    setBusy(false);
    if (error) {
      setError(reviewErrorMessage(error.message, 'Không lưu được. Vui lòng thử lại.'));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (hidden) {
    return (
      <>
        <Button variant="secondary" disabled={busy} onClick={() => run(false)}>
          {busy ? 'Đang lưu...' : 'Hiện lại'}
        </Button>
        {error && <div className="text-brand-red mt-1 text-xs">{error}</div>}
      </>
    );
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Ẩn đánh giá
      </Button>
      <Modal open={open} onClose={busy ? undefined : () => setOpen(false)} maxWidth="400px">
        <ModalTitle>Ẩn đánh giá?</ModalTitle>
        <ModalSub>
          Đánh giá không còn hiện công khai và không tính vào điểm của xưởng. Buyer và xưởng vẫn
          thấy nó kèm lý do. Có thể hiện lại sau.
        </ModalSub>
        <Textarea
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Lý do — VD: lời lẽ xúc phạm, quảng cáo, không liên quan đơn hàng"
        />
        {error && <div className="text-brand-red mt-2 text-left text-xs">{error}</div>}
        <ModalActions>
          <Button
            variant="secondary"
            disabled={busy}
            className="flex-1"
            onClick={() => setOpen(false)}
          >
            Để sau
          </Button>
          <Button variant="danger" disabled={busy} className="flex-1" onClick={() => run(true)}>
            {busy ? 'Đang lưu...' : 'Ẩn đánh giá'}
          </Button>
        </ModalActions>
      </Modal>
    </>
  );
}
