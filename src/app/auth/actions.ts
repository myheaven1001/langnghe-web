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

const MIN_PASSWORD_LENGTH = 8;
// GoTrue băm mật khẩu bằng bcrypt, chỉ đọc 72 byte đầu — từ chối dài hơn thay vì
// âm thầm cắt bớt.
const MAX_PASSWORD_LENGTH = 72;

// Trả về message lỗi, hoặc null nếu mật khẩu hợp lệ.
function validatePassword(password: string, confirm: string | null): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) {
    return `Mật khẩu quá dài (tối đa ${MAX_PASSWORD_LENGTH} byte).`;
  }
  if (confirm !== null && password !== confirm) {
    return 'Mật khẩu nhập lại không khớp.';
  }
  return null;
}

// Trang chủ theo role sau khi đăng nhập.
function homePathFor(role: string): string {
  if (role === 'admin') return '/admin';
  if (role === 'supplier') return '/supplier/dashboard';
  return '/dashboard';
}

const INVALID_EMAIL_MESSAGE =
  'Email không đúng định dạng. Nếu bạn vừa gõ tiếng Việt, hãy tắt bộ gõ (Unikey/Telex) rồi nhập lại email.';

const SAME_PASSWORD_RE = /different from the old password/i;
const SAME_PASSWORD_MESSAGE = 'Mật khẩu mới phải khác mật khẩu hiện tại.';

