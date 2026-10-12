import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/ui';
import { DisputeListView } from '@/components/disputes/DisputeViews';
import { loadDisputes } from '@/lib/disputes';
import { features } from '@/lib/features';
import { requireBuyer } from '@/lib/buyer-shell';

export const metadata: Metadata = {
  title: 'Tranh chấp — LàngNghề.vn',
};

// Danh sách tranh chấp (kế hoạch 5.8). Ẩn sau cờ NEXT_PUBLIC_FEATURE_DISPUTES.
export default async function BuyerDisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!features.disputes) notFound();

  const sp = await searchParams;
  const filter = sp.status === 'resolved' || sp.status === 'all' ? sp.status : 'open';

  const { supabase, shell } = await requireBuyer();
  const disputes = await loadDisputes(supabase, filter);

  return (
    <AppShell {...shell}>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Tranh chấp</h1>
        <div className="text-brand-sub mt-1 text-[13px]">
          Các đơn bạn hoặc xưởng đã báo có vấn đề. Sàn xem xét và ra quyết định.
        </div>
      </div>

      <DisputeListView disputes={disputes} viewer="buyer" filter={filter} />
    </AppShell>
  );
}
