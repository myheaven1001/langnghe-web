# 🗺️ Roadmap dự án LàngNghề.vn — Từ Prototype đến Production

> File này là checklist tổng thể để đưa 36 trang prototype + schema DB đã có thành một website **chạy thật**. Bạn không cần biết code — mỗi đầu việc đều có sẵn **Prompt AI** để copy-paste cho Claude Code làm giúp.

> **Cập nhật 22/9/2026:** Giai đoạn 0–8 đã xong (tick lại theo đúng trạng thái code + DB thật, trước đó nhiều mục đã làm nhưng chưa được tick). 9.1 (chuyển khoản thủ công) đã có sẵn ở `/admin/orders`. Đang ở đầu Giai đoạn 9 (9.2 cổng thanh toán membership, 9.3 escrow — chưa làm) → tiếp theo là Giai đoạn 10 (testing/bảo mật trước ra mắt).

---

## 📖 Cách dùng file này (đọc trước khi bắt đầu)

1. **Làm theo thứ tự từ trên xuống.** Nhiều việc phụ thuộc việc phía trước — nhảy cóc sẽ bị lỗi.
2. Mỗi đầu việc có 3 phần: **Mục tiêu** (làm gì/để làm gì) → **Prompt AI** (copy nguyên văn dán vào Claude Code) → **Kiểm tra** (làm sao biết đã xong).
3. Đánh dấu `[x]` khi xong để theo dõi tiến độ. Coi đây như bản `page_inventory_b2b.html` nhưng cho phần dựng app thật.
4. **Claude Code phải chạy trên máy tính thật** (VS Code / terminal), trỏ vào thư mục code của dự án — không phải chat này. Chat này (claude.ai) dùng để tư vấn, lên kế hoạch, thiết kế UI; Claude Code dùng để viết/chạy code thật.
5. Sau mỗi đầu việc: mở `npm run dev`, xem trên trình duyệt trước khi qua việc tiếp theo. Đừng làm 5 việc rồi mới kiểm tra — khó biết lỗi ở đâu.

### 🧭 Nguyên tắc làm việc với AI (dành cho người không chuyên code)

- **Luôn nói rõ AI đang làm trong project nào**, ví dụ: "Đây là dự án Next.js + Supabase tên LàngNghề.vn, đọc file CLAUDE.md để hiểu ngữ cảnh trước khi làm."
- **Khi có lỗi**: copy **nguyên văn** dòng lỗi (error message) dán cho AI, đừng tự diễn giải lại — AI cần đọc chính xác để chẩn đoán.
- **Sau mỗi tính năng chạy được**: yêu cầu AI `git commit` với message rõ ràng. Nếu bước sau làm hỏng, bạn quay lại được.
- **Không bao giờ** dán nội dung file `.env` / API key vào chat công khai hoặc gửi cho ai.
- Nếu không chắc AI hiểu đúng ý, yêu cầu: *"Trước khi code, tóm tắt lại bạn hiểu tôi muốn gì"* — rẻ hơn nhiều so với sửa sau khi code sai.
- Một task lớn nên **bẻ nhỏ** — đừng prompt "làm hết website đi", làm từng trang/từng tính năng một như checklist dưới đây.

---

## 🧱 Giai đoạn 0 — Chuẩn bị tài khoản & công cụ

*(Việc tay, AI không làm thay được — nhưng có thể hỏi AI hướng dẫn từng bước nếu bí)*

- [x] Tạo tài khoản **GitHub** (nơi lưu code) — github.com
- [x] Tạo tài khoản **Supabase** (database + backend) — supabase.com, chọn region **Southeast Asia (Singapore)** — project `langnghe-vn` (ref `vgoymfnwimgypvmpozvf`)
- [x] Tạo tài khoản **Vercel** (host website) — vercel.com, đăng nhập bằng GitHub — live tại `langnghe-web.vercel.app`
- [x] Cài **Node.js** (bản LTS mới nhất) — nodejs.org
- [x] Cài **VS Code** + extension **Claude Code** (hoặc Cursor) trên máy tính
- [ ] Mua **domain** (VD: langnghe.vn) — Nhân Hòa / Mắt Bão / GoDaddy — vẫn đang dùng `langnghe-web.vercel.app`
- [ ] (Tùy chọn, làm sau) Đăng ký merchant **VNPay** hoặc **Momo Business** — hồ sơ duyệt mất vài ngày, nên nộp sớm nếu định thu tiền thật trong vài tháng tới

