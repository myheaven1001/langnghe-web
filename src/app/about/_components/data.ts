// Hardcoded content transcribed from about_faq_page.html.

export const ABOUT_STATS = [
  { num: '1.200+', label: 'Nhà cung cấp' },
  { num: '8.400+', label: 'Sản phẩm' },
  { num: '28', label: 'Ngành hàng' },
  { num: '15', label: 'Quốc gia' },
];

export interface WhyCard {
  icon: string;
  title: string;
  desc: string;
}

export const WHY_CARDS: WhyCard[] = [
  {
    icon: '💰',
    title: 'Giá xưởng, không trung gian',
    desc: 'Mua thẳng từ xưởng sản xuất, giá rẻ hơn 30–60% so với qua đại lý hay sàn B2C. Không có phí hoa hồng ẩn.',
  },
  {
    icon: '🔒',
    title: 'Thanh toán Escrow an toàn',
    desc: 'Tiền được giữ trung gian bởi sàn. Chỉ về tay xưởng sau khi bạn nhận hàng và xác nhận đạt chất lượng.',
  },
  {
    icon: '✅',
    title: 'Xưởng được xác minh',
    desc: '100% nhà cung cấp đã được kiểm tra giấy phép kinh doanh, địa chỉ thực địa, và năng lực sản xuất.',
  },
  {
    icon: '⚡',
    title: 'Báo giá trong 4 giờ',
    desc: 'Gửi 1 yêu cầu, nhận báo giá từ nhiều xưởng. Hệ thống RFQ tự động kết nối với xưởng phù hợp nhất.',
  },
  {
    icon: '🎨',
    title: 'OEM & Đặt theo mẫu riêng',
    desc: 'Đặt hàng in logo, thay đổi màu sắc, kích thước, chất liệu. Hỗ trợ từ 200 cái cho OEM.',
  },
  {
    icon: '🌏',
    title: 'Xuất khẩu toàn cầu',
    desc: 'CO/CQ đầy đủ, hỗ trợ thủ tục hải quan, giao hàng đến 163 quốc gia qua đối tác logistics.',
  },
];

export interface TimelineItem {
  year: string;
  title: string;
  desc: string;
  planned?: boolean;
}

export const TIMELINE: TimelineItem[] = [
  {
    year: '2024 Q3',
    title: 'Ý tưởng ra đời',
    desc: 'Sau khi gặp các chủ xưởng Bát Tràng vẫn bán hàng qua Zalo thủ công trong khi 1688.com đang vào Việt Nam.',
  },
  {
    year: '2024 Q4',
    title: 'Nghiên cứu thị trường',
    desc: 'Phỏng vấn 80+ chủ xưởng và 40+ buyer tại Hà Nội. Xác nhận pain point: giá không minh bạch, khó tìm nguồn hàng uy tín.',
  },
  {
    year: '2025 Q1',
    title: 'Beta launch',
    desc: 'Beta launch: 50 xưởng đầu tiên, 200 buyer đăng ký. Giao dịch đầu tiên: 300 bình gốm men lam từ xưởng Bát Tràng → shop decor Hà Nội.',
  },
  {
    year: '2025 Q2',
    title: 'Mở rộng toàn quốc',
    desc: '1.200+ xưởng, 28 ngành hàng, 8.400+ sản phẩm. Tích hợp Escrow và hệ thống xác minh tự động.',
  },
  {
    year: '2025 Q4 (kế hoạch)',
    title: 'Mở rộng quốc tế',
    desc: 'Kết nối buyer Châu Âu, Nhật Bản, Mỹ. Hỗ trợ đa ngôn ngữ và logistics quốc tế.',
    planned: true,
  },
];

export interface TeamMember {
  initial: string;
  gradient: string;
  name: string;
  role: string;
  detail: string;
}

export const TEAM: TeamMember[] = [
  {
    initial: 'N',
    gradient: 'bg-[linear-gradient(135deg,#1A3A2A,#2d5a3d)]',
    name: 'Nguyễn Minh Anh',
    role: 'CEO & Co-founder',
    detail: 'Ex-Telio, 8 năm TMĐT',
  },
  {
    initial: 'T',
    gradient: 'bg-[linear-gradient(135deg,#C4622D,#E8A87C)]',
    name: 'Trần Thị Lan',
    role: 'CPO & Co-founder',
    detail: 'Ex-Shopee, Product Lead',
  },
  {
    initial: 'H',
    gradient: 'bg-[linear-gradient(135deg,#1677FF,#69B1FF)]',
    name: 'Hoàng Văn Đức',
    role: 'CTO',
    detail: 'Ex-VNPay, Backend Lead',
  },
  {
    initial: 'P',
    gradient: 'bg-[linear-gradient(135deg,#7F77DD,#AFA9EC)]',
    name: 'Phạm Thu Hà',
    role: 'Head of Operations',
    detail: '10 năm logistics B2B',
  },
];

export interface Partner {
  name: string;
  sub: string;
}

export const PARTNERS: Partner[] = [
  { name: 'Bộ Công Thương', sub: 'Chứng nhận sàn TMĐT' },
  { name: 'GHN Express', sub: 'Logistics partner' },
  { name: 'VNPay', sub: 'Cổng thanh toán' },
  { name: 'Hiệp hội Làng nghề VN', sub: 'Đối tác chiến lược' },
  { name: 'Cloudflare', sub: 'Infrastructure' },
];

