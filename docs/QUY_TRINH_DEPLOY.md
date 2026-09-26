# Quy trình thay đổi và deploy

Áp dụng cho mọi việc trong kế hoạch làm lại khu quản trị (bước 0.7).

## Môi trường

| Môi trường | Supabase                            | Vercel                          | Dùng cho                                          |
| ---------- | ----------------------------------- | ------------------------------- | ------------------------------------------------- |
| Local      | `npx supabase start` (cần Docker) hoặc bỏ qua | `npm run dev`                   | Viết code                                         |
| Staging    | Project thứ hai                     | Preview deployment của nhánh PR | Chạy migration, test phân quyền, test luồng chính |
| Production | `langnghe-vn`                       | Nhánh `main`                    | Chỉ nhận thay đổi đã qua staging                  |

Supabase CLI cài trong dự án (`npm i -D supabase`); luôn gọi qua `npx supabase` để mọi máy dùng cùng phiên bản.

## Migration

- **Tên đặt tay**, tiếp nối từ `20261005090000_`. Không dùng `npx supabase migration new`: nó sinh tên theo ngày hôm nay, đứng trước các migration đã chạy.
  `npm run check:migrations` (chạy trong CI) chặn tên sai dạng, trùng timestamp, file mới có tên nhỏ hơn file lớn nhất trên `main`, và file đã có trên `main` bị sửa tên/xoá.
- **Nội dung:** khối kiểm tra đầu file theo mẫu hiện có; thêm giá trị enum luôn là file riêng (`ALTER TYPE … ADD VALUE` không dùng được trong cùng transaction); bucket, quy tắc storage, Realtime publication đều tạo bằng migration, không tạo tay trên Dashboard.
- **Quay lui:** migration rủi ro (1.3, 1.4, 3.2, 5.2, 5.9) kèm script trong `supabase/rollback/` cùng tên file, đã chạy thử trên staging. Xem `supabase/rollback/README.md`.

## Mở rộng trước, thu hẹp sau

1. Migration chỉ **thêm**: tham số có mặc định, cột cho phép trống, hàm mới bên cạnh hàm cũ.
2. Deploy Edge Function.
3. Deploy Next.js.
4. Ở **đợt sau**, khi không còn code nào dùng cái cũ, mới có migration xoá.

Nhờ vậy Vercel Instant Rollback luôn an toàn: code cũ vẫn chạy được trên database mới.

## Test trên staging

- 5 tài khoản test (buyer A, buyer B, xưởng A, xưởng B, admin) tạo bằng `npm run seed:staging`, không qua email. Không tạo tài khoản test trên production; script tự dừng nếu URL hoặc key là của production.
  - Tạo file `.env.staging.local` (không commit) với `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (của staging) và `SEED_TEST_PASSWORD` (≥ 12 ký tự, dùng chung cho 5 tài khoản).
  - Email: `buyer.a@langnghe.test`, `buyer.b@…`, `xuong.a@…`, `xuong.b@…`, `admin@…`. Buyer A và xưởng A đã xác minh; buyer B và xưởng B chưa.
  - Dữ liệu mẫu: 5 sản phẩm có bảng giá (1 bản nháp), 1 RFQ từ buyer A gửi xưởng A. Chạy lại được nhiều lần, không tạo trùng.
- Mỗi bản vá bảo mật có file SQL test giả lập từng vai trò (`set local role authenticated` + `request.jwt.claims`) trong `supabase/tests/`.
- Kiểm tra giao diện ở 375px và 1280px.

## Sao lưu

Chạy `scripts/backup-db.sh` trước mỗi lần push migration lên production. File dump lưu ngoài repo, không commit.

## Deploy production

1. PR → CI đạt (`check:migrations`, `lint`, `typecheck`, `build`) → Preview deployment chạy với staging.
2. Sao lưu production.
3. Merge vào `main`.
4. `npx supabase db push` lên production theo thứ tự ở mục "Mở rộng trước, thu hẹp sau".
5. **Tuyệt đối không dùng `npx supabase config push`**: nó ghi đè cấu hình Auth của production bằng `supabase/config.toml`.
6. Với migration phân quyền, theo dõi Sentry và log Postgres trong 48 giờ. Lọc log theo `permission denied` và `FORBIDDEN_`.

## Cờ bật/tắt tính năng

Tính năng làm dở (giỏ hàng, nhắn tin, tranh chấp) giấu sau cờ trong `src/lib/features.ts`, đọc từ biến môi trường `NEXT_PUBLIC_FEATURE_<TÊN>=1`.

- Bật trên staging trước: đặt biến ở scope **Preview** trên Vercel.
- Bật trên production sau: đặt biến ở scope **Production** rồi redeploy (biến `NEXT_PUBLIC_*` được gắn lúc build).
- Khi tính năng ổn định, xoá cờ và nhánh code cũ.

## Commit

Commit ghi số việc trong kế hoạch, ví dụ `1.1 khóa cột hệ thống buyer_profiles`, rồi tích ô trong tài liệu kế hoạch.
