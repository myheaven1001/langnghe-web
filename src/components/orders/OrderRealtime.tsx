'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Cập nhật trực tiếp trang đơn: khi đơn đổi (trạng thái, vận đơn…), có sự
// kiện hoặc chứng từ mới thì tải lại dữ liệu server (router.refresh()).
// RLS vẫn là hàng rào thật: Realtime chỉ gửi dòng mình được SELECT.
export function OrderRealtime({ orderId }: { orderId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Một thao tác thường sinh 2–3 thay đổi liên tiếp (orders + order_events):
    // gom lại thành 1 lần tải.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase
      .channel(`order_${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        refresh,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_events',
          filter: `order_id=eq.${orderId}`,
        },
        refresh,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_documents',
          filter: `order_id=eq.${orderId}`,
        },
        refresh,
      )
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, router, orderId]);

  return null;
}
