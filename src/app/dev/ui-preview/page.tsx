import { AppShell, Card, CardBody, CardHeader, CardLink, Pill, StatCard } from '@/components/ui';
import { buildSupplierNavGroups } from '@/app/supplier/_lib/nav';
import { ProductForm } from '@/app/supplier/products/_components/ProductForm';
import { AccountSecurity } from '@/components/account/AccountSecurity';
import { BuyerCancelOrder } from '@/app/orders/[id]/_components/BuyerCancelOrder';
import { QuoteHistory } from '@/components/quotes/QuoteHistory';
import {
  CounterQuoteButton,
  RejectQuoteButton,
  WithdrawQuoteButton,
} from '@/components/quotes/QuoteNegotiation';
import type { QuoteRevision } from '@/lib/quotes';
import {
  DisputeDetailView,
  DisputeListView,
  OrderDisputeCard,
} from '@/components/disputes/DisputeViews';
import type { DisputeMessageRow, DisputeRow, RefundRow } from '@/lib/disputes';
import { ChatClient } from '@/app/messages/[id]/_components/ChatClient';
import type { ChatMessage, ConversationRow } from '@/app/messages/_lib/conversations';
import {
  ReviewForm,
  ReviewModerateButton,
  ReviewReplyForm,
} from '@/components/reviews/ReviewActions';
import { PublicReviews, ReviewCard } from '@/components/reviews/ReviewViews';
import type { PublicReview } from '@/lib/reviews';
import { ReportButton, SaveProductButton } from '@/components/engagement/ProductEngagement';
import { ImportClient } from '@/app/supplier/products/import/_components/ImportClient';
import { CartClient } from '@/app/cart/_components/CartClient';
import type { Cart } from '@/lib/cart';

