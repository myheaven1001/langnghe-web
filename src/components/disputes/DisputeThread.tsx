'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Textarea } from '@/components/ui';
import { formatVnDateTime } from '@/lib/format';
import {
  DISPUTE_ROLE_LABEL,
  disputeErrorMessage,
  type DisputeMessageRow,
  type DisputeViewer,
} from '@/lib/disputes';

const BUCKET = 'dispute-files';
const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Trao đổi trong một tranh chấp (bảng dispute_messages + bucket riêng tư
// dispute-files). Gửi: file (nếu có) vào `<dispute_id>/<uuid>.<đuôi>` rồi gọi
// RPC add_dispute_message() — hàm tự xác định vai trò người gửi và báo cho
// các bên còn lại. Mở file: link ký tạm 5 phút. Không sửa/xoá được.
export function DisputeThread({
  disputeId,
  viewer,
  messages,
  closed,
}: {
  disputeId: string;
  viewer: DisputeViewer;
  messages: DisputeMessageRow[];
  /** Tranh chấp đã giải quyết: chỉ đọc. */
  closed: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(message: DisputeMessageRow) {
    if (!message.attachment_path) return;
    setError(null);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(message.attachment_path, 300);
    if (error || !data) {
      setError('Không mở được file. Vui lòng thử lại.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  function pick(next: File | null) {
    setError(null);
    if (next && !EXTENSION[next.type]) {
      setError('Chỉ nhận ảnh JPG / PNG / WebP hoặc PDF.');
      return;
    }
    if (next && next.size > MAX_SIZE) {
      setError('File tối đa 10MB.');
      return;
    }
    setFile(next);
  }

  async function send() {
    if (!body.trim() && !file) {
      setError('Nhập nội dung hoặc chọn file.');
      return;
    }
    setBusy(true);
    setError(null);

    let path: string | null = null;
    if (file) {
      path = `${disputeId}/${crypto.randomUUID()}.${EXTENSION[file.type]}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        setBusy(false);
        setError('Không tải được file lên. Vui lòng thử lại.');
        return;
      }
    }

    const { error } = await supabase.rpc('add_dispute_message', {
      p_dispute_id: disputeId,
      p_body: body,
      p_attachment_path: path,
      p_attachment_name: file?.name ?? null,
    });
    setBusy(false);
    if (error) {
      setError(disputeErrorMessage(error.message, 'Không gửi được. Vui lòng thử lại.'));
      return;
    }
    setBody('');
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
    router.refresh();
  }

  return (
    <div>
      {messages.length === 0 ? (
        <div className="text-brand-sub py-2 text-[13px]">
          Chưa có trao đổi nào. Gửi mô tả chi tiết và ảnh chụp để sàn xử lý nhanh hơn.
        </div>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {messages.map((m) => {
            const mine = m.sender_role === viewer;
            return (
              <li
                key={m.id}
                className={`max-w-[92%] rounded-[10px] border px-3 py-2 ${
                  mine
                    ? 'border-brand-border bg-brand-bg self-end'
                    : m.sender_role === 'admin'
                      ? 'self-start border-[#CFE0FF] bg-[#F1F6FF]'
                      : 'border-brand-border self-start bg-white'
                }`}
              >
                <div className="text-brand-sub mb-0.5 text-xs">
                  <strong className="text-brand-ink">
                    {mine ? 'Bạn' : (DISPUTE_ROLE_LABEL[m.sender_role] ?? m.sender_role)}
                  </strong>{' '}
                  · {formatVnDateTime(m.created_at)}
                </div>
                <div className="text-[13px] leading-relaxed break-words whitespace-pre-line">
                  {m.body}
                </div>
                {m.attachment_path && (
                  <button
                    type="button"
                    onClick={() => open(m)}
                    className="text-brand-blue mt-1 min-h-8 text-left text-xs font-semibold break-all"
                  >
                    📎 {m.attachment_name ?? 'Tệp đính kèm'}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {closed ? (
        <div className="text-brand-sub mt-3 border-t border-[#F2F0EC] pt-3 text-xs">
          Tranh chấp đã giải quyết — không gửi thêm trao đổi được.
        </div>
      ) : (
        <div className="mt-3 border-t border-[#F2F0EC] pt-3">
          <Textarea
            rows={3}
            maxLength={2000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Mô tả thêm, trả lời bên kia hoặc sàn..."
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            <Button variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
              📎 {file ? 'Đổi file' : 'Đính kèm'}
            </Button>
            {file && (
              <span className="text-brand-sub min-w-0 flex-1 truncate text-xs">{file.name}</span>
            )}
            <Button variant="primary" disabled={busy} className="ml-auto" onClick={send}>
              {busy ? 'Đang gửi...' : 'Gửi'}
            </Button>
          </div>
          <div className="text-brand-light mt-1.5 text-xs">
            Ảnh JPG / PNG / WebP hoặc PDF, tối đa 10MB.
          </div>
        </div>
      )}
      {error && <div className="text-brand-red mt-2 text-xs">{error}</div>}
    </div>
  );
}
