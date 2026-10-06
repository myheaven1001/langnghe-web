'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Header, type HeaderProps } from './Header';
import { Sidebar, type SidebarNavGroup } from './Sidebar';

export interface BottomNavItem {
  icon: string;
  label: string;
  href: string;
  count?: number;
}

// Phần tương tác của AppShell: trạng thái mở/đóng ngăn kéo sidebar trên điện
// thoại. Từ `lg` trở lên sidebar luôn hiện bên trái như cũ.
export function ShellFrame({
  header,
  navGroups,
  bottomNav,
  children,
}: {
  header: HeaderProps;
  navGroups: SidebarNavGroup[];
  bottomNav?: BottomNavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Ngăn kéo đang mở: Esc để đóng, khoá cuộn trang nền.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  return (
    <>
      <Header {...header} onMenuClick={() => setDrawerOpen(true)} />

      <div className="min-h-[calc(100vh-56px)] lg:grid lg:grid-cols-[212px_minmax(0,1fr)]">
        <Sidebar groups={navGroups} className="hidden lg:block" />

        <div className="min-w-0">
          <main
            className={`mx-auto w-full max-w-[1180px] px-4 pt-4 lg:px-[26px] lg:pt-[22px] lg:pb-10 ${
              bottomNav ? 'pb-24' : 'pb-10'
            }`}
          >
            {children}
          </main>
        </div>
      </div>

      {/* Ngăn kéo sidebar (dưới lg) */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-[60] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button
            type="button"
            aria-label="Đóng menu"
            className="absolute inset-0 h-full w-full cursor-default bg-black/45"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] flex-col bg-white shadow-xl">
            <div className="bg-brand-red flex h-14 shrink-0 items-center justify-between px-4 text-white">
              <span className="font-tight text-[19px] font-bold">
                LàngNghề<span className="ml-[3px] text-[13px] font-normal text-white/60">.vn</span>
              </span>
              <button
                type="button"
                aria-label="Đóng menu"
                onClick={() => setDrawerOpen(false)}
                className="-mr-2 flex h-10 w-10 items-center justify-center text-xl"
              >
                ✕
              </button>
            </div>
            <Sidebar
              groups={navGroups}
              className="flex-1 overflow-y-auto border-r-0"
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Thanh điều hướng dưới cùng (dưới lg) */}
      {bottomNav && (
        <nav
          aria-label="Điều hướng nhanh"
          className="border-brand-border fixed inset-x-0 bottom-0 z-40 flex border-t bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {bottomNav.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
                  active ? 'text-brand-red font-semibold' : 'text-brand-sub'
                }`}
              >
                <span className="relative text-xl leading-none">
                  {item.icon}
                  {!!item.count && (
                    <span className="bg-brand-red absolute -top-1.5 -right-3 min-w-[16px] rounded-full px-1 text-center text-[10px] leading-4 font-bold text-white">
                      {item.count > 99 ? '99+' : item.count}
                    </span>
                  )}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
