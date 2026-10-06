import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase auth session on every request and keeps the
 * refreshed cookies in sync between the request and the response.
 * Called from src/proxy.ts (Next.js 16's renamed middleware.ts).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write the refreshed cookies onto the incoming request so any
          // Server Components rendered further down the chain see them...
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // ...then rebuild the response and copy them onto it so the
          // browser receives the updated Set-Cookie headers.
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run any code between createServerClient and getClaims().
  // A simple mistake here can make it very hard to debug issues with
  // users being randomly logged out.
  //
  // getClaims() verifies the JWT locally (via the project's cached JWKS)
  // and triggers a token refresh if the current one is close to expiring.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // Per PROJECT_ROADMAP.md, Giai đoạn 2 (marketplace + auth) is public and
  // Giai đoạn 3+ (buyer/supplier/admin flows) lives under these prefixes —
  // gate those instead of allow-listing every public route (an allow-list
  // would otherwise also swallow 404s: any unmatched/typo'd URL doesn't
  // match a known public prefix either, so it'd redirect to /login instead
  // of rendering not-found.tsx).
  const PRIVATE_PREFIXES = [
    '/dashboard',
    '/rfq',
    '/orders',
    '/settings',
    '/supplier',
    '/messages',
    '/notifications',
    '/admin',
  ];

  // Exact-or-`/`-boundary match — plain startsWith would also match e.g. a
  // future public `/suppliers` (directory) or `/supplier-faq` page against
  // the `/supplier` prefix and wrongly gate them behind login too.
  const pathname = request.nextUrl.pathname;
  const isPrivatePath = PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isPrivatePath) {
    if (!user) {
      // No session at all: straight to login, remembering where they were
      // headed so auth/actions.ts can send them back afterwards.
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = new URLSearchParams({ next: pathname + request.nextUrl.search }).toString();
      return NextResponse.redirect(url);
    }

    // Has a session, but may still be mid-onboarding: confirmOtp() creates
    // the auth session before completeProfile() flips public.users.status
    // to 'active' (see src/app/auth/actions.ts), so a user who verified
    // OTP and then abandoned the "Hoàn thiện hồ sơ" step already holds a
    // valid session here. Without this check they could reach any private
    // route with only a placeholder profile.
    const { data: profile } = await supabase
      .from('users')
      .select('status, role')
      .eq('id', user.sub)
      .single();

    const redirectTo = (path: string, search = '') => {
      const url = request.nextUrl.clone();
      url.pathname = path;
      url.search = search;
      return NextResponse.redirect(url);
    };

    // Chưa hoàn thiện hồ sơ: đưa thẳng tới bước "Hoàn thiện hồ sơ" (cùng URL
    // confirmOtp() dùng), kèm `next` để xong thì quay lại trang đang định vào.
    if (profile?.status === 'pending' && typeof user.email === 'string' && user.email) {
      return redirectTo(
        '/verify-email',
        new URLSearchParams({
          email: user.email,
          mode: 'register',
          step: 'profile',
          role: profile.role,
          next: pathname + request.nextUrl.search,
        }).toString(),
      );
    }

    // Bị khoá (hoặc không có dòng users): về trang chủ.
    if (profile?.status !== 'active') {
      return redirectTo('/');
    }

    // Phân quyền theo khu (kế hoạch 4.3). Mỗi vai trò có một "nhà"; vào nhầm
    // khu của vai trò khác thì được đưa về nhà mình thay vì thấy trang trống
    // hoặc bị đẩy ra trang chủ. /messages và /notifications dùng chung.
    //   buyer     /dashboard, /rfq, /orders, /settings
    //   supplier  /supplier/*
    //   admin     /admin/* (role admin không bao giờ tự gán — handle_new_user())
    //   both      khu buyer + khu supplier
    const inArea = (prefixes: string[]) =>
      prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    const area = inArea(['/admin'])
      ? 'admin'
      : inArea(['/supplier'])
        ? 'supplier'
        : inArea(['/dashboard', '/rfq', '/orders', '/settings'])
          ? 'buyer'
          : 'shared';
    const role = profile.role as string;
    const home = role === 'admin' ? '/admin' : role === 'supplier' ? '/supplier/dashboard' : '/dashboard';
    const allowed =
      area === 'shared' ||
      area === role ||
      (role === 'both' && (area === 'buyer' || area === 'supplier'));
    if (!allowed) {
      return redirectTo(home);
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object, make sure to:
  // 1. Pass the request in it: `NextResponse.next({ request })`
  // 2. Copy over the cookies: `newResponse.cookies.setAll(supabaseResponse.cookies.getAll())`
  // 3. Return the new response
  // Failing to do this may cause the browser and server to become out of
  // sync, ending the user's session prematurely.
  return supabaseResponse;
}
