'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatVnDateTime } from '@/lib/format';
import {
  DOC_TYPES_BY_ROLE,
  DOC_TYPE_LABEL,
  ORDER_ROLE_LABEL,
  orderErrorMessage,
  type OrderDocumentRow,
  type OrderRole,
} from '@/lib/orders';

const BUCKET = 'order-documents';
const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Chứng từ của đơn (bảng order_documents + bucket riêng tư order-documents).
// Tải lên: file vào `<order_id>/<uuid>.<đuôi>` rồi thêm dòng order_documents
// — trigger DB tự điền người tải/vai trò và ghi event document_added. Xem:
// tạo link ký tạm 5 phút. Không sửa/xoá được (chứng từ là bằng chứng).
export function OrderDocuments({
  orderId,
  role,
  documents,
  defaultDocType,
  canUpload = true,
}: {
  orderId: string;
  role: OrderRole;
  documents: OrderDocumentRow[];
  defaultDocType?: string;
  canUpload?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const docTypes = DOC_TYPES_BY_ROLE[role];
  const [docType, setDocType] = useState(
    defaultDocType && docTypes.includes(defaultDocType) ? defaultDocType : docTypes[0],
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(doc: OrderDocumentRow) {
    setError(null);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 300);
    if (error || !data) {
      setError('Không mở được chứng từ. Vui lòng thử lại.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function upload() {
    const file = fileInput.current?.files?.[0];
    if (!file) return setError('Vui lòng chọn file.');
    const extension = EXTENSION[file.type];
    if (!extension) return setError('Chỉ nhận file PDF, JPG, PNG hoặc WEBP.');
    if (file.size > MAX_SIZE) return setError('File tối đa 10MB.');

    setBusy(true);
    setError(null);
    const path = `${orderId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setBusy(false);
      setError('Không tải được file lên. Vui lòng thử lại.');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from('order_documents').insert({
      order_id: orderId,
      uploaded_by: user?.id,
      uploader_role: role,
      doc_type: docType,
      storage_path: path,
      file_name: file.name.slice(0, 200),
      mime_type: file.type,
      file_size: file.size,
      note: note.trim() || null,
    });
    setBusy(false);
    if (insertError) {
      setError(
        orderErrorMessage(insertError.message, 'Không lưu được chứng từ. Vui lòng thử lại.'),
      );
      return;
    }

    setNote('');
    if (fileInput.current) fileInput.current.value = '';
    router.refresh();
  }

  return (
    <div>
      {documents.length === 0 ? (
        <div className="text-brand-light text-xs">Chưa có chứng từ nào.</div>
      ) : (
        <ul className="divide-y divide-[#F2F0EC]">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
              <div className="min-w-0 text-xs">
                <div className="font-semibold">{DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}</div>
                <div className="text-brand-sub break-all">{doc.file_name}</div>
                {doc.note && <div className="text-brand-sub mt-0.5">{doc.note}</div>}
                <div className="text-brand-light mt-0.5 text-[10.5px]">
                  {formatVnDateTime(doc.created_at)} · {ORDER_ROLE_LABEL[doc.uploader_role]}
                </div>
              </div>
              <button
                type="button"
                onClick={() => open(doc)}
                className="border-brand-border text-brand-sub hover:border-brand-ink hover:text-brand-ink shrink-0 rounded-md border-[1.5px] px-2.5 py-1 text-[11.5px] font-semibold"
              >
                Xem
              </button>
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <div className="border-brand-border mt-3 border-t pt-3">
          <div className="mb-2 text-xs font-semibold">Tải chứng từ lên</div>
          <div className="flex flex-col gap-2">
            {docTypes.length > 1 && (
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] bg-white px-3 py-2 text-[12.5px] outline-none"
              >
                {docTypes.map((t) => (
                  <option key={t} value={t}>
                    {DOC_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            )}
            <input ref={fileInput} type="file" accept={ACCEPT} className="text-xs" />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Ghi chú (không bắt buộc)"
              className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] px-3 py-2 text-[12.5px] outline-none"
            />
            <div className="text-brand-light text-[10.5px]">PDF, JPG, PNG, WEBP — tối đa 10MB.</div>
          </div>
          {error && <div className="text-brand-red mt-2 text-[11.5px]">{error}</div>}
          <button
            type="button"
            disabled={busy}
            onClick={upload}
            className="bg-brand-red hover:bg-brand-red-dark mt-2.5 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Đang tải lên...' : 'Tải lên'}
          </button>
        </div>
      )}
      {!canUpload && error && <div className="text-brand-red mt-2 text-[11.5px]">{error}</div>}
    </div>
  );
}
