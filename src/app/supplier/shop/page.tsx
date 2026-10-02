import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// "Xem gian hàng" trong menu xưởng (kế hoạch 2.7): chuyển tới trang gian
// hàng công khai của chính xưởng đang đăng nhập. Menu dùng chung cho mọi
// trang /supplier/* nên trỏ vào đây thay vì phải biết slug ở từng trang.
export default async function MyShopRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fsupplier%2Fshop');

  const { data: supplier } = await supabase
    .from('supplier_profiles')
    .select('slug')
    .eq('user_id', user.id)
    .maybeSingle();

  redirect(supplier ? `/shops/${supplier.slug}` : '/supplier/dashboard');
}