// Temporary visual check for the shared components extracted from the
// *_page.html prototypes — mirrors a slice of dashboard_buyer_page.html so
// it can be eyeballed against the original. Safe to delete once the real
// /dashboard page is built (roadmap step 3.1).
// `?as=supplier` dựng khung khu nhà bán (có thanh điều hướng dưới cùng trên
// điện thoại) để xem thử mà không cần đăng nhập.
export default async function UiPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const asSupplier = sp.as === 'supplier' || sp.view === 'product-form';
  // `?view=product-form`: form sản phẩm từng bước với dữ liệu giả (không lưu được).
  const showProductForm = sp.view === 'product-form';
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
      navGroups={
        asSupplier
          ? buildSupplierNavGroups({ newRfqCount: 2, unreadCount: 5 })
          : [
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
            ]
      }
    >
      {sp.view === 'cart' ? (
        <>
          <CartClient cart={MOCK_CART} />
          <div className="mt-4 max-w-[360px]">
            <BuyerCancelOrder
              orderId="00000000-0000-0000-0000-000000000000"
              deadline="15/10/2026 14:30"
            />
          </div>
        </>
      ) : sp.view === 'quote' ? (
        <div className="flex max-w-[420px] flex-col gap-4">
          <div className="border-brand-border rounded-[10px] border bg-white p-4">
            <div className="mb-2 text-[13px] font-bold">Buyer xem báo giá</div>
            <QuoteHistory revisions={MOCK_REVISIONS} viewer="buyer" unit="cái" />
            <div className="flex flex-wrap gap-2">
              <CounterQuoteButton
                quoteId={MOCK_ID}
                viewer="buyer"
                unit="cái"
                quantity={500}
                currentPrice={46000}
                currentLeadTime={10}
              />
              <RejectQuoteButton quoteId={MOCK_ID} supplierName="Gốm Bát Tràng Minh Long" />
            </div>
          </div>
          <div className="border-brand-border rounded-[10px] border bg-white p-4">
            <div className="mb-2 text-[13px] font-bold">Xưởng trả lời đề nghị</div>
            <QuoteHistory revisions={MOCK_REVISIONS.slice(0, 3)} viewer="supplier" unit="cái" />
            <div className="flex flex-wrap gap-2">
              <CounterQuoteButton
                quoteId={MOCK_ID}
                viewer="supplier"
                unit="cái"
                quantity={500}
                currentPrice={45000}
                currentLeadTime={10}
                agree={{ price: 45000, leadTime: 8 }}
              />
              <WithdrawQuoteButton quoteId={MOCK_ID} />
            </div>
          </div>
        </div>
      ) : sp.view === 'dispute' ? (
        <>
          <DisputeDetailView
            dispute={MOCK_DISPUTE}
            messages={MOCK_DISPUTE_MESSAGES}
            refunds={MOCK_REFUNDS}
            viewer={sp.as === 'admin' ? 'admin' : 'buyer'}
          />
          <div className="mt-6">
            <DisputeListView disputes={[MOCK_DISPUTE]} viewer="buyer" filter="all" />
          </div>
          <div className="mt-6 max-w-[340px]">
            <OrderDisputeCard
              orderId={MOCK_ID}
              orderStatus="shipped"
              viewer="buyer"
              disputes={[]}
            />
          </div>
        </>
      ) : sp.view === 'chat' ? (
        <ChatClient
          conversationId={MOCK_ID}
          myRole="buyer"
          counterpart={{ name: 'Gốm Bát Tràng Minh Long', icon: '🏭', shopHref: '/shops/x' }}
          initialMessages={MOCK_CHAT}
          conversations={MOCK_CONVERSATIONS}
          pendingContext={{ type: 'order', id: 'a1b2c3d4-0000-0000-0000-000000000000' }}
        />
      ) : sp.view === 'reviews' ? (
        <div className="flex max-w-[640px] flex-col gap-4">
          <div className="border-brand-border rounded-[10px] border bg-white p-4">
            <div className="mb-2 text-[13px] font-bold">Buyer đánh giá đơn</div>
            <ReviewForm orderId={MOCK_ID} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <SaveProductButton
                productId={MOCK_ID}
                className="min-h-10 text-[13px] font-semibold"
              />
              <ReportButton
                targetType="product"
                targetId={MOCK_ID}
                className="text-brand-sub min-h-10 text-xs"
              />
            </div>
          </div>
          <PublicReviews
            summary={{ count: 12, average: 4.3, stars: { '5': 7, '4': 3, '3': 1, '2': 1, '1': 0 } }}
            reviews={MOCK_REVIEWS}
          />
          <div className="border-brand-border rounded-[10px] border bg-white p-4">
            <ReviewCard
              rating={2}
              author="Decor Hà Nội · Đơn #A1B2C3D4"
              createdAt="2026-10-09T03:00:00Z"
              comment="Sứt mẻ vài cái, đóng gói mỏng."
              reply={null}
              hiddenReason="Lời lẽ xúc phạm"
              footer={<ReviewModerateButton reviewId={MOCK_ID} hidden />}
            />
            <ReviewCard
              rating={4}
              author="Decor Hà Nội · Đơn #E5F6A7B8"
              createdAt="2026-10-10T03:00:00Z"
              comment="Hàng ổn, giao hơi chậm."
              reply={null}
              footer={<ReviewReplyForm reviewId={MOCK_ID} currentReply={null} />}
            />
          </div>
        </div>
      ) : sp.view === 'import' ? (
        <ImportClient
          categories={[
            { slug: 'gom-su', name: 'Gốm sứ' },
            { slug: 'may-tre-dan', name: 'Mây tre đan' },
          ]}
        />
      ) : sp.view === 'account' ? (
        <AccountSecurity email="lan@example.com" />
      ) : showProductForm ? (
        <ProductForm
          mode="create"
          supplierId="00000000-0000-0000-0000-000000000000"
          categories={[
            { id: 'c1', name: 'Gốm sứ' },
            { id: 'c2', name: 'Mây tre đan' },
          ]}
        />
      ) : (
        <>
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

          <div className="mb-[18px] grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                  <div className="text-brand-light mt-0.5 text-[11px]">
                    3 báo giá mới · còn 2 ngày
                  </div>
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
        </>
      )}
    </AppShell>
  );
}