**Prompt AI nếu bí ở bước nào:**
```
Tôi không phải dev chuyên nghiệp. Hướng dẫn tôi từng bước cụ thể để [tên việc, VD: "tạo project mới trên Supabase và lấy API key"], 
kèm ảnh chụp màn hình minh họa nếu có thể, viết như hướng dẫn cho người mới hoàn toàn.
```

---

## 🚀 Giai đoạn 1 — Khởi tạo project (nền tảng kỹ thuật)

### 1.1 Tạo Next.js project + kết nối GitHub
**Mục tiêu:** có khung sườn code, đẩy lên GitHub để lưu trữ và Vercel tự deploy.

**Prompt AI:**
```
Tạo mới một project Next.js (App Router, TypeScript, Tailwind CSS) tên "langnghe-web" trong thư mục hiện tại.
Setup ESLint + Prettier cơ bản. Tạo file .gitignore chuẩn cho Next.js.
Khởi tạo git repo, commit đầu tiên, và hướng dẫn tôi từng bước để đẩy lên GitHub (tôi chưa có repo trên GitHub).
```

**Kiểm tra:** chạy `npm run dev`, mở `localhost:3000` thấy trang Next.js mặc định.

---

### 1.2 Setup Supabase project + kết nối vào code
**Prompt AI:**
```
Tôi đã tạo project Supabase tên "langnghe-vn" ở region Singapore, có URL và anon key (tôi sẽ dán vào .env.local).
Hướng dẫn tôi cài @supabase/supabase-js và @supabase/ssr, tạo file lib/supabase/client.ts và lib/supabase/server.ts 
theo đúng pattern Next.js App Router mới nhất của Supabase (client component + server component + middleware refresh session).
```

**Kiểm tra:** AI tạo được file kết nối, không lỗi khi import.

---

### 1.3 Chuyển schema DB sang chuẩn Supabase (việc quan trọng nhất giai đoạn này)
**Mục tiêu:** đưa `schema_v1_mvp.sql` đã thiết kế thành schema chạy được trên Supabase — viết lại RLS theo `auth.uid()` thay vì session-var cũ, và tách bảng `users` để dùng `auth.users` của Supabase.

**Prompt AI:**
```
Đây là file schema Postgres tôi đã thiết kế sẵn cho một sàn B2B: [đính kèm schema_v1_mvp.sql].
Tôi sẽ deploy lên Supabase. Hãy:
1. Bỏ cột password_hash khỏi bảng users — dùng auth.users có sẵn của Supabase làm nguồn xác thực.
2. Tạo bảng public.users mới chỉ chứa id (FK tới auth.users), role, status — và một trigger tự động 
   tạo dòng users khi có người đăng ký mới qua Supabase Auth.
3. Viết lại toàn bộ các bảng còn lại giữ nguyên cấu trúc (buyer_profiles, supplier_profiles, rfq_requests, 
   rfq_quotes, orders, notifications...).
4. Đây là file rls_policies.sql tôi đã viết theo kiểu session-var SET LOCAL app.current_user_id — 
   viết lại toàn bộ theo convention auth.uid() của Supabase, giữ đúng logic phân quyền cũ 
   (buyer chỉ xem RFQ của mình, supplier chỉ xem quote của mình, admin xem tất cả...).
5. Xuất kết quả thành các file migration trong thư mục supabase/migrations/ theo chuẩn Supabase CLI.
Giải thích ngắn gọn từng thay đổi quan trọng để tôi hiểu vì sao sửa.
```

**Kiểm tra:** chạy `supabase db push` (hoặc paste vào SQL Editor trên Supabase dashboard) không lỗi, vào Table Editor thấy đủ bảng.

---