// Supabase/GoTrue trả error.message bằng tiếng Anh — dịch các trường hợp
// hay gặp sang tiếng Việt cho người dùng cuối. Message lạ (không khớp rule
// nào) thì giữ nguyên bản gốc thay vì đoán sai — còn hơn là dịch nhầm.
function translateAuthError(message: string): string {
  const rules: [RegExp, string][] = [
    [/signups not allowed for otp/i, 'Email này chưa có tài khoản. Vui lòng đăng ký trước.'],
    [/invalid login credentials/i, 'Email hoặc mật khẩu không đúng.'],
    [
      /email not confirmed/i,
      'Email chưa được xác minh. Hãy chọn "Quên mật khẩu" để nhận mã xác minh.',
    ],
    [
      /(request rate limit|too many requests)/i,
      'Bạn thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.',
    ],
    [SAME_PASSWORD_RE, SAME_PASSWORD_MESSAGE],
    [
      /weak password|password (is )?(too )?weak|should be at least|should contain/i,
      'Mật khẩu quá yếu. Hãy dùng mật khẩu dài và khó đoán hơn.',
    ],
    [/user already registered/i, 'Email này đã có tài khoản. Vui lòng đăng nhập.'],
    [/email rate limit exceeded/i, 'Bạn yêu cầu mã quá nhiều lần. Vui lòng thử lại sau vài phút.'],
    [/for security purposes.*after/i, 'Vui lòng đợi một chút trước khi yêu cầu mã mới.'],
    [/(email address|to be a valid)/i, INVALID_EMAIL_MESSAGE],
    [
      /token has expired or is invalid/i,
      'Mã xác minh không đúng hoặc đã hết hạn. Vui lòng thử lại.',
    ],
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
  // `{ user: null }`: nhánh lỗi của signInWithPassword()/updateUser() trả
  // data.user = null thay vì data = null — vẫn hợp lệ, dữ liệu đó bị bỏ đi ở
  // dưới vì error luôn được kiểm tra trước.
  fn: () => PromiseLike<{ data: T | { user: null } | null; error: { message: string } | null }>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await fn();
    return error
      ? { data: null, error: translateAuthError(error.message) }
      : { data: data as T | null, error: null };
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
type OtpMode = 'register' | 'reset';

function verifyUrl(email: string, mode: OtpMode, extra?: Record<string, string>) {
  const params = new URLSearchParams({ email, mode, r: crypto.randomUUID().slice(0, 8), ...extra });
  return `/verify-email?${params.toString()}`;
}

// ── 1. Đăng ký: email + mật khẩu + role → Supabase gửi mã xác nhận 6 số ──
// role được lưu vào auth.users.raw_user_meta_data qua options.data — trigger
// public.handle_new_user() (xem supabase/migrations) tự đọc field này khi
// tạo dòng public.users, nên không cần truyền lại role ở bước verify.
//
// Cần "Confirm email" BẬT trong Supabase Auth và mẫu email "Confirm signup"
// chứa {{ .Token }}: signUp() khi đó tạo user chưa xác nhận + gửi mã, chưa có
// session cho tới khi confirmOtp() (verifyOtp type 'signup') thành công.
export async function registerAccount(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const role = formData.get('role');
  const password = String(formData.get('password') ?? '');

  // Giữ lại email + role khi báo lỗi để người dùng khỏi nhập lại (KHÔNG giữ
  // mật khẩu — không bao giờ đưa mật khẩu lên URL).
  const back = (message: string) =>
    redirect(
      `/register?${new URLSearchParams({ type: 'error', message, email, role: isRole(role) ? role : '' })}`,
    );

  if (!email || !isRole(role)) back('Vui lòng nhập email và chọn loại tài khoản.');
  if (!isValidEmail(email)) back(INVALID_EMAIL_MESSAGE);

  const passwordError = validatePassword(password, String(formData.get('confirmPassword') ?? ''));
  if (passwordError) back(passwordError);

  const supabase = await createClient();

  // Lượt đăng ký trước của email này bị bỏ dở (không nhận được mã, hoặc xong
  // OTP nhưng chưa hoàn thiện hồ sơ) → xoá đi để đăng ký lại từ đầu, thay vì
  // kẹt ở "email đã có tài khoản". Chỉ xoá tài khoản 'pending' chưa có dữ liệu
  // (xem migration 20261003090000). Lỗi ở đây (ví dụ migration chưa chạy) không
  // được chặn đăng ký → bỏ qua.
  await supabase.rpc('reclaim_incomplete_signup', { p_email: email });

  const { data, error } = await tryAuth(() =>
    supabase.auth.signUp({ email, password, options: { data: { role } } }),
  );
  if (error) back(error);

  // Email đã có tài khoản đã xác nhận: Supabase (chống dò email) không báo
  // lỗi mà trả về user "giả" với identities rỗng và KHÔNG gửi mã.
  if (data?.user && data.user.identities?.length === 0) {
    back('Email này đã có tài khoản. Vui lòng đăng nhập (hoặc chọn "Quên mật khẩu").');
  }

  redirect(verifyUrl(email, 'register'));
}

// ── 2. Đăng nhập bằng email + mật khẩu ──────────────────────────────────
// Lỗi luôn là 1 message chung ("Email hoặc mật khẩu không đúng") dù sai email
// hay sai mật khẩu — không để lộ email nào đã đăng ký. Brute-force do
// Supabase Auth tự giới hạn theo IP (auth.rate_limit).
//
// Người dùng cũ đăng ký khi hệ thống còn dùng OTP thuần chưa có mật khẩu →
// đăng nhập sẽ báo sai; họ dùng "Quên mật khẩu" (OTP) để đặt mật khẩu lần đầu.
export async function loginWithPassword(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const back = (message: string) =>
    redirect(
      `/login?type=error&message=${encodeURIComponent(message)}&email=${encodeURIComponent(email)}`,
    );

  if (!email || !password) back('Vui lòng nhập email và mật khẩu.');
  if (!isValidEmail(email)) back(INVALID_EMAIL_MESSAGE);

  const supabase = await createClient();
  const { data, error } = await tryAuth(() =>
    supabase.auth.signInWithPassword({ email, password }),
  );
  if (error || !data?.user) back(error ?? 'Không thể đăng nhập. Vui lòng thử lại.');

  const user = data!.user!;
  const { data: profile, error: profileError } = await tryAuth<{ role: string; status: string }>(
    () => supabase.from('users').select('role, status').eq('id', user.id).single(),
  );
  if (profileError || !profile) {
    await supabase.auth.signOut();
    back('Không thể tải thông tin tài khoản. Vui lòng thử lại.');
  }

  if (profile!.status === 'suspended') {
    await supabase.auth.signOut();
    back('Tài khoản của bạn đã bị tạm khóa. Vui lòng liên hệ hỗ trợ.');
  }

  // Đã xác minh OTP nhưng bỏ dở bước "Hoàn thiện hồ sơ" → đưa quay lại đúng
  // bước đó (proxy sẽ chặn mọi route private cho tới khi status = 'active').
  if (
    profile!.status === 'pending' &&
    (profile!.role === 'buyer' || profile!.role === 'supplier')
  ) {
    redirect(verifyUrl(email, 'register', { step: 'profile', role: profile!.role }));
  }

  redirect(homePathFor(profile!.role));
}

// ── 2b. Quên mật khẩu: gửi OTP, KHÔNG tạo user mới ──────────────────────
// shouldCreateUser: false — email chưa đăng ký thì báo lỗi thay vì âm thầm
// tạo tài khoản. Sau khi nhập đúng OTP, confirmOtp() chuyển tới
// /reset-password để đặt mật khẩu mới.
export async function sendResetOtp(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();

  if (!email) {
    redirect(`/forgot-password?type=error&message=${encodeURIComponent('Vui lòng nhập email.')}`);
  }

  if (!isValidEmail(email)) {
    redirect(`/forgot-password?type=error&message=${encodeURIComponent(INVALID_EMAIL_MESSAGE)}`);
  }

  const supabase = await createClient();
  const { error } = await tryAuth(() =>
    supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    }),
  );

  if (error) {
    redirect(`/forgot-password?type=error&message=${encodeURIComponent(error)}`);
  }

  redirect(verifyUrl(email, 'reset'));
}

