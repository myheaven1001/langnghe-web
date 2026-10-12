import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/ui';
import { DisputeDetailView } from '@/components/disputes/DisputeViews';
import { loadDispute } from '@/lib/disputes';
import { features } from '@/lib/features';
import { requireSupplier } from '../../_lib/guard';

export const metadata: Metadata = {
  title: 'Chi tiết tranh chấp — LàngNghề.vn',
};

// Chi tiết tranh chấp (kế hoạch 5.8). Không tồn tại hoặc không thuộc đơn của
// người xem (RLS chặn) đều trả 404 như nhau.
export default async function SupplierDisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!features.disputes) notFound();

  const { id } = await params;
  const { supabase, shell } = await requireSupplier();
  const data = await loadDispute(supabase, id);
  if (!data) notFound();

  return (
    <AppShell {...shell}>
      <DisputeDetailView {...data} viewer="supplier" />
    </AppShell>
  );
}