### 1.4 Setup Auth (Email OTP) — khớp với trang "Xác minh email" đã thiết kế

> **Cập nhật 21/9/2026:** đăng nhập hằng ngày đổi sang **email + mật khẩu**. OTP vẫn dùng để xác minh email lúc đăng ký (mật khẩu nhập ngay ở form đăng ký, gửi kèm `signUp`) và để quên mật khẩu (`/forgot-password` → OTP → `/reset-password`). Prompt bên dưới là bản gốc, không còn phản ánh đúng luồng hiện tại.
**Prompt AI:**
```
Dùng Supabase Auth với email OTP (không dùng magic link, không dùng password truyền thống — 
theo đúng flow trong file email_verification_page.html tôi đính kèm: nhập email → nhận mã 6 số → xác nhận).
Viết API route hoặc server action cho: đăng ký (gửi OTP), xác nhận OTP, đăng nhập lại.
Tích hợp với bảng public.users/buyer_profiles/supplier_profiles đã tạo ở bước trước — 
sau khi verify OTP thành công lần đầu, tạo luôn profile tương ứng theo role được chọn lúc đăng ký.
```

**Kiểm tra:** đăng ký thử bằng email thật, nhận được mã, nhập đúng thì vào được, nhập sai thì báo lỗi.

---

### 1.5 Dựng design system dùng chung (tách từ 36 trang HTML)
**Mục tiêu:** 36 trang HTML đang lặp lại cùng 1 bộ CSS (biến `--red`, `--forest`...) — tách thành theme Tailwind + component dùng chung để không phải copy CSS 36 lần.

**Prompt AI:**
```
Tôi có 36 file HTML prototype dùng chung một bộ màu sắc và pattern UI (đính kèm 3-4 file mẫu: 
dashboard_buyer_page.html, login_page.html, rfq_list_page.html).
Hãy:
1. Trích xuất bảng màu (--red, --orange, --green, --forest, --clay...) thành tailwind.config.ts theme.extend.colors.
2. Tạo các component dùng chung trong components/ui/: Header (app shell có sidebar), Pill (status badge theo 
   từng loại status: rfq_status, order_status...), Card, Modal/Overlay, StatCard, Sidebar nav.
3. Giữ đúng giao diện/màu sắc/spacing như bản HTML gốc, chỉ chuyển thành component React tái sử dụng được.
```

**Kiểm tra:** tạo 1 trang test render thử Header + Sidebar + vài StatCard, nhìn giống bản HTML gốc.

---

### 1.6 Deploy bản rỗng lên Vercel (test pipeline sớm)
**Prompt AI:**
```
Hướng dẫn tôi từng bước kết nối repo GitHub này với Vercel, cấu hình biến môi trường 
NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY trên Vercel dashboard, và deploy lần đầu.
```

**Kiểm tra:** có 1 URL Vercel (VD: langnghe-web.vercel.app) mở lên thấy trang chạy được — quan trọng: làm sớm để biết pipeline deploy hoạt động trước khi code nhiều.

---

## 🌐 Giai đoạn 2 — Chuyển trang Public + Auth (6 + 5 trang)

*Với mỗi trang, dùng prompt mẫu này — chỉ đổi tên file:*

**Prompt AI mẫu (dùng lại cho từng trang):**
```
Đây là file prototype tĩnh [tên_file.html]. Hãy chuyển thành page Next.js (App Router) tại route [/duong-dan-phu-hop],
dùng các component dùng chung đã tạo ở components/ui/ (Header, Sidebar, Card, Pill...) thay vì lặp lại CSS.
Giữ nguyên bố cục, nội dung, hành vi tương tác (tabs, filter, modal...) nhưng viết bằng React + TypeScript.
Dữ liệu hiện đang hardcode trong HTML — tạm thời giữ hardcode, tôi sẽ nối API ở bước sau.
```

