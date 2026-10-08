'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { orderErrorMessage } from '@/lib/orders';

// Ghi chú lên dòng thời gian của đơn qua RPC add_order_note() — buyer, xưởng
// của đơn và admin đều thấy.
export function OrderNoteForm({ orderId }: { orderId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('add_order_note', { p_order_id: orderId, p_note: note });
    setBusy(false);
    if (error) {
      setError(orderErrorMessage(error.message, 'Không gửi được ghi chú. Vui lòng thử lại.'));
      return;
    }
    setNote('');
    router.refresh();
  }

  return (
    <div className="border-brand-border mt-4 border-t pt-3.5">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Thêm ghi chú cho đơn này — các bên của đơn và sàn đều thấy"
        className="border-brand-border focus:border-brand-red w-full resize-none rounded-lg border-[1.5px] px-3 py-2 text-[13px] outline-none"
      />
      {error && <div className="text-brand-red mt-1 text-xs">{error}</div>}
      <button
        type="button"
        disabled={busy || !note.trim()}
        onClick={submit}
        className="border-brand-border hover:border-brand-ink mt-1.5 rounded-lg border-[1.5px] px-3.5 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        {busy ? 'Đang gửi...' : 'Gửi ghi chú'}
      </button>
    </div>
  );
}
