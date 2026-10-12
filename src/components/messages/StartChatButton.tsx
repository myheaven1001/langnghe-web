'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { messageErrorMessage, type MessageContextType } from '@/app/messages/_lib/conversations';

// Mở (hoặc mở lại) hội thoại với bên kia rồi chuyển sang trang chat (kế hoạch
// 5.9). Buyer truyền `supplierId`, xưởng truyền `buyerId`; `context` gắn chủ
// đề (RFQ / đơn / sản phẩm) cho tin đầu tiên. RPC start_conversation() tự
// kiểm tra hai bên được phép nhắn cho nhau.
export function StartChatButton({
  supplierId,
  buyerId,
  context,
  className,
  children,
}: {
  supplierId?: string;
  buyerId?: string;
  context?: { type: MessageContextType; id: string };
  className?: string;
  children: ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('start_conversation', {
      p_supplier_id: supplierId ?? null,
      p_buyer_id: buyerId ?? null,
    });
    if (error || !data) {
      setBusy(false);
      setError(messageErrorMessage(error?.message ?? '', 'Không mở được hội thoại. Thử lại.'));
      return;
    }
    const query = context ? `?ctx=${context.type}:${context.id}` : '';
    router.push(`/messages/${data as string}${query}`);
  }

  return (
    <>
      <button type="button" disabled={busy} onClick={start} className={className}>
        {busy ? 'Đang mở...' : children}
      </button>
      {error && <span className="text-brand-red block w-full text-xs">{error}</span>}
    </>
  );
}
