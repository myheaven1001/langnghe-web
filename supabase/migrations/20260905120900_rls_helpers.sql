-- ============================================================
-- Sàn B2B Bán Buôn Làng Nghề — Migration sang Supabase (10/11)
-- RLS helper — thay 3 hàm session-var gốc (rls_policies.sql) bằng 1 hàm
--
-- THAY ĐỔI MÔ HÌNH QUAN TRỌNG:
--   Bản gốc: app tự SET LOCAL app.current_user_id / app.current_user_role
--   mỗi request, và "admin" là một Postgres role riêng có BYPASSRLS.
--
--   Supabase: KHÔNG có khái niệm 1 Postgres role riêng cho mỗi user hay
--   mỗi app-role. Mọi user đăng nhập đều query qua CÙNG MỘT role Postgres
--   (`authenticated`), phân biệt nhau hoàn toàn qua auth.uid() (lấy từ
--   JWT) trong policy — tương đương current_app_user_id() cũ, nhưng có
--   sẵn, không cần tự định nghĩa.
--
--   current_app_user_role() cũ dùng cho 2 việc, nay tách thành 2 hướng xử lý:
--     - Kiểm tra "có phải admin?" → is_admin() bên dưới, tra public.users.role.
--     - Đánh dấu "system" event  → không cần nữa: job nền/webhook dùng
--       service_role key, key này bypass RLS hoàn toàn ở tầng Supabase,
--       không cần policy nào cho phép riêng.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    );
$$;

COMMENT ON FUNCTION public.is_admin() IS
    'Thay is_admin() session-var cũ. SECURITY DEFINER để tránh mọi rủi ro '
    'đệ quy RLS khi hàm này được gọi bên trong policy của chính public.users.';
