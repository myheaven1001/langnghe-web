import { AppShell, Card, CardBody, CardHeader, CardLink, Pill, StatCard } from '@/components/ui';

// Temporary visual check for the shared components extracted from the
// *_page.html prototypes — mirrors a slice of dashboard_buyer_page.html so
// it can be eyeballed against the original. Safe to delete once the real
// /dashboard page is built (roadmap step 3.1).
export default function UiPreviewPage() {
  return (
    <AppShell
      header={{
        icons: [
          { icon: '💬', title: 'Tin nhắn', badge: 3 },
          { icon: '🔔', title: 'Thông báo', badge: 5 },
        ],
        userName: 'Nguyễn Thị Lan',
        userRole: 'Shop Decor Hà Nội',
        userInitial: 'L',
      }}
      navGroups={[
        { items: [{ icon: '🏠', label: 'Dashboard', href: '/dev/ui-preview' }] },
        {
          label: 'Mua hàng',
          items: [
            { icon: '📝', label: 'Gửi RFQ mới', href: '/rfq/new' },
            { icon: '📋', label: 'RFQ của tôi', href: '/rfq', count: 4 },
            { icon: '📦', label: 'Đơn hàng', href: '/orders' },
          ],
        },
        {
          label: 'Kết nối',
          items: [
            { icon: '💬', label: 'Nhắn tin', href: '/messages', count: 3 },
            { icon: '🔔', label: 'Thông báo', href: '/notifications' },
          ],
        },
      ]}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xl font-bold">
            Chào Lan 👋{' '}
            <span className="bg-status-green-soft text-status-green inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
              ✓ Đã xác minh
            </span>
          </div>
          <div className="text-brand-sub mt-1 text-[12.5px]">
            Component preview — components/ui/*
          </div>
        </div>
        <button className="bg-brand-red hover:bg-brand-red-dark rounded-md px-[18px] py-2.5 text-sm font-semibold whitespace-nowrap text-white">
          + Gửi RFQ mới
        </button>
      </div>

      <div className="mb-[18px] grid grid-cols-4 gap-3">
        <StatCard
          icon="📋"
          iconTone="blue"
          delta="Đang mở"
          deltaTone="up"
          value={4}
          label="RFQ đang hoạt động"
        />
        <StatCard
          icon="💰"
          iconTone="amber"
          delta="+2 mới"
          deltaTone="new"
          value={7}
          label="Báo giá chờ phản hồi"
        />
        <StatCard
          icon="📦"
          iconTone="purple"
          delta="1 sắp giao"
          deltaTone="up"
          value={3}
          label="Đơn hàng đang xử lý"
        />
        <StatCard
          icon="💬"
          iconTone="red"
          delta="3 chưa đọc"
          deltaTone="new"
          value={12}
          label="Cuộc hội thoại"
        />
      </div>

      <Card>
        <CardHeader title={<>📋 RFQ gần đây</>} action={<CardLink>Xem tất cả →</CardLink>} />
        <CardBody>
          <div className="flex items-center gap-3 border-b border-[#F2F0EC] px-[18px] py-[11px]">
            <div className="bg-brand-bg flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[7px] text-base">
              🏺
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-brand-ink truncate text-[12.5px] font-semibold">
                Bát đĩa gốm men rạn Bát Tràng — 2.000 bộ
              </div>
              <div className="text-brand-light mt-0.5 text-[11px]">3 báo giá mới · còn 2 ngày</div>
            </div>
            <Pill tone="amber">Đã có báo giá</Pill>
          </div>
          <div className="flex items-center gap-3 px-[18px] py-[11px]">
            <div className="bg-brand-bg flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[7px] text-base">
              🪔
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-brand-ink truncate text-[12.5px] font-semibold">
                Khay sơn mài quà tặng DN — 1.200 cái
              </div>
              <div className="text-brand-light mt-0.5 text-[11px]">Đã chọn xưởng Thiên Phú</div>
            </div>
            <Pill tone="green">Đã chốt</Pill>
          </div>
        </CardBody>
      </Card>
    </AppShell>
  );
}
