'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface SidebarNavItem {
  /** Emoji used as the leading nav icon (.nav-icon in the prototypes). */
  icon: string;
  label: string;
  href: string;
  /** Badge count, e.g. open RFQs / unread messages (.nav-count in the prototypes). */
  count?: number;
}

export interface SidebarNavGroup {
  /** Omit for the top ungrouped "Dashboard" item, matching the prototypes. */
  label?: string;
  items: SidebarNavItem[];
}

export function Sidebar({
  groups,
  className = '',
}: {
  groups: SidebarNavGroup[];
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <aside className={`border-brand-border border-r bg-white py-4 ${className}`}>
      {groups.map((group, i) => (
        <div key={group.label ?? `group-${i}`} className="mb-[18px]">
          {group.label && (
            <div className="text-brand-light mb-1.5 px-[18px] text-[10px] font-bold tracking-[.06em] uppercase">
              {group.label}
            </div>
          )}
          {group.items.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 border-l-[3px] px-[18px] py-[9px] text-[12.5px] transition-colors ${
                  active
                    ? 'border-brand-red text-brand-red bg-[#FFF0F0] font-semibold'
                    : 'text-brand-sub hover:text-brand-red border-transparent hover:bg-[#FFF5F5]'
                }`}
              >
                <span className="w-[18px] shrink-0 text-center text-[15px]">{item.icon}</span>
                {item.label}
                {!!item.count && (
                  <span className="bg-brand-red ml-auto rounded-full px-1.5 py-px text-[10px] font-bold text-white">
                    {item.count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
