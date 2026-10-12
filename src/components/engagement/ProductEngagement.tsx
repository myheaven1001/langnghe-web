'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Button,
  Field,
  Modal,
  ModalActions,
  ModalSub,
  ModalTitle,
  Select,
  Textarea,
} from '@/components/ui';

// Lưu / bỏ lưu một sản phẩm (bảng saved_products — bước 6). Tự đọc trạng thái
// khi hiện ra; RLS chỉ cho mỗi người thêm / xoá dòng của chính mình.
export function SaveProductButton({
  productId,
  className,
}: {
  productId: string;
  className?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('saved_products')
      .select('product_id')
      .eq('product_id', productId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setSaved(!!data);
      });
    return () => {
      active = false;
    };
  }, [supabase, productId]);

  async function toggle() {
    if (saved === null) return;
    setBusy(true);
    setError(null);
    const { error } = saved
      ? await supabase.from('saved_products').delete().eq('product_id', productId)
      : await supabase.from('saved_products').insert({ product_id: productId });
    setBusy(false);
    if (error && !error.message.includes('duplicate')) {
      setError(
        error.message.includes('SAVED_LIMIT_REACHED')
          ? 'Bạn đã lưu tối đa 500 sản phẩm.'
          : 'Không lưu được. Vui lòng thử lại.',
      );
      return;
    }
    setSaved(!saved);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        disabled={busy || saved === null}
        aria-pressed={!!saved}
        onClick={toggle}
        className={className}
      >
        {saved ? '♥ Đã lưu' : '♡ Lưu sản phẩm'}
      </button>
      {error && <span className="text-brand-red block w-full text-xs">{error}</span>}
    </>
  );
}

const REPORT_REASONS: { value: string; label: string }[] = [
  { value: 'fake', label: 'Hàng giả, ảnh / thông tin lấy của nơi khác' },
  { value: 'wrong_info', label: 'Thông tin sai (giá, số lượng, xuất xứ…)' },
  { value: 'prohibited', label: 'Hàng cấm hoặc không được phép bán' },
  { value: 'ip', label: 'Vi phạm thương hiệu / bản quyền' },
  { value: 'spam', label: 'Spam, đăng trùng lặp' },
  { value: 'abuse', label: 'Lời lẽ xúc phạm, quấy rối' },
  { value: 'other', label: 'Khác' },
];

function reportErrorMessage(message: string): string {
  if (message.includes('REPORT_EXISTS')) return 'Bạn đã báo cáo mục này, sàn đang xem xét.';
  if (message.includes('REPORT_RATE_LIMIT')) return 'Bạn đã gửi tối đa 10 báo cáo hôm nay.';
  if (message.includes('CANNOT_REPORT_OWN')) return 'Không báo cáo được nội dung của chính mình.';
  if (message.includes('TARGET_NOT_FOUND')) return 'Nội dung này không còn hiển thị.';
  if (message.includes('INVALID_REPORT')) return 'Vui lòng chọn lý do; lý do "Khác" cần mô tả.';
  if (message.includes('ACCOUNT_SUSPENDED')) return 'Tài khoản của bạn đang bị tạm khóa.';
  if (message.includes('NOT_AUTHENTICATED')) return 'Vui lòng đăng nhập lại.';
  return 'Không gửi được báo cáo. Vui lòng thử lại.';
}

// Báo cáo vi phạm cho một sản phẩm / gian hàng / đánh giá (RPC submit_report).
// Chỉ admin và người gửi đọc được báo cáo; bên bị báo không biết ai gửi.
export function ReportButton({
  targetType,
  targetId,
  className,
}: {
  targetType: 'product' | 'supplier' | 'review';
  targetId: string;
  className?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!reason) {
      setError('Vui lòng chọn lý do.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('submit_report', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_reason: reason,
      p_details: details.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(reportErrorMessage(error.message));
      return;
    }
    setSent(true);
  }

  const what =
    targetType === 'product' ? 'sản phẩm' : targetType === 'supplier' ? 'gian hàng' : 'đánh giá';

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setSent(false);
          setOpen(true);
        }}
        className={className}
      >
        ⚑ Báo cáo {what}
      </button>
      <Modal open={open} onClose={busy ? undefined : () => setOpen(false)} maxWidth="420px">
        {sent ? (
          <>
            <ModalTitle>Đã gửi báo cáo</ModalTitle>
            <ModalSub>
              Cảm ơn bạn. Sàn sẽ xem xét và xử lý nếu có vi phạm. Bên bị báo cáo không biết ai đã
              gửi.
            </ModalSub>
            <ModalActions>
              <Button variant="primary" className="flex-1" onClick={() => setOpen(false)}>
                Đóng
              </Button>
            </ModalActions>
          </>
        ) : (
          <>
            <ModalTitle>Báo cáo {what}</ModalTitle>
            <ModalSub>Chỉ quản trị viên của sàn đọc được báo cáo này.</ModalSub>
            <div className="flex flex-col gap-3 text-left">
              <Field label="Lý do" required>
                <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">— Chọn lý do —</option>
                  {REPORT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Mô tả thêm"
                hint={reason === 'other' ? 'Bắt buộc với lý do "Khác".' : undefined}
              >
                <Textarea
                  rows={3}
                  maxLength={1000}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
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
                Huỷ
              </Button>
              <Button variant="danger" disabled={busy} className="flex-1" onClick={submit}>
                {busy ? 'Đang gửi...' : 'Gửi báo cáo'}
              </Button>
            </ModalActions>
          </>
        )}
      </Modal>
    </>
  );
}

// Admin đóng một báo cáo: đã xử lý hoặc không vi phạm (RPC admin_resolve_report).
export function ReportResolveButtons({ reportId }: { reportId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close(outcome: 'resolved' | 'dismissed') {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('admin_resolve_report', {
      p_report_id: reportId,
      p_outcome: outcome,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(
        error.message.includes('REPORT_ALREADY_CLOSED')
          ? 'Báo cáo đã được đóng trước đó. Tải lại trang.'
          : 'Không lưu được. Vui lòng thử lại.',
      );
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ghi chú xử lý (không bắt buộc)"
        className="border-brand-border focus:border-brand-forest min-h-10 min-w-[180px] flex-1 rounded-lg border-[1.5px] px-3 text-[13px] outline-none"
      />
      <Button variant="forest" disabled={busy} onClick={() => close('resolved')}>
        Đã xử lý
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => close('dismissed')}>
        Không vi phạm
      </Button>
      {error && <div className="text-brand-red w-full text-xs">{error}</div>}
    </div>
  );
}