export const FAQ_CATEGORIES = [
  'Tất cả',
  'Đặt hàng & RFQ',
  'Thanh toán & Escrow',
  'Giao hàng',
  'Tài khoản',
  'Nhà cung cấp',
];

export interface FaqItem {
  q: string;
  a: string;
  defaultOpen?: boolean;
  link?: { label: string; href: string };
}

export interface FaqGroup {
  title: string;
  category: string;
  items: FaqItem[];
}

export const FAQ_GROUPS: FaqGroup[] = [
  {
    title: '📋 Đặt hàng & RFQ',
    category: 'Đặt hàng & RFQ',
    items: [
      {
        q: 'RFQ là gì? Tại sao không đặt hàng ngay?',
        a: 'RFQ (Request for Quotation) là yêu cầu báo giá — bạn mô tả nhu cầu (số lượng, chất liệu, thời gian giao...) và xưởng sẽ báo giá cụ thể. Đây là chuẩn trong B2B vì giá phụ thuộc vào số lượng, tuỳ chỉnh và thời điểm sản xuất. Mua ngay chỉ phù hợp khi bạn chắc chắn về số lượng và giá hiển thị.',
      },
      {
        q: 'Tôi có thể gửi RFQ đến nhiều xưởng cùng lúc không?',
        a: 'Có — đây gọi là Multi-RFQ. Bạn đăng 1 yêu cầu, nhiều xưởng cùng báo giá cạnh tranh. Xưởng không biết ai đang cạnh tranh với mình nên luôn đưa giá tốt nhất. Tính năng này có với gói Cơ bản (1.5tr/năm) trở lên hoặc mua credit riêng.',
      },
      {
        q: 'Hạn mức gửi RFQ là bao nhiêu?',
        a: 'Gói Miễn phí: 5 RFQ/tháng, chỉ gửi 1 xưởng mỗi lần. Gói Cơ bản: 30 RFQ/tháng, gửi tối đa 3 xưởng cùng lúc. Gói Premium: không giới hạn, tối đa 10 xưởng/RFQ. Hết hạn mức có thể mua credit bổ sung (1 credit = 1 RFQ).',
      },
      {
        q: 'Mất bao lâu để nhận được báo giá?',
        a: 'Trung bình 2–4 giờ trong giờ hành chính. Xưởng có trách nhiệm phản hồi trong 48 giờ — nếu không, hệ thống tự điều hướng sang xưởng khác. Tỷ lệ phản hồi trung bình toàn sàn là 97%.',
      },
    ],
  },
  {
    title: '🔒 Thanh toán & Escrow',
    category: 'Thanh toán & Escrow',
    items: [
      {
        q: 'Escrow hoạt động như thế nào?',
        a: 'Buyer thanh toán vào tài khoản trung gian của sàn → Sàn giữ tiền an toàn → Xưởng sản xuất và giao hàng → Buyer nhận hàng và xác nhận đạt chất lượng → Sàn chuyển tiền cho xưởng. Nếu buyer không phản hồi sau 14 ngày, tiền tự động giải phóng. Có tranh chấp, sàn phân xử dựa trên bằng chứng.',
      },
      {
        q: 'Nếu hàng không đúng mô tả thì xử lý thế nào?',
        a: 'Mở tranh chấp trong vòng 7 ngày kể từ ngày nhận hàng. Cung cấp bằng chứng (ảnh, video so sánh với mô tả). Đội hỗ trợ sàn sẽ xem xét và ra quyết định trong 3–5 ngày làm việc. Kết quả có thể là: hoàn tiền toàn bộ, hoàn một phần, hoặc giải phóng cho xưởng tùy mức độ.',
        defaultOpen: true,
        link: { label: 'Xem chính sách tranh chấp đầy đủ →', href: '#' },
      },
      {
        q: 'Phương thức thanh toán nào được hỗ trợ?',
        a: 'Chuyển khoản ngân hàng, VNPay, MoMo, ZaloPay. Với đơn trên 100 triệu có thể liên hệ để được hỗ trợ thanh toán theo đợt (đặt cọc 30%, còn lại khi giao hàng).',
      },
    ],
  },
  {
    title: '🚚 Giao hàng',
    category: 'Giao hàng',
    items: [
      {
        q: 'Ai chịu phí vận chuyển?',
        a: 'Buyer chịu phí ship trừ khi có thỏa thuận khác với xưởng trong quá trình đàm phán RFQ. Với đơn lớn (500+ cái) xưởng thường hỗ trợ một phần phí ship — ghi vào yêu cầu RFQ để thương lượng.',
      },
      {
        q: 'Tôi có thể theo dõi đơn hàng như thế nào?',
        a: 'Sau khi xưởng giao hàng, mã vận đơn được cập nhật tự động trên trang chi tiết đơn hàng. Bạn click vào để xem trạng thái realtime qua GHN, GHTK hoặc Viettel Post. Ngoài ra nhận thông báo push/email khi hàng đến kho phân phối gần bạn.',
      },
    ],
  },
];