// ── 3. Gửi lại mã — dùng chung cho cả 2 mode ─────────────────────────────
// Mã của signUp() gửi lại bằng auth.resend(); mã quên mật khẩu (gửi qua
// signInWithOtp()) phải gửi lại cũng bằng signInWithOtp().
export async function resendOtp(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const mode = formData.get('mode') === 'reset' ? 'reset' : 'register';

  if (!isValidEmail(email)) {
    redirect(verifyUrl(email, mode, { type: 'error', message: INVALID_EMAIL_MESSAGE }));
  }

  // register: mã xác nhận của signUp() → gửi lại bằng auth.resend('signup').
  // reset: mã của signInWithOtp() (user đã tồn tại).
  const supabase = await createClient();
  const { error } = await tryAuth(() =>
    mode === 'register'
      ? supabase.auth.resend({ type: 'signup', email })
      : supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }),
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
  const mode = formData.get('mode') === 'reset' ? 'reset' : 'register';

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
    supabase.auth.verifyOtp({ email, token, type: mode === 'register' ? 'signup' : 'email' }),
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

  // Quên mật khẩu (tài khoản đã 'active'): OTP đúng → đặt mật khẩu mới.
  if (mode === 'reset') {
    redirect('/reset-password');
  }

  // Đăng ký lại với email đã active: quay lại trang này với verified=1 để
  // hiện màn "🎉 Thành công" (đúng flow email_verification_page.html).
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
  const mode = formData.get('mode') === 'reset' ? 'reset' : 'register';

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

  // Mode 'register': mật khẩu đã đặt ở /register (signUp). Mode 'reset' đi qua
  // bước hồ sơ này khi tài khoản còn 'pending' (bỏ dở đăng ký, quên mật khẩu)
  // — cần đặt mật khẩu mới ở đây vì /reset-password bị bỏ qua.
  const password = String(formData.get('password') ?? '');
  const passwordError =
    mode === 'reset'
      ? validatePassword(password, String(formData.get('confirmPassword') ?? ''))
      : null;
  if (passwordError) {
    redirect(
      verifyUrl(email, mode, {
        type: 'error',
        message: passwordError,
        step: 'profile',
        role: profile!.role,
      }),
    );
  }

  const { error: passwordUpdateError } =
    mode === 'reset'
      ? await tryAuth(() => supabase.auth.updateUser({ password }))
      : { error: null };
  // Nhập lại đúng mật khẩu cũ khi thử lại sau một lần lỗi giữa chừng: không
  // phải lỗi thật.
  if (passwordUpdateError && passwordUpdateError !== SAME_PASSWORD_MESSAGE) {
    redirect(
      verifyUrl(email, mode, {
        type: 'error',
        message: passwordUpdateError,
        step: 'profile',
        role: profile!.role,
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

// ── 6. Đặt mật khẩu mới sau khi xác minh OTP quên mật khẩu ──────────────
// Chỉ có ý nghĩa khi đã có session (confirmOtp() vừa tạo). Không có session
// thì quay về bước đầu của luồng quên mật khẩu.
export async function resetPassword(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/forgot-password?type=error&message=${encodeURIComponent('Phiên xác minh đã hết hạn. Vui lòng yêu cầu mã mới.')}`,
    );
  }

  const fail = (message: string) =>
    redirect(`/reset-password?type=error&message=${encodeURIComponent(message)}`);

  const passwordError = validatePassword(password, confirm);
  if (passwordError) fail(passwordError);

  const { error } = await tryAuth(() => supabase.auth.updateUser({ password }));
  if (error) fail(error);

  const { data: profile } = await tryAuth<{ role: string }>(() =>
    supabase.from('users').select('role').eq('id', user!.id).single(),
  );
  redirect(homePathFor(profile?.role ?? 'buyer'));
}