// Giỏ hàng giả cho ?view=cart: 2 xưởng, có dòng lỗi (dưới MOQ, hết hàng).
const MOCK_LINE = {
  productId: 'p1',
  variantId: null,
  imageUrl: null,
  moq: 100,
  stock: null,
  problem: null,
} as const;
const MOCK_CART: Cart = {
  lineCount: 4,
  total: 2540000,
  hasProblems: true,
  groups: [
    {
      supplierId: 's1',
      supplierName: 'Gốm Bát Tràng Minh Long — xưởng sản xuất tên rất dài để thử xuống dòng',
      subtotal: 2040000,
      lines: [
        {
          ...MOCK_LINE,
          id: 'l1',
          name: 'Bát gốm men rạn Bát Tràng — bộ 6 món cao cấp',
          variantLabel: 'Xanh · 20cm',
          quantity: 60,
          productQty: 100,
          unitPrice: 20000,
          lineTotal: 1200000,
          supplierId: 's1',
        },
        {
          ...MOCK_LINE,
          id: 'l2',
          name: 'Bát gốm men rạn Bát Tràng — bộ 6 món cao cấp',
          variantLabel: 'Trắng · 20cm',
          quantity: 40,
          productQty: 100,
          unitPrice: 21000,
          lineTotal: 840000,
          supplierId: 's1',
          stock: 30,
          problem: 'out_of_stock',
        },
      ],
    },
    {
      supplierId: 's2',
      supplierName: 'Mây tre đan Phú Vinh',
      subtotal: 500000,
      lines: [
        {
          ...MOCK_LINE,
          id: 'l3',
          productId: 'p2',
          name: 'Giỏ mây đan quai da size M',
          variantLabel: null,
          quantity: 10,
          productQty: 10,
          moq: 10,
          unitPrice: 50000,
          lineTotal: 500000,
          supplierId: 's2',
        },
        {
          ...MOCK_LINE,
          id: 'l4',
          productId: 'p3',
          name: 'Khay mây chữ nhật',
          variantLabel: null,
          quantity: 5,
          productQty: 5,
          moq: 20,
          unitPrice: null,
          lineTotal: null,
          supplierId: 's2',
          problem: 'below_moq',
        },
      ],
    },
  ],
};

const MOCK_ID = '00000000-0000-0000-0000-000000000000';
const MOCK_REVISIONS: QuoteRevision[] = [
  {
    id: 'r1',
    quote_id: MOCK_ID,
    proposed_by: 'supplier',
    unit_price: 50000,
    lead_time_days: 10,
    note: null,
    created_at: '2026-10-10T02:00:00Z',
  },
  {
    id: 'r2',
    quote_id: MOCK_ID,
    proposed_by: 'supplier',
    unit_price: 48000,
    lead_time_days: 10,
    note: null,
    created_at: '2026-10-10T03:00:00Z',
  },
  {
    id: 'r3',
    quote_id: MOCK_ID,
    proposed_by: 'buyer',
    unit_price: 45000,
    lead_time_days: 8,
    note: 'Lấy đủ 500 cái, thanh toán ngay khi chốt',
    created_at: '2026-10-11T04:30:00Z',
  },
  {
    id: 'r4',
    quote_id: MOCK_ID,
    proposed_by: 'supplier',
    unit_price: 46000,
    lead_time_days: null,
    note: null,
    created_at: '2026-10-11T08:15:00Z',
  },
];

