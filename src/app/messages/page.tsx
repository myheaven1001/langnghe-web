import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui';
import { getUnreadNotificationCount, getNewRfqCount } from '../supplier/_lib/counts';
import { loadBuyerConversations, loadSupplierConversations } from './_lib/conversations';
import { buildMessagesShell } from './_lib/shell';
import { MessagesInboxClient } from './_components/MessagesInboxClient';

export const metadata: Metadata = {
  title: 'Nhắn tin — LàngNghề.vn',
};

export default async function MessagesInboxPage() {
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

  const [unreadCount, newRfqCount, conversations] = await Promise.all([
    getUnreadNotificationCount(supabase, user.id),
    supplier ? getNewRfqCount(supabase, supplier.id) : Promise.resolve(0),
    buyer
      ? loadBuyerConversations(supabase, buyer.id)
      : loadSupplierConversations(supabase, supplier!.id),
  ]);

  const unreadThreadCount = conversations.filter((c) => c.unreadCount > 0).length;

  const { header, navGroups } = buildMessagesShell({
    buyer,
    supplier,
    unreadCount,
    newRfqCount,
    unreadThreadCount,
  });

  return (
    <AppShell header={header} navGroups={navGroups}>
      <MessagesInboxClient conversations={conversations} />
    </AppShell>
  );
}
