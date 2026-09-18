'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const REJECT_REASONS = [
  'Ảnh mờ, không đọc rõ',
  'Thông tin không khớp',
  'Giấy tờ hết hạn',
  'Thiếu tài liệu',
];

// Update trực tiếp verifications.status — RLS verifications_update_admin đã
// cho phép admin làm việc này. Trigger trg_handle_verification_status_change
// (xem supabase/migrations/20260930090000_verification_status_change.sql) tự
// stamp buyer_profiles.verified_at + gửi notification cho user, nên ở đây chỉ
// cần update đúng các cột của verifications.
export function VerificationActions({
  verificationId,
  displayName,
  adminUserId,
  redirectTo,
}: {
  verificationId: string;
  displayName: string;
  adminUserId: string;
  redirectTo: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('verifications')
      .update({
        status: 'approved',
        verified_by: adminUserId,
        verified_at: new Date().toISOString(),
      })
      .eq('id', verificationId);
    setBusy(false);
    if (error) {
      setError('Không thể duyệt hồ sơ. Vui lòng thử lại.');
      return;
    }
    router.push(redirectTo);
  }

  async function confirmReject() {
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do từ chối.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('verifications')
      .update({
        status: 'rejected',
        verified_by: adminUserId,
        verified_at: new Date().toISOString(),
        rejection_reason: reason.trim(),
      })
      .eq('id', verificationId);
    setBusy(false);
    if (error) {
      setError('Không thể từ chối hồ sơ. Vui lòng thử lại.');
      return;
    }
    router.push(redirectTo);
  }

  return (
    <div className="border-brand-border mt-4.5 border-t pt-4">
      {rejecting && (
        <div className="mb-3.5 rounded-lg border border-[#FFD0D0] bg-[#FFF8F8] p-3.5">
          <div className="mb-1 text-[12.5px] font-bold">Lý do từ chối</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {REJECT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(`${r}. `)}
                className="border-brand-border text-brand-sub hover:border-brand-red hover:text-brand-red rounded-full border-[1.5px] bg-white px-2.5 py-1 text-[11.5px]"
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Nhập lý do chi tiết gửi cho người dùng..."
            className="border-brand-border focus:border-brand-red w-full rounded-lg border-[1.5px] p-2.5 text-[12.5px] outline-none"
          />
          <button
            type="button"
            disabled={busy}
            onClick={confirmReject}
            className="bg-brand-red mt-2.5 rounded-lg px-4.5 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Đang lưu...' : 'Xác nhận từ chối'}
          </button>
        </div>
      )}

      {error && <div className="text-brand-red mb-2.5 text-[11.5px]">{error}</div>}

      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={approve}
          className="bg-brand-green flex-1 rounded-lg py-3 text-[13.5px] font-bold text-white disabled:opacity-60"
        >
          {busy && !rejecting ? 'Đang lưu...' : `✓ Duyệt hồ sơ ${displayName}`}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setRejecting((v) => !v)}
          className="border-brand-red text-brand-red flex-1 rounded-lg border-[1.5px] bg-white py-3 text-[13.5px] font-bold disabled:opacity-60"
        >
          ✕ Từ chối
        </button>
      </div>
    </div>
  );
}
