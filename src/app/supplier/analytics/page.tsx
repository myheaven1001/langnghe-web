import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui';
import { buildSupplierNavGroups } from '../_lib/nav';
import { getNewRfqCount, getUnreadNotificationCount } from '../_lib/counts';

export const metadata: Metadata = {
  title: 'Analytics xưởng — LàngNghề.vn',
};

// Prototype (supplier_analytics_page.html) đọc số liệu từ search_logs và
// rfq_metrics — 2 bảng của migration_sprint3.sql, thuộc Giai đoạn 8 của
// PROJECT_ROADMAP.md, CHƯA chạy trên Supabase (chưa có trong
// supabase/migrations/). Khác rfq_targets/order_events/product_variants
// (đã port riêng ở các task trước vì chỉ là 1 bảng độc lập cần ngay cho
// đúng task đó), search_logs/rfq_metrics là cả một hệ ghi log — gắn với
// việc "ghi log tìm kiếm + cập nhật rfq_metrics" mà Giai đoạn 8 mô tả rõ là
// việc riêng, làm trước phần UI này mới có dữ liệu thật để hiển thị. Vẽ
// biểu đồ giả ở đây sẽ sai với chính yêu cầu "hiển thị dữ liệu thật" của
// toàn bộ dự án này — nên trang này chỉ dựng khung điều hướng thật (để
// sidebar "Analytics" không dẫn tới 404) + thông báo rõ đang chờ Giai đoạn 8.
export default async function SupplierAnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: supplier } = await supabase
    .from('supplier_profiles')
    .select('id, shop_name')
    .eq('user_id', user.id)
    .single();

  if (!supplier) redirect('/');

  const [newRfqCount, unreadCount] = await Promise.all([
    getNewRfqCount(supabase, supplier.id),
    getUnreadNotificationCount(supabase, user.id),
  ]);

  return (
    <AppShell
      header={{
        icons: [
          { icon: '💬', title: 'Tin nhắn' },
          { icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined },
        ],
        userName: supplier.shop_name,
        userRole: 'Supplier',
      }}
      navGroups={buildSupplierNavGroups({ newRfqCount, unreadCount })}
    >
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/supplier/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Analytics</span>
      </div>

      <div className="mb-[18px]">
        <div className="text-xl font-bold">Analytics xưởng</div>
        <div className="text-brand-sub mt-1 text-[12.5px]">
          Lượt xem, hiệu suất tìm kiếm và chỉ số RFQ theo thời gian.
        </div>
      </div>

      <div className="border-brand-border rounded-[10px] border border-dashed bg-white px-5 py-[60px] text-center">
        <div className="mb-3 text-[36px]">📊</div>
        <div className="mb-1.5 text-sm font-bold">Chưa có dữ liệu Analytics</div>
        <div className="text-brand-sub mx-auto max-w-[440px] text-xs leading-relaxed">
          Trang này cần bảng <code className="text-brand-ink">search_logs</code> và{' '}
          <code className="text-brand-ink">rfq_metrics</code> — thuộc{' '}
          <strong className="text-brand-ink">Giai đoạn 8</strong> của roadmap, chưa chạy trên
          database. Việc ghi log lượt tìm kiếm/xem sản phẩm và cập nhật chỉ số RFQ cần chạy trước để
          trang này có số liệu thật — vẽ biểu đồ mẫu ở đây sẽ là số liệu giả.
        </div>
        <div className="text-brand-light mt-3 text-[11px]">
          Sau khi Giai đoạn 8 chạy xong, trang này sẽ được nối vào 2 bảng đó.
        </div>
      </div>
    </AppShell>
  );
}
