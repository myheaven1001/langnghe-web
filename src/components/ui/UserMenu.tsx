'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Link vào khu làm việc theo vai trò. Trước đây chỉ hiện phần trước @ của
// email nên người dùng không đoán được đó là đường vào dashboard.
function areaLinksFor(role: string | null): { href: string; label: string }[] {
  if (role === 'admin') return [{ href: '/admin', label: 'Vào trang quản lý' }];
  if (role === 'supplier') return [{ href: '/supplier/dashboard', label: 'Khu bán hàng' }];
  if (role === 'both')
    return [
      { href: '/dashboard', label: 'Khu mua hàng' },
      { href: '/supplier/dashboard', label: 'Khu bán hàng' },
    ];
  return [{ href: '/dashboard', label: 'Khu mua hàng' }];
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
  ctaClassName,
}: {
  /** 'muted' matches SiteHeader's semi-transparent border buttons; 'solid'
   * matches PublicHeader's white/red pair used on the other public pages. */
  variant?: 'muted' | 'solid';
  /** Có thì hiện thêm nút "Mua sỉ ngay" theo vai trò: khách → /register,
   * buyer → /rfq/new, xưởng/admin → ẩn (đã có link vào khu của mình). */
  ctaClassName?: string;
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
        {ctaClassName && (
          <Link href="/register" className={ctaClassName}>
            Mua sỉ ngay
          </Link>
        )}
      </>
    );
  }

  const canBuy = state.role === 'buyer' || state.role === 'both' || state.role === null;

  return (
    <>
      {areaLinksFor(state.role).map((a) => (
        <Link key={a.href} href={a.href} title={state.email} className={linkClass}>
          {a.label}
        </Link>
      ))}
      <button type="button" onClick={signOut} className={linkClass}>
        Đăng xuất
      </button>
      {ctaClassName && canBuy && (
        <Link href="/rfq/new" className={ctaClassName}>
          Mua sỉ ngay
        </Link>
      )}
    </>
  );
}
