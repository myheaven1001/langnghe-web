import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase client for use in Server Components, Server Actions, and
 * Route Handlers.
 *
 * `cookies()` is async (Next.js 15+), so this function must be awaited:
 *   const supabase = await createClient();
 *
 * Server Components cannot write cookies (Next.js throws), so `setAll`
 * is wrapped in try/catch. This is safe as long as the proxy (src/proxy.ts)
 * is running and refreshing the session on every request — the middleware
 * pattern handles writing the refreshed cookies back to the browser.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have proxy refreshing
            // user sessions.
          }
        },
      },
    },
  );
}