- [x] Trang chủ (`langnghe_1688_style.html` → `/`)
- [x] Tìm kiếm kết quả (`search_results_page.html` → `/search`)
- [x] Chi tiết sản phẩm (`product_detail_page.html` → `/products/[id]`)
- [x] Danh mục ngành hàng (`category_listing_page.html` → `/categories/[slug]`)
- [x] Trang 404 (`error_404_page.html` → `not-found.tsx`)
- [x] Giới thiệu/FAQ (`about_faq_page.html` → `/about`)
- [x] Đăng ký buyer/supplier (`register_buyer_supplier.html` → `/register`)
- [x] Đăng nhập (`login_page.html` → `/login`) — nay là email + mật khẩu, xem ghi chú ở 1.4
- [x] Quên mật khẩu (`forgot_password_page.html` → `/forgot-password`)
- [x] Xác minh email (`email_verification_page.html` → `/verify-email`) — **nối Auth thật ở bước 1.4**
- [x] Gian hàng supplier (`supplier_shop_page.html` → `/shops/[id]`)

---

## 🛒 Giai đoạn 3 — Buyer flow (nối dữ liệu thật)

*Khác giai đoạn 2: các trang này cần đọc/ghi dữ liệu thật từ Supabase, không hardcode nữa.*

- [x] **3.1 Dashboard buyer** — query RFQ/đơn hàng/thông báo thật của user đang đăng nhập
  ```
  Chuyển dashboard_buyer_page.html thành page Next.js tại /dashboard, lấy dữ liệu thật từ Supabase: 
  RFQ đang hoạt động (bảng rfq_requests where buyer_id = current user), báo giá chờ phản hồi 
  (rfq_quotes join), đơn hàng đang xử lý (orders), quota RFQ và credit_balance từ buyer_profiles. 
  Dùng Server Component để fetch, không cần loading spinner phức tạp cho MVP.
  ```
- [x] **3.2 Gửi RFQ mới** — insert vào `rfq_requests`, kiểm tra quota trước khi cho gửi
  ```
  Chuyển rfq_create_page.html thành /rfq/new. Khi submit: kiểm tra buyer_profiles.quota_used_this_month 
  so với hạn mức gói hiện tại (bảng rfq_quota_configs) — nếu vượt thì chặn và gợi ý dùng credit hoặc nâng cấp gói. 
  Nếu hợp lệ: insert vào rfq_requests, tăng quota_used_this_month, và nếu dùng credit thì ghi vào rfq_credit_ledger 
  với reason='consume'. Dùng Supabase Edge Function cho logic này để đảm bảo atomic (không lệch số nếu 2 request cùng lúc).
  ```
- [x] **3.3 Danh sách RFQ** (`rfq_list_page.html` → `/rfq`) — query có filter theo status thật
- [x] **3.4 Chi tiết RFQ** (`rfq_detail_page.html` → `/rfq/[id]`) — nối nút "Chấp nhận báo giá" thật: update `rfq_quotes.status`, tạo `orders` mới, đóng các quote khác
- [x] **3.5 Danh sách đơn hàng** (`order_list_page.html` → `/orders`)
- [x] **3.6 Chi tiết đơn hàng** (`order_detail_page.html` → `/orders/[id]`) — hiển thị `order_events` thật
- [x] **3.7 Hồ sơ & xác minh** (`buyer_profile_verification_page.html` → `/settings/profile`) — nối upload file thật lên Supabase Storage
- [x] **3.8 Cài đặt thông báo** (`buyer_notification_settings_page.html` → `/settings/notifications`) — ghi vào `notification_preferences`
- [x] **3.9 Membership & credit** (`membership_credit_page.html` → `/settings/membership`) — hiển thị dữ liệu thật, **chưa cần** nối cổng thanh toán (để Giai đoạn 9)

---

## 🏭 Giai đoạn 4 — Supplier flow

*Cùng cách làm như Giai đoạn 3, áp cho các trang supplier:*

