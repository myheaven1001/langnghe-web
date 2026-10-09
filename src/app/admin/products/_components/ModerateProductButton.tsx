'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Button,
  Field,
  Modal,
  ModalActions,
  ModalSub,
  ModalTitle,
  Textarea,
} from '@/components/ui';
import { adminErrorMessage } from '../../_lib/errors';

const QUICK_REASONS = [
  'Ảnh hoặc mô tả không đúng sản phẩm thật',
  'Hàng cấm / không được phép bán trên sàn',
  'Nghi sao chép sản phẩm của xưởng khác',
  'Giá hoặc thông tin gây hiểu nhầm',
];

// Khoá / mở khoá một sản phẩm qua RPC admin_moderate_product() (kế hoạch
// 4.11): khoá bắt buộc lý do (xưởng thấy lý do này), có nhật ký.
export function ModerateProductButton({
  productId,
  productName,
  blocked,
}: {
  productId: string;
  productName: string;
  blocked: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!blocked && !note.trim()) {
      setError('Vui lòng ghi lý do khoá.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('admin_moderate_product', {
      p_product_id: productId,
      p_action: blocked ? 'unblock' : 'block',
      p_note: note,
    });
    setBusy(false);
    if (error) {
      setError(adminErrorMessage(error.message, 'Không thực hiện được. Vui lòng thử lại.'));
      return;
    }
    setOpen(false);
    setNote('');
    router.refresh();
  }

  return (
    <>
      <Button variant={blocked ? 'secondary' : 'danger'} onClick={() => setOpen(true)}>
        {blocked ? 'Mở khoá' : 'Khoá sản phẩm'}
      </Button>

      <Modal open={open} onClose={busy ? undefined : () => setOpen(false)} maxWidth="440px">
        <ModalTitle>{blocked ? 'Mở khoá sản phẩm?' : 'Khoá sản phẩm'}</ModalTitle>
        <ModalSub>
          <strong className="break-words">{productName}</strong>
          <br />
          {blocked
            ? 'Sản phẩm chuyển về "Tạm dừng". Xưởng tự bật bán lại sau khi đã sửa.'
            : 'Sản phẩm sẽ biến khỏi mọi trang công khai. Xưởng thấy lý do bên dưới và không sửa được cho tới khi sàn mở khoá.'}
        </ModalSub>

        {!blocked && (
          <>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setNote(reason)}
                  className="border-brand-border text-brand-sub hover:border-brand-ink rounded-full border px-2.5 py-1 text-xs"
                >
                  {reason}
                </button>
              ))}
            </div>
            <Field label="Lý do khoá" required>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="Xưởng sẽ đọc được lý do này"
              />
            </Field>
          </>
        )}

        {error && <div className="text-brand-red mt-2 text-[13px]">{error}</div>}

        <ModalActions>
          <Button
            variant="secondary"
            disabled={busy}
            className="flex-1"
            onClick={() => setOpen(false)}
          >
            Hủy
          </Button>
          <Button
            variant={blocked ? 'forest' : 'primary'}
            disabled={busy}
            className="flex-1"
            onClick={submit}
          >
            {busy ? 'Đang lưu...' : blocked ? 'Mở khoá' : 'Khoá sản phẩm'}
          </Button>
        </ModalActions>
      </Modal>
    </>
  );
}
