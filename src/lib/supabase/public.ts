import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client quyền khách (anon), KHÔNG đọc cookie — cho trang công khai
 * được tạo sẵn và làm mới định kỳ (export const revalidate), ví dụ trang chủ.
 * Đọc cookie (lib/supabase/server.ts) sẽ bắt trang render lại cho từng
 * người xem. Chỉ dùng để đọc dữ liệu công khai (product_cards,
 * public_supplier_profiles, categories, public_stats…).
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