- [x] Dashboard supplier (`dashboard_supplier_page.html` → `/supplier/dashboard`)
- [x] Quản lý sản phẩm (`supplier_product_list_page.html` → `/supplier/products`)
- [x] Thêm/sửa sản phẩm (`supplier_product_form_page.html` → `/supplier/products/new`, `/supplier/products/[id]/edit`) — nối upload ảnh lên Storage, insert `products` + `price_tiers` + `product_variants`
- [x] RFQ nhận được (`supplier_rfq_inbox_page.html` → `/supplier/rfq`) — insert `rfq_quotes` khi trả lời báo giá
- [x] Quản lý đơn hàng (`supplier_order_list_page.html` → `/supplier/orders`) — update `order_status`, ghi `order_events`
- [x] Hồ sơ & xác minh xưởng (`supplier_profile_verification_page.html` → `/supplier/settings/profile`)
- [x] Analytics xưởng (`supplier_analytics_page.html` → `/supplier/analytics`) — query từ `search_logs`/`rfq_metrics` (Giai đoạn 8 đã chạy)
- [x] Cài đặt gian hàng (`supplier_shop_settings_page.html` → `/supplier/settings/shop`)

---

## 💬 Giai đoạn 5 — Nhắn tin & Thông báo (Realtime)

- [x] **5.1 Inbox nhắn tin** (`messages_inbox_page.html` → `/messages`) — query hội thoại group theo `rfq_id`
- [x] **5.2 Chat chi tiết** (`chat_detail_page.html` → `/messages/[rfqId]`)
  ```
  Nối Supabase Realtime vào trang chat: subscribe vào bảng rfq_messages where rfq_id = [id hiện tại], 
  khi có tin nhắn mới thì tự động thêm vào UI không cần reload. Khi gửi tin nhắn: insert vào rfq_messages 
  với sender_role tương ứng.
  ```
- [x] **5.3 Trang thông báo** (`notification_center_page.html` → `/notifications`) — subscribe Realtime vào bảng `notifications`, cập nhật badge số chưa đọc live

---

## 🛡️ Giai đoạn 6 — Admin Panel

- [x] Admin dashboard (`admin_dashboard_page.html` → `/admin`) — **chặn route**: chỉ `role = 'admin'` truy cập được (check ở middleware)
- [x] Duyệt xác minh (`admin_verification_review_page.html` → `/admin/verifications`) — update `verifications.status`, gửi notification cho user
- [x] Quản lý đơn hàng admin (`admin_order_management_page.html` → `/admin/orders`) — xác nhận thanh toán thủ công + xử lý `disputes`
- [x] Quản lý user (`admin_user_management_page.html` → `/admin/users`) — suspend/unsuspend cập nhật `users.status`

---

## 🗄️ Giai đoạn 7 — Chạy tiếp Sprint 2 (DB)

*Đây là lúc chạy `migration_sprint2.sql` (đã điều chỉnh theo Supabase như bước 1.3) — mở khóa: membership thật, quota enforcement chặt hơn, trust/risk score.*

```
Đây là file migration_sprint2.sql tôi đã thiết kế sẵn (membership_plans, user_memberships, 
rfq_credit_ledger, score_logs...). Chuyển thành migration Supabase như đã làm ở bước 1.3, 
đảm bảo guard-check đầu file (kiểm tra sprint 1 đã chạy) vẫn đúng logic. Sau khi chạy xong, 
nối trang Membership & credit (đã build UI ở 3.9) với dữ liệu thật từ các bảng này.
```

---

## 📊 Giai đoạn 8 — Sprint 3 (Analytics thật)

```
Chuyển migration_sprint3.sql (search_logs, rfq_metrics) sang Supabase. Thêm code ghi log:
mỗi lần buyer tìm kiếm → insert search_logs; mỗi lần RFQ có quote mới/awarded → update rfq_metrics.
Sau đó nối trang Analytics xưởng (supplier_analytics_page.html) đọc dữ liệu thật thay vì số liệu giả.
```

---

## 💳 Giai đoạn 9 — Thanh toán thật + Sprint 4 (Escrow)

⚠️ **Lưu ý quan trọng:** Escrow (giữ tiền trung gian) **cần giấy phép trung gian thanh toán** theo pháp luật VN — đây là việc pháp lý, không phải kỹ thuật. Cách làm thực tế cho giai đoạn đầu:

