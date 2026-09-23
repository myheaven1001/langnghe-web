'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function homePathFor(role: string | null): string {
  if (role === 'admin') return '/admin';
  if (role === 'supplier') return '/supplier/dashboard';
  return '/dashboard';
}

type State =
  | { status: 'loading' }
  | { status: 'guest' }
  | { status: 'in'; email: string; role: string | null };

// Drop-in replacement for the "Đăng nhập / Đăng ký" link pair in every
// public header (SiteHeader on "/", PublicHeader everywhere else). Those
// headers are plain markup with no idea whether a session exists — this is
// a self-contained client island so no page that renders a header needs to
// be touched to pass auth state down. Starts at 'loading' (SSR/first paint
// has no session info yet) and resolves after getUser() — a guest sees the
// same buttons as before with no flash; a logged-in user briefly sees
// nothing render in that slot instead of "Đăng nhập" flashing then
// disappearing.
export function UserMenu({
  variant = 'muted',
}: {
  /** 'muted' matches SiteHeader's semi-transparent border buttons; 'solid'
   * matches PublicHeader's white/red pair used on the other public pages. */
  variant?: 'muted' | 'solid';
}) {
  const supabase = createClient();
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        setState({ status: 'guest' });
        return;
      }
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      if (!active) return;
      setState({ status: 'in', email: user.email ?? '', role: profile?.role ?? null });
    }

    load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const linkClass =
    variant === 'muted'
      ? 'rounded border border-white/40 px-3 py-[5px] text-xs text-white'
      : 'rounded border border-white/40 px-2.5 py-[5px] text-xs text-white';

  if (state.status === 'loading') {
    // Chỗ trống cùng kích thước để không giật layout khi state.status đổi
    // ngay sau đó — không hiện "Đăng nhập" rồi biến mất nếu hoá ra đã đăng nhập.
    return <div className="h-[26px] w-[140px]" aria-hidden="true" />;
  }

  if (state.status === 'guest') {
    return (
      <>
        <Link href="/login" className={linkClass}>
          Đăng nhập
        </Link>
        <Link href="/register" className={linkClass}>
          Đăng ký
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href={homePathFor(state.role)} className={linkClass}>
        {state.email.split('@')[0]}
      </Link>
      <button type="button" onClick={signOut} className={linkClass}>
        Đăng xuất
      </button>
    </>
  );
}
