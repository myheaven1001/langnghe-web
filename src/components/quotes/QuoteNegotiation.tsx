'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Button,
  Field,
  Input,
  Modal,
  ModalActions,
  ModalSub,
  ModalTitle,
  Textarea,
} from '@/components/ui';
import { formatVnd } from '@/lib/format';
import { quoteErrorMessage, type QuoteParty } from '@/lib/quotes';

// Trả giá trên một báo giá (kế hoạch 5.7) — dùng chung cho buyer (/rfq/[id])
// và xưởng (/supplier/rfq/[id]). Gọi RPC counter_quote(): hàm tự kiểm tra
// lượt, giới hạn 10 lượt và ghi lịch sử. `agree` (chỉ phía xưởng) hiện thêm
// nút đồng ý đúng mức giá buyer đề nghị.
export function CounterQuoteButton({
  quoteId,
  viewer,
  unit,
  quantity,
  currentPrice,
  currentLeadTime,
  agree,
}: {
  quoteId: string;
  viewer: QuoteParty;
  unit: string | null;
  quantity: number;
  /** Giá đang trên bàn của bên kia — gợi ý cho ô nhập. */
  currentPrice: number;
  currentLeadTime: number | null;
  agree?: { price: number; leadTime: number | null };
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState('');
  const [leadTime, setLeadTime] = useState(currentLeadTime != null ? String(currentLeadTime) : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNumber = Number(price);
  const validPrice = Number.isFinite(priceNumber) && priceNumber > 0;

  async function send(unitPrice: number, lead: number | null, message: string | null) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('counter_quote', {
      p_quote_id: quoteId,
      p_unit_price: unitPrice,
      p_lead_time_days: lead,
      p_note: message,
    });
    setBusy(false);
    if (error) {
      setError(quoteErrorMessage(error.message, 'Không gửi được đề nghị. Vui lòng thử lại.'));
      return;
    }
    setOpen(false);
    setPrice('');
    setNote('');
    router.refresh();
  }

  function submit() {
    if (!validPrice) {
      setError('Vui lòng nhập đơn giá lớn hơn 0.');
      return;
    }
    const lead = leadTime.trim() === '' ? null : Math.floor(Number(leadTime));
    if (lead !== null && (!Number.isFinite(lead) || lead < 1 || lead > 365)) {
      setError('Thời gian sản xuất từ 1 đến 365 ngày.');
      return;
    }
    void send(priceNumber, lead, note.trim() || null);
  }

  return (
    <>
      {agree && (
        <Button
          variant="success"
          disabled={busy}
          onClick={() => send(agree.price, agree.leadTime, null)}
        >
          ✓ Đồng ý {formatVnd(agree.price)}
        </Button>
      )}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {viewer === 'buyer' ? '↩ Trả giá' : 'Đề nghị giá khác'}
      </Button>
      {error && !open && <div className="text-brand-red w-full text-xs">{error}</div>}

      <Modal open={open} onClose={busy ? undefined : () => setOpen(false)} maxWidth="420px">
        <ModalTitle>{viewer === 'buyer' ? 'Trả giá cho xưởng' : 'Đề nghị giá khác'}</ModalTitle>
        <ModalSub>
          {viewer === 'buyer' ? 'Xưởng đang báo' : 'Buyer đang đề nghị'}{' '}
          <strong>{formatVnd(currentPrice)}</strong> / {unit ?? 'đơn vị'}. Bên kia sẽ nhận thông báo
          và trả lời đề nghị của bạn.
        </ModalSub>
        <div className="flex flex-col gap-3 text-left">
          <Field
            label={`Đơn giá đề nghị (đ / ${unit ?? 'đơn vị'}) *`}
            hint={
              validPrice
                ? `Tổng ${quantity.toLocaleString('vi-VN')} ${unit ?? ''}: ${formatVnd(priceNumber * quantity)}`
                : undefined
            }
          >
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="Thời gian sản xuất (ngày)" hint="Để trống nếu giữ như hiện tại.">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={leadTime}
              onChange={(e) => setLeadTime(e.target.value)}
            />
          </Field>
          <Field label="Lời nhắn">
            <Textarea
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Lấy đủ số lượng, thanh toán ngay khi chốt"
            />
          </Field>
        </div>
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
          <Button variant="primary" disabled={busy} className="flex-1" onClick={submit}>
            {busy ? 'Đang gửi...' : 'Gửi đề nghị'}
          </Button>
        </ModalActions>
      </Modal>
    </>
  );
}

// Buyer từ chối một báo giá (RPC reject_quote). Xưởng nhận thông báo kèm lý
// do và được gửi báo giá mới nếu RFQ còn mở.
export function RejectQuoteButton({
  quoteId,
  supplierName,
}: {
  quoteId: string;
  supplierName: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reject() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('reject_quote', {
      p_quote_id: quoteId,
      p_reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(quoteErrorMessage(error.message, 'Không từ chối được báo giá. Vui lòng thử lại.'));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Từ chối
      </Button>
      <Modal open={open} onClose={busy ? undefined : () => setOpen(false)} maxWidth="400px">
        <ModalTitle>Từ chối báo giá?</ModalTitle>
        <ModalSub>
          Báo giá của {supplierName} sẽ đóng lại. Xưởng được báo và có thể gửi báo giá mới khi yêu
          cầu còn mở.
        </ModalSub>
        <Textarea
          rows={3}
          maxLength={400}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Lý do (không bắt buộc) — VD: giá cao hơn ngân sách"
        />
        {error && <div className="text-brand-red mt-2 text-left text-xs">{error}</div>}
        <ModalActions>
          <Button
            variant="secondary"
            disabled={busy}
            className="flex-1"
            onClick={() => setOpen(false)}
          >
            Giữ lại
          </Button>
          <Button variant="danger" disabled={busy} className="flex-1" onClick={reject}>
            {busy ? 'Đang lưu...' : 'Từ chối báo giá'}
          </Button>
        </ModalActions>
      </Modal>
    </>
  );
}

// Xưởng rút báo giá đang thương lượng (đang pending thì rút trong QuoteForm).
export function WithdrawQuoteButton({ quoteId }: { quoteId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('rfq_quotes')
      .update({ status: 'withdrawn' })
      .eq('id', quoteId);
    setBusy(false);
    if (error) {
      setError(quoteErrorMessage(error.message, 'Không rút được báo giá. Vui lòng thử lại.'));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Rút báo giá
      </Button>
      <Modal
        open={open}
        onClose={busy ? undefined : () => setOpen(false)}
        centered
        maxWidth="380px"
      >
        <ModalTitle>Rút báo giá?</ModalTitle>
        <ModalSub>
          Buyer sẽ không còn thấy báo giá này và cuộc thương lượng dừng lại. Bạn có thể gửi báo giá
          mới khi yêu cầu còn mở.
        </ModalSub>
        {error && <div className="text-brand-red mb-2 text-xs">{error}</div>}
        <ModalActions>
          <Button
            variant="secondary"
            disabled={busy}
            className="flex-1"
            onClick={() => setOpen(false)}
          >
            Giữ lại
          </Button>
          <Button variant="primary" disabled={busy} className="flex-1" onClick={withdraw}>
            {busy ? 'Đang rút...' : 'Rút báo giá'}
          </Button>
        </ModalActions>
      </Modal>
    </>
  );
}
