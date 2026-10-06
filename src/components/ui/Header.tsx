'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export interface HeaderIcon {
  icon: string;
  title: string;
  badge?: number;
  /** Trang mở khi bấm. Bỏ trống thì suy từ `title` (Tin nhắn, Thông báo). */
  href?: string;
  onClick?: () => void;
}

export interface HeaderProps {
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  icons?: HeaderIcon[];
  userName: string;
  userRole: string;
  userInitial?: string;
  onUserClick?: () => void;
  /** Nút ☰ (dưới lg) — AppShell truyền vào để mở ngăn kéo sidebar. */
  onMenuClick?: () => void;
}

// Các trang truyền icon chỉ có tên (💬 Tin nhắn, 🔔 Thông báo) — suy ra đích
// để icon bấm được mà không phải sửa từng trang.
const ICON_HREF: Record<string, string> = {
  'Tin nhắn': '/messages',
  'Thông báo': '/notifications',
};

const ICON_CLASS =
  'relative flex h-10 w-10 items-center justify-center rounded-full text-[18px] text-white/90 hover:bg-white/10 hover:text-white';

// Thanh đỏ dính trên cùng của khu sau đăng nhập. Mobile trước (kế hoạch
// 4.2): dưới `md` ô tìm kiếm thu thành icon 🔍, tên người dùng ẩn chỉ còn
// avatar; dưới `lg` có nút ☰ mở sidebar. Mọi vùng bấm ≥ 40px.
export function Header({
  searchPlaceholder = 'Tìm sản phẩm, xưởng, ngành hàng...',
  onSearch,
  icons = [],
  userName,
  userRole,
  userInitial,
  onUserClick,
  onMenuClick,
}: HeaderProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  // 'both' = tài khoản vừa mua vừa bán: hiện lối chuyển khu. Chỉ hỏi DB khi
  // mở menu lần đầu.
  const [accountRole, setAccountRole] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  async function toggleMenu() {
    onUserClick?.();
    const next = !menuOpen;
    setMenuOpen(next);
    if (next && accountRole === null) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
      setAccountRole((data?.role as string | undefined) ?? '');
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const menuItemClass =
    'text-brand-ink hover:bg-brand-bg flex min-h-[44px] w-full items-center gap-2.5 px-4 text-left text-sm';

  return (
    <header className="bg-brand-red sticky top-0 z-50 flex h-14 items-center gap-1 px-2 sm:gap-3 sm:px-4 lg:gap-5 lg:px-5">
      {onMenuClick && (
        <button
          type="button"
          aria-label="Mở menu"
          onClick={onMenuClick}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[22px] text-white hover:bg-white/10 lg:hidden"
        >
          ☰
        </button>
      )}

      <Link href="/" className="font-tight shrink-0 text-[19px] font-bold text-white">
        LàngNghề<span className="ml-[3px] text-[13px] font-normal text-white/60">.vn</span>
      </Link>

      <form
        action="/search"
        className="hidden max-w-[420px] flex-1 md:flex"
        onSubmit={
          onSearch
            ? (e) => {
                e.preventDefault();
                onSearch(String(new FormData(e.currentTarget).get('q') ?? ''));
              }
            : undefined
        }
      >
        <input
          name="q"
          type="search"
          aria-label="Tìm kiếm"
          placeholder={searchPlaceholder}
          className="text-brand-ink h-9 min-w-0 flex-1 rounded-l border-none bg-white px-3 text-sm outline-none"
        />
        <button
          type="submit"
          aria-label="Tìm"
          className="bg-brand-orange h-9 w-10 cursor-pointer rounded-r text-sm text-white"
        >
          🔍
        </button>
      </form>

      <div className="ml-auto flex shrink-0 items-center sm:gap-1">
        <Link
          href="/search"
          aria-label="Tìm kiếm"
          title="Tìm kiếm"
          className={`${ICON_CLASS} md:hidden`}
        >
          🔍
        </Link>

        {icons.map((ic) => {
          const href = ic.href ?? ICON_HREF[ic.title];
          const content = (
            <>
              {ic.icon}
              {!!ic.badge && (
                <span className="text-brand-red absolute top-0.5 right-0 min-w-[16px] rounded-full bg-white px-1 text-center text-[10px] leading-4 font-bold">
                  {ic.badge > 99 ? '99+' : ic.badge}
                </span>
              )}
            </>
          );
          return href && !ic.onClick ? (
            <Link
              key={ic.title}
              href={href}
              title={ic.title}
              aria-label={ic.title}
              className={ICON_CLASS}
            >
              {content}
            </Link>
          ) : (
            <button
              key={ic.title}
              type="button"
              title={ic.title}
              aria-label={ic.title}
              onClick={ic.onClick}
              className={`${ICON_CLASS} cursor-pointer`}
            >
              {content}
            </button>
          );
        })}

        <div ref={menuRef} className="relative ml-1">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
            className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-1 text-white hover:bg-white/10 sm:px-2"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/25 text-xs font-bold">
              {userInitial ?? userName.charAt(0)}
            </div>
            <div className="hidden max-w-[160px] text-left sm:block">
              <div className="truncate text-xs font-medium">{userName}</div>
              <div className="text-[11px] opacity-70">{userRole}</div>
            </div>
            <span className="hidden text-[9px] opacity-70 sm:inline">▾</span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="border-brand-border absolute top-[calc(100%+6px)] right-0 w-[240px] overflow-hidden rounded-[10px] border bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
            >
              <div className="border-brand-border border-b px-4 py-2.5">
                <div className="text-brand-ink truncate text-sm font-semibold">{userName}</div>
                <div className="text-brand-sub text-xs">{userRole}</div>
              </div>
              {accountRole === 'both' && (
                <>
                  <Link href="/dashboard" role="menuitem" className={menuItemClass}>
                    🛒 Khu mua hàng
                  </Link>
                  <Link href="/supplier/dashboard" role="menuitem" className={menuItemClass}>
                    🏭 Khu bán hàng
                  </Link>
                </>
              )}
              <Link href="/" role="menuitem" className={menuItemClass}>
                🏠 Trang chủ sàn
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                className={`${menuItemClass} text-brand-red`}
              >
                ↩ Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
