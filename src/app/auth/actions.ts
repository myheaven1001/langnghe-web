'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

type Role = 'buyer' | 'supplier';

function isRole(v: FormDataEntryValue | null): v is Role {
  return v === 'buyer' || v === 'supplier';
}

// HTML5-spec email pattern (ASCII-only local part + domain). <input
// type="email"> already runs something close to this on native form
// submission, but that check doesn't apply here: Server Actions read
// FormData directly, and a Vietnamese IME (Unikey/Telex) left on while
// typing an email can silently insert a stray Unicode character (most
// often "•" in place of "."). Left unvalidated, that character can reach
// the Supabase request and fail with a low-level, English runtime error
// instead of a clear message — reject it here first.
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

const INVALID_EMAIL_MESSAGE =
  'Email không đúng định dạng. Nếu bạn vừa gõ tiếng Việt, hãy tắt bộ gõ (Unikey/Telex) rồi nhập lại email.';

// Supabase/GoTrue trả error.message bằng tiếng Anh — dịch các trường hợp
// hay gặp sang tiếng Việt cho người dùng cuối. Message lạ (không khớp rule
// nào) thì giữ nguyên bản gốc thay vì đoán sai — còn hơn là dịch nhầm.
function translateAuthError(message: string): string {
  const rules: [RegExp, string][] = [
    [/signups not allowed for otp/i, 'Email này chưa có tài khoản. Vui lòng đăng ký trước.'],
    [/user already registered/i, 'Email này đã có tài khoản. Vui lòng đăng nhập.'],
    [/email rate limit exceeded/i, 'Bạn yêu cầu mã quá nhiều lần. Vui lòng thử lại sau vài phút.'],
    [/for security purposes.*after/i, 'Vui lòng đợi một chút trước khi yêu cầu mã mới.'],
    [/(email address|to be a valid)/i, INVALID_EMAIL_MESSAGE],
    [/token has expired or is invalid/i, 'Mã xác minh không đúng hoặc đã hết hạn. Vui lòng thử lại.'],
    // Không phải lỗi Supabase có cấu trúc — exception cấp thấp (network,
    // hoặc input chứa ký tự khiến chính request bị lỗi trước khi tới được
    // Supabase, như "Cannot convert argument to a ByteString..." khi email
    // dính ký tự lạ từ IME). Bắt theo nhóm thay vì từng message cụ thể vì
    // các message này đến từ engine JS/network, không phải API có hợp đồng
    // ổn định.
    [
      /ByteString|Failed to fetch|NetworkError|is not valid JSON|character at index/i,
      'Có lỗi kỹ thuật khi gửi yêu cầu. Vui lòng kiểm tra lại email (tắt bộ gõ tiếng Việt nếu có) rồi thử lại.',
    ],
  ];
  return rules.find(([re]) => re.test(message))?.[1] ?? message;
}

// Chạy 1 lời gọi Supabase và quy về cùng 1 dạng { data, error: string } —
// dùng chung cho cả lỗi có cấu trúc ({error} Supabase trả về) LẪN exception
// cấp thấp (network/runtime, ví dụ chính request bị lỗi vì input bất
// thường trước khi tới được Supabase). Không có try/catch nào trong file
// này được bọc quanh redirect() — Next.js dùng throw để điều hướng, bọc
// nhầm sẽ khiến điều hướng biến thành "lỗi" bị nuốt mất.
async function tryAuth<T>(
  fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await fn();
    return { data, error: error ? translateAuthError(error.message) : null };
  } catch (err) {
    return {
      data: null,
      error: translateAuthError(err instanceof Error ? err.message : String(err)),
    };
  }
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

  if (!isValidEmail(email)) {
    redirect(`/register?type=error&message=${encodeURIComponent(INVALID_EMAIL_MESSAGE)}`);
  }

  const supabase = await createClient();
  const { error } = await tryAuth(() =>
    supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: { role },
      },
    }),
  );

  if (error) {
    redirect(`/register?type=error&message=${encodeURIComponent(error)}`);
  }

  redirect(verifyUrl(email, 'register'));
}

