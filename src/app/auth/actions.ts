'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

type Role = 'buyer' | 'supplier';

function isRole(v: FormDataEntryValue | null): v is Role {
  return v === 'buyer' || v === 'supplier';
}

// `r`: nonce ngẫu nhiên gắn vào mọi redirect tới /verify-email. Sinh trong
// Server Action (không phải lúc render) nên hợp lệ với rule "component
// phải pure" của React — client dùng nó để biết đây là một lượt điều
// hướng MỚI (kể cả khi 2 lần nhập sai liên tiếp cho cùng message lỗi) và
// tự xoá 6 ô OTP, xem VerifyEmailForm.tsx.
function verifyUrl(email: string, mode: 'register' | 'login', extra?: Record<string, string>) {
  const params = new URLSearchParams({ email, mode, r: crypto.randomUUID().slice(0, 8), ...extra });
  return `/verify-email?${params.toString()}`;
}

// ── 1. Đăng ký: gửi OTP cho email mới, gắn kèm role đã chọn ─────────────
// role được lưu vào auth.users.raw_user_meta_data qua options.data — trigger
// public.handle_new_user() (xem supabase/migrations) tự đọc field này khi
// tạo dòng public.users, nên không cần truyền lại role ở bước verify.
export async function sendRegisterOtp(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const role = formData.get('role');

  if (!email || !isRole(role)) {
    redirect(
      `/register?type=error&message=${encodeURIComponent('Vui lòng nhập email và chọn loại tài khoản.')}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: { role },
    },
  });

  if (error) {
    redirect(`/register?type=error&message=${encodeURIComponent(error.message)}`);
  }

  redirect(verifyUrl(email, 'register'));
}

// ── 2. Đăng nhập lại: gửi OTP, KHÔNG tạo user mới ───────────────────────
// shouldCreateUser: false — nếu email chưa từng đăng ký, Supabase trả lỗi
// thay vì âm thầm tạo tài khoản mới qua form đăng nhập.
export async function sendLoginOtp(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();

  if (!email) {
    redirect(`/login?type=error&message=${encodeURIComponent('Vui lòng nhập email.')}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    redirect(`/login?type=error&message=${encodeURIComponent(error.message)}`);
  }

  redirect(verifyUrl(email, 'login'));
}

// ── 3. Gửi lại mã — dùng chung cho cả 2 mode ─────────────────────────────
// Không dùng supabase.auth.resend() vì API đó chỉ hỗ trợ type 'signup' |
// 'email_change' (dành cho signUp() truyền thống). Mã gửi qua
// signInWithOtp() phải resend cũng bằng chính signInWithOtp().
export async function resendOtp(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const mode = formData.get('mode') === 'login' ? 'login' : 'register';

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: mode === 'register' },
  });

  if (error) {
    redirect(verifyUrl(email, mode, { type: 'error', message: error.message }));
  }

  redirect(verifyUrl(email, mode, { resent: '1' }));
}

// ── 4. Xác nhận OTP + tạo profile nếu đây là lần verify đầu tiên ────────
export async function confirmOtp(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const token = String(formData.get('token') ?? '').trim();
  const mode = formData.get('mode') === 'login' ? 'login' : 'register';

  if (!email || token.length !== 6) {
    redirect(
      verifyUrl(email, mode, {
        type: 'error',
        message: 'Mã xác minh phải gồm 6 chữ số.',
      }),
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });

  if (error || !data.user) {
    redirect(
      verifyUrl(email, mode, {
        type: 'error',
        message: error?.message ?? 'Mã xác minh không đúng. Vui lòng thử lại.',
      }),
    );
  }

  const user = data.user!;

  // public.users.status mặc định 'pending' (set bởi trigger handle_new_user).
  // Lần verify OTP đầu tiên: tạo đúng 1 profile theo role đã chọn lúc đăng
  // ký, rồi chuyển status → 'active'. Các lần đăng nhập lại sau đó,
  // status đã là 'active' nên khối này tự động bị bỏ qua.
  const { data: profile } = await supabase
    .from('users')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (profile && profile.status === 'pending') {
    // Tên hiển thị mặc định lấy từ phần trước @ của email — người dùng
    // chỉnh lại sau ở bước hoàn thiện hồ sơ (chưa tồn tại field nào bắt
    // buộc phải điền trước khi email được xác minh).
    const displayName = email.split('@')[0];

    if (profile.role === 'supplier') {
      await supabase.from('supplier_profiles').insert({ user_id: user.id, shop_name: displayName });
    } else {
      await supabase.from('buyer_profiles').insert({ user_id: user.id, company_name: displayName });
    }

    await supabase.from('users').update({ status: 'active' }).eq('id', user.id);
  }

  // Quay lại chính trang này với verified=1 để hiện màn "🎉 Thành công"
  // (đúng flow email_verification_page.html) thay vì nhảy thẳng đi —
  // người dùng tự bấm "Vào Dashboard" ở màn thành công để điều hướng tiếp.
  redirect(verifyUrl(email, mode, { verified: '1' }));
}