const MOCK_DISPUTE: DisputeRow = {
  id: MOCK_ID,
  order_id: 'a1b2c3d4-0000-0000-0000-000000000000',
  reason: 'Nhận 100 cái, 20 cái sứt mẻ, sai màu men so với mẫu đã chốt.',
  status: 'resolved',
  reporter_role: 'buyer',
  resolution: 'partial',
  refund_ratio: 0.4,
  resolution_note: 'Hoàn 40% vì 20 cái sứt, xưởng đồng ý.',
  created_at: '2026-10-08T02:00:00Z',
  resolved_at: '2026-10-11T09:00:00Z',
  orders: {
    id: 'a1b2c3d4-0000-0000-0000-000000000000',
    total: 5000000,
    status: 'shipped',
    buyer_profiles: { company_name: 'Decor Hà Nội' },
    supplier_profiles: { shop_name: 'Gốm Bát Tràng Minh Long' },
  },
};
const MOCK_DISPUTE_MESSAGES: DisputeMessageRow[] = [
  {
    id: 'm1',
    sender_role: 'buyer',
    body: 'Tôi gửi ảnh các bát bị sứt.',
    attachment_path: 'x/anh.jpg',
    attachment_name: 'bat-sut-me-thung-so-3.jpg',
    created_at: '2026-10-08T02:05:00Z',
  },
  {
    id: 'm2',
    sender_role: 'supplier',
    body: 'Xưởng đóng gói đủ, có video lúc giao cho đơn vị vận chuyển.',
    attachment_path: null,
    attachment_name: null,
    created_at: '2026-10-08T06:30:00Z',
  },
  {
    id: 'm3',
    sender_role: 'admin',
    body: 'Sàn đã nhận ảnh của hai bên, đang đối chiếu với biên bản giao nhận.',
    attachment_path: null,
    attachment_name: null,
    created_at: '2026-10-09T03:00:00Z',
  },
];
const MOCK_REFUNDS: RefundRow[] = [
  {
    id: 'f1',
    order_id: MOCK_DISPUTE.order_id,
    dispute_id: MOCK_ID,
    amount: 2000000,
    status: 'pending',
    note: null,
    bank_ref: null,
    created_at: '2026-10-11T09:00:00Z',
    paid_at: null,
  },
];

const MOCK_CHAT: ChatMessage[] = [
  {
    id: 'c1',
    senderRole: 'buyer',
    body: 'Xưởng còn mẫu bát men lam không ạ?',
    contextType: 'product',
    contextId: MOCK_ID,
    createdAt: '2026-10-10T02:00:00Z',
  },
  {
    id: 'c2',
    senderRole: 'supplier',
    body: 'Còn 200 cái, giao được ngay. Bên mình gửi ảnh thực tế qua Zalo nhé.',
    contextType: null,
    contextId: null,
    createdAt: '2026-10-10T02:10:00Z',
  },
  {
    id: 'c3',
    senderRole: 'buyer',
    body: 'Mình đã đặt RFQ 500 cái, xưởng xem giúp.',
    contextType: 'rfq',
    contextId: 'a1b2c3d4-0000-0000-0000-000000000000',
    createdAt: '2026-10-11T04:00:00Z',
  },
];
const MOCK_CONVERSATIONS: ConversationRow[] = [
  {
    id: MOCK_ID,
    myRole: 'buyer',
    counterpartId: 's1',
    counterpartName: 'Gốm Bát Tràng Minh Long',
    counterpartIcon: '🏭',
    lastMessage: 'Mình đã đặt RFQ 500 cái, xưởng xem giúp.',
    lastMessageIsMine: true,
    lastMessageAt: '2026-10-11T04:00:00Z',
    unreadCount: 0,
  },
  {
    id: 'c-2',
    myRole: 'buyer',
    counterpartId: 's2',
    counterpartName: 'Mây tre đan Phú Vinh',
    counterpartIcon: '🏭',
    lastMessage: 'Dạ xưởng báo giá trong hôm nay ạ',
    lastMessageIsMine: false,
    lastMessageAt: '2026-10-11T01:00:00Z',
    unreadCount: 2,
  },
];

const MOCK_REVIEWS: PublicReview[] = [
  {
    id: 'v1',
    rating: 5,
    comment: 'Hàng đẹp, men đều, giao đúng hẹn. Sẽ đặt tiếp lô sau.',
    supplier_reply: 'Cảm ơn anh chị đã tin tưởng xưởng.',
    replied_at: '2026-10-11T02:00:00Z',
    created_at: '2026-10-10T02:00:00Z',
    buyer_name: 'D**** H* N**',
  },
  {
    id: 'v2',
    rating: 3,
    comment: 'Chất lượng ổn nhưng đóng gói cần chắc hơn, vỡ 3 cái trong 200.',
    supplier_reply: null,
    replied_at: null,
    created_at: '2026-10-05T02:00:00Z',
    buyer_name: 'C*** T* H*** P****',
  },
];
