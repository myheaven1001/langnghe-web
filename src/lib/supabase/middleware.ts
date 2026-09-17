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

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/register') &&
    !request.nextUrl.pathname.startsWith('/verify-email') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    // No user session and not already headed to a public auth route:
    // redirect to the login page.
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
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
