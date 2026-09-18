'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// Cùng bucket verification-documents với buyer (3.7) — path prefix
// 'supplier/' thay vì 'buyer/', bucket được thiết kế dùng chung ngay từ
// đầu (xem 20260921090000_verification_documents_bucket.sql).
export function VerificationUpload({
  supplierId,
  nextAttemptNumber,
}: {
  supplierId: string;
  nextAttemptNumber: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Chỉ chấp nhận file PDF hoặc ảnh (JPG, PNG, WebP).');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('File vượt quá 10MB. Vui lòng chọn file nhỏ hơn.');
      return;
    }

    setStatus('uploading');

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `supplier/${supplierId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('verification-documents')
      .upload(path, file, { upsert: false });

    if (uploadError) {
      setStatus('idle');
      setError('Không thể tải file lên. Vui lòng thử lại.');
      return;
    }

    const { error: insertError } = await supabase.from('verifications').insert({
      entity_id: supplierId,
      entity_type: 'supplier',
      attempt_number: nextAttemptNumber,
      business_license_url: path,
    });

    if (insertError) {
      setStatus('idle');
      setError('Đã tải file lên nhưng không thể gửi yêu cầu xác minh. Vui lòng thử lại.');
      return;
    }

    setStatus('done');
    router.refresh();
  }

  if (status === 'done') {
    return (
      <div className="border-brand-border rounded-lg border-[1.5px] border-dashed bg-[#FAFAF8] p-4 text-center">
        <div className="mb-1.5 text-[22px]">✅</div>
        <div className="text-brand-sub text-xs">Đã gửi giấy tờ mới — chờ duyệt lại</div>
        <div className="text-brand-light mt-0.5 text-[11px]">
          Đội kiểm duyệt sẽ xem xét trong 1–2 ngày làm việc
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={status === 'uploading'}
        onClick={() => inputRef.current?.click()}
        className="border-brand-border hover:border-brand-red block w-full rounded-lg border-[1.5px] border-dashed bg-[#FAFAF8] p-4 text-center transition-colors hover:bg-[#FFF8F8] disabled:opacity-60"
      >
        <div className="mb-1.5 text-[22px]">{status === 'uploading' ? '⏳' : '🔄'}</div>
        <div className="text-brand-sub text-xs">
          {status === 'uploading'
            ? 'Đang tải lên...'
            : nextAttemptNumber > 1
              ? 'Cập nhật giấy tờ / chứng chỉ mới'
              : 'Tải lên giấy phép kinh doanh'}
        </div>
        <div className="text-brand-light mt-0.5 text-[11px]">PDF hoặc ảnh rõ nét · Tối đa 10MB</div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      {error && <div className="text-brand-red mt-2 text-[11.5px]">{error}</div>}
    </div>
  );
}
