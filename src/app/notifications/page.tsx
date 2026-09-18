import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getNewRfqCount } from '../supplier/_lib/counts';
import { loadBuyerConversations, loadSupplierConversations } from '../messages/_lib/conversations';
import { NotificationsClient, type NotificationRow } from './_components/NotificationsClient';

export const metadata: Metadata = {
  title: 'Thông báo — LàngNghề.vn',
};

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: buyer }, { data: supplier }] = await Promise.all([
    supabase.from('buyer_profiles').select('id, company_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('supplier_profiles').select('id, shop_name').eq('user_id', user.id).maybeSingle(),
  ]);
  if (!buyer && !supplier) redirect('/');

  const [{ data: notificationsData }, newRfqCount, conversations] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, type, title, body, payload, is_read, read_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(300),
    supplier ? getNewRfqCount(supabase, supplier.id) : Promise.resolve(0),
    buyer
      ? loadBuyerConversations(supabase, buyer.id)
      : loadSupplierConversations(supabase, supplier!.id),
  ]);

  const notifications = (notificationsData ?? []) as NotificationRow[];
  const unreadMessageThreadCount = conversations.filter((c) => c.unreadCount > 0).length;

  return (
    <NotificationsClient
      userId={user.id}
      role={buyer ? 'buyer' : 'supplier'}
      buyer={buyer}
      supplier={supplier}
      newRfqCount={newRfqCount}
      unreadMessageThreadCount={unreadMessageThreadCount}
      initialNotifications={notifications}
    />
  );
}