- [x] **9.1 (Ngắn hạn, không cần giấy phép)** Giữ nguyên luồng "chuyển khoản + admin xác nhận tay" đã có ở `admin_order_management_page.html` — đây là cách nhiều sàn B2B VN giai đoạn đầu vẫn dùng.
- [ ] **9.2** Tích hợp cổng thanh toán để buyer thanh toán **gói membership** (không phải tiền hàng — ít rủi ro pháp lý hơn):
  ```
  Tích hợp VNPay (hoặc Momo Business) cho luồng nâng cấp gói membership tại /settings/membership. 
  Tạo API route xử lý callback thanh toán, khi thành công thì insert vào user_memberships và kích hoạt gói.
  ```
- [ ] **9.3 (Dài hạn — cần tư vấn pháp lý trước)** Chạy `migration_sprint4.sql` (escrow_transactions, disputes, order_events, reviews) chỉ sau khi đã làm việc với đối tác trung gian thanh toán được cấp phép hoặc ngân hàng có dịch vụ escrow.

---

## ✅ Giai đoạn 10 — Trước khi ra mắt (Testing & Bảo mật)

- [x] Đổi hết password/secret mẫu — không còn `CHANGE_ME_*` nào trong code/DB (2026-09-23)
  - `db_permissions.sql`: 4 password đã generate bằng `openssl rand`; còn phải chạy
    `ALTER USER` trên DB thật rồi chuyển password vào secrets manager, xoá literal khỏi file.
  - `supabase/config.toml`: `site_url`/`additional_redirect_urls` đã trỏ về
    `https://langnghe-web.vercel.app` (2026-09-23). SMTP vẫn dùng mặc định của
    Supabase (giới hạn 2 email/giờ) — cân nhắc SMTP riêng nếu volume tăng.
  - ⚠️ Sửa `config.toml` chỉ ảnh hưởng Supabase CLI local — project Supabase thật
    (langnghe-vn) phải cập nhật Auth URL Configuration thủ công trên Dashboard,
    KHÔNG chạy `supabase config push` (từng ghi đè Auth production ngoài ý muốn).
- [ ] Test toàn bộ luồng chính bằng tay: đăng ký → xác minh → gửi RFQ → nhận báo giá → chốt đơn → admin xác nhận thanh toán → cập nhật vận chuyển → hoàn tất
- [ ] Kiểm tra RLS: đăng nhập bằng 2 tài khoản buyer khác nhau, đảm bảo không ai xem được RFQ/đơn hàng của người kia
- [ ] Test trên điện thoại thật (không chỉ resize trình duyệt)
- [ ] Setup domain thật trỏ vào Vercel + bật SSL (Vercel tự làm)
- [ ] Bật Supabase Point-in-time Recovery hoặc lịch backup thủ công hàng ngày

---

## 🔧 Giai đoạn 11 — Sau khi ra mắt (vận hành)

- [ ] Setup theo dõi lỗi: **Sentry** (free tier đủ dùng) — báo lỗi realtime khi user gặp bug
  ```
  Tích hợp Sentry vào project Next.js này để theo dõi lỗi production, gửi thông báo về Slack/email khi có lỗi mới.
  ```
- [ ] Setup uptime monitor đơn giản (UptimeRobot free) — báo khi site sập
- [ ] Định kỳ hàng tuần: xem Supabase dashboard → Logs, kiểm tra query chậm
- [ ] Có kênh hỗ trợ user thật (email/Zalo OA) — vì các nút "Liên hệ hỗ trợ" trong UI hiện đang giả lập

---

## 📌 Tóm tắt độ ưu tiên nếu chỉ có thời gian giới hạn

Nếu cần MVP nhanh nhất để test thị trường, làm theo thứ tự: **Giai đoạn 0 → 1 → 2 (chỉ Đăng ký/Đăng nhập/Trang chủ/Chi tiết SP) → 3.1–3.4 (Dashboard, Gửi RFQ, Danh sách/Chi tiết RFQ) → 4 (toàn bộ supplier) → 6.2 (Duyệt xác minh) → 10.** Các phần Analytics, Membership thanh toán thật, Escrow có thể để sau khi có người dùng thật đầu tiên.