// ── 2. Đăng nhập lại: gửi OTP, KHÔNG tạo user mới ───────────────────────
// shouldCreateUser: false — nếu email chưa từng đăng ký, Supabase trả lỗi
// thay vì âm thầm tạo tài khoản mới qua form đăng nhập.
//
// Dùng chung cho cả /login và /forgot-password (dưới OTP auth, "quên mật
// khẩu" chính là "xin mã đăng nhập mới") — errorPath cho biết quay lại
// trang nào nếu có lỗi, mặc định /login khi form không truyền field này.
export async function sendLoginOtp(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const errorPath = String(formData.get('errorPath') ?? '/login');

  if (!email) {
    redirect(`${errorPath}?type=error&message=${encodeURIComponent('Vui lòng nhập email.')}`);
  }

  if (!isValidEmail(email)) {
    redirect(`${errorPath}?type=error&message=${encodeURIComponent(INVALID_EMAIL_MESSAGE)}`);
  }

  const supabase = await createClient();
  const { error } = await tryAuth(() =>
    supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    }),
  );

  if (error) {
    redirect(`${errorPath}?type=error&message=${encodeURIComponent(error)}`);
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

  if (!isValidEmail(email)) {
    redirect(verifyUrl(email, mode, { type: 'error', message: INVALID_EMAIL_MESSAGE }));
  }

  const supabase = await createClient();
  const { error } = await tryAuth(() =>
    supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: mode === 'register' },
    }),
  );

  if (error) {
    redirect(verifyUrl(email, mode, { type: 'error', message: error }));
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
  const { data: verifyData, error: verifyError } = await tryAuth(() =>
    supabase.auth.verifyOtp({ email, token, type: 'email' }),
  );

  if (verifyError || !verifyData?.user) {
    redirect(
      verifyUrl(email, mode, {
        type: 'error',
        message: verifyError ?? 'Mã xác minh không đúng. Vui lòng thử lại.',
      }),
    );
  }

  const user = verifyData!.user!;

  // public.users.status mặc định 'pending' (set bởi trigger handle_new_user).
  // Lần verify OTP đầu tiên: tạo đúng 1 profile theo role đã chọn lúc đăng
  // ký, rồi chuyển status → 'active'. Các lần đăng nhập lại sau đó,
  // status đã là 'active' nên khối này tự động bị bỏ qua.
  //
  // Lỗi ở đây KHÔNG được bỏ qua: nếu không đọc được profile, coi như chưa
  // xác minh xong thay vì âm thầm rơi xuống màn "🎉 Thành công" bên dưới —
  // tránh báo tài khoản đã sẵn sàng trong khi chưa chắc đã có profile.
  const { data: profile, error: profileError } = await tryAuth<{
    role: Role;
    status: string;
  }>(() => supabase.from('users').select('role, status').eq('id', user.id).single());

  if (profileError || !profile) {
    redirect(
      verifyUrl(email, mode, {
        type: 'error',
        message: profileError ?? 'Không thể tải thông tin tài khoản. Vui lòng thử lại.',
      }),
    );
  }

  if (profile!.status === 'pending') {
    // Tên hiển thị mặc định lấy từ phần trước @ của email — chỉ để insert
    // hợp lệ (company_name/shop_name NOT NULL). Chưa set status='active'
    // ở đây: người dùng sửa lại tên thật + điền vài field hồ sơ ở bước
    // "Hoàn thiện hồ sơ" ngay sau đây (xem completeProfile() bên dưới)
    // trước khi tài khoản được coi là active.
    const displayName = email.split('@')[0];

    const { error: insertError } = await tryAuth<null>(() =>
      profile!.role === 'supplier'
        ? supabase.from('supplier_profiles').insert({ user_id: user.id, shop_name: displayName })
        : supabase.from('buyer_profiles').insert({ user_id: user.id, company_name: displayName }),
    );

    // 23505 = unique_violation: bình thường nếu user quay lại xác minh lần
    // 2 trong lúc vẫn 'pending' (dòng profile đã insert ở lần trước) — bỏ
    // qua (tryAuth() đã dịch message, nên check qua chuỗi gốc thay vì mã
    // lỗi Postgres — chấp nhận được vì đây là câu message cố định của
    // Postgres, không phải input người dùng).
    if (insertError && !/duplicate key value/i.test(insertError)) {
      redirect(
        verifyUrl(email, mode, {
          type: 'error',
          message: 'Không thể khởi tạo hồ sơ. Vui lòng thử lại hoặc liên hệ hỗ trợ.',
        }),
      );
    }

    redirect(verifyUrl(email, mode, { step: 'profile', role: profile!.role }));
  }

  // Đăng nhập lại (status đã 'active' từ lần verify đầu tiên): quay lại
  // trang này với verified=1 để hiện màn "🎉 Thành công" (đúng flow
  // email_verification_page.html) thay vì nhảy thẳng đi — người dùng tự
  // bấm "Vào Dashboard" ở màn thành công để điều hướng tiếp.
  redirect(verifyUrl(email, mode, { verified: '1' }));
}

