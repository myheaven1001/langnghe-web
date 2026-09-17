'use client';

import { useState } from 'react';

export interface HeaderIcon {
  icon: string;
  title: string;
  badge?: number;
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
}

// Matches the sticky red top bar (header/.h-search/.h-right/.h-user) shared
// by dashboard_buyer, rfq_list, dashboard_supplier, admin_dashboard, etc.
export function Header({
  searchPlaceholder = 'Tìm sản phẩm, xưởng, ngành hàng...',
  onSearch,
  icons = [],
  userName,
  userRole,
  userInitial,
  onUserClick,
}: HeaderProps) {
  const [query, setQuery] = useState('');

  return (
    <header className="bg-brand-red sticky top-0 z-50 flex h-14 items-center gap-5 px-5">
      <div className="font-tight shrink-0 text-[19px] font-bold text-white">
        LàngNghề<span className="ml-[3px] text-[13px] font-normal text-white/60">.vn</span>
      </div>

      <form
        className="flex max-w-[420px] flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch?.(query);
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="text"
          placeholder={searchPlaceholder}
          className="h-[34px] flex-1 rounded-l border-none px-3 text-xs outline-none"
        />
        <button
          type="submit"
          className="bg-brand-orange h-[34px] w-[38px] cursor-pointer rounded-r text-sm text-white"
        >
          🔍
        </button>
      </form>

      <div className="ml-auto flex shrink-0 items-center gap-4">
        {icons.map((ic) => (
          <button
            key={ic.title}
            type="button"
            title={ic.title}
            onClick={ic.onClick}
            className="relative cursor-pointer text-[17px] text-white/90 hover:text-white"
          >
            {ic.icon}
            {!!ic.badge && (
              <span className="text-brand-red absolute -top-1.5 -right-[7px] min-w-[14px] rounded-lg bg-white px-1 text-center text-[9px] leading-[1.3] font-bold">
                {ic.badge}
              </span>
            )}
          </button>
        ))}

        <button
          type="button"
          onClick={onUserClick}
          className="flex cursor-pointer items-center gap-2 text-white"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-xs font-bold">
            {userInitial ?? userName.charAt(0)}
          </div>
          <div className="text-left">
            <div className="text-xs font-medium">{userName}</div>
            <div className="text-[10px] opacity-70">{userRole}</div>
          </div>
          <span className="text-[9px] opacity-70">▾</span>
        </button>
      </div>
    </header>
  );
}