// ── 5. Hoàn thiện hồ sơ sau khi verify OTP lần đầu (register) ───────────
// Chỉ áp dụng các field THẬT SỰ tồn tại trên buyer_profiles/supplier_profiles
// (xem supabase/migrations/20260905120100_users_and_auth.sql) — bản mockup
// register_buyer_supplier.html còn có category quan tâm, quy mô nhập hàng,
// mục đích mua, số thợ, mô tả xưởng, upload ảnh/GPKD... nhưng chưa có cột
// nào cho các trường đó nên không đưa vào đây (đó là việc của Giai đoạn
// 3.7 — hồ sơ & xác minh đầy đủ, /settings/profile).
export async function completeProfile(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const mode = formData.get('mode') === 'login' ? 'login' : 'register';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // `role` không lấy từ formData (client) — hidden field đó chỉ phản ánh
  // URL lúc render form, người dùng có thể sửa được trước khi submit. Đọc
  // lại role thật từ public.users để quyết định update đúng bảng, tránh
  // vừa "active" hoá tài khoản vừa lẳng lặng update-trúng-0-dòng vào bảng
  // profile sai.
  const { data: profile, error: profileError } = await tryAuth<{ role: Role }>(() =>
    supabase.from('users').select('role').eq('id', user!.id).single(),
  );

  if (profileError || !profile) {
    redirect(
      verifyUrl(email, mode, {
        type: 'error',
        message: profileError ?? 'Không thể tải thông tin tài khoản. Vui lòng thử lại.',
      }),
    );
  }

  const profileUpdate =
    profile!.role === 'supplier'
      ? (() => {
          const foundingYear = String(formData.get('foundingYear') ?? '').trim();
          const monthlyCapacity = String(formData.get('monthlyCapacity') ?? '').trim();

          return supabase
            .from('supplier_profiles')
            .update({
              shop_name: String(formData.get('shopName') ?? '').trim(),
              village_origin: String(formData.get('villageOrigin') ?? '').trim() || null,
              craft_category: String(formData.get('craftCategory') ?? '').trim() || null,
              founding_year: foundingYear ? Number(foundingYear) : null,
              monthly_capacity: monthlyCapacity ? Number(monthlyCapacity) : null,
            })
            .eq('user_id', user!.id);
        })()
      : supabase
          .from('buyer_profiles')
          .update({
            company_name: String(formData.get('companyName') ?? '').trim(),
            city: String(formData.get('city') ?? '').trim() || null,
            tax_code: String(formData.get('taxCode') ?? '').trim() || null,
          })
          .eq('user_id', user!.id);

  const { error: updateError } = await tryAuth<null>(() => profileUpdate);

  if (updateError) {
    redirect(
      verifyUrl(email, mode, {
        type: 'error',
        message: 'Không thể lưu hồ sơ. Vui lòng thử lại.',
        step: 'profile',
        role: profile!.role,
      }),
    );
  }

  const { error: activateError } = await tryAuth<null>(() =>
    supabase.from('users').update({ status: 'active' }).eq('id', user!.id),
  );

  if (activateError) {
    redirect(
      verifyUrl(email, mode, {
        type: 'error',
        message: 'Đã lưu hồ sơ nhưng không thể kích hoạt tài khoản. Vui lòng thử lại.',
        step: 'profile',
        role: profile!.role,
      }),
    );
  }

  redirect(verifyUrl(email, mode, { verified: '1' }));
}
