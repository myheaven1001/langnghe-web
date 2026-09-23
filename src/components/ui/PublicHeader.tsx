'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserMenu } from './UserMenu';

// Matches the .topbar + header + .search-box pattern shared by the public
// marketplace prototypes (search_results, category_listing, product_detail,
// error_404, ...): dark topbar, solid red header, logo, a search box with an
// optional category <select>, and login/CTA buttons on the right.
//
// Note: this is the *standard* brand-red palette (brand.red etc in
// tailwind.config.ts), not the muted outlier palette used by the homepage
// (see src/app/_components/home/SiteHeader.tsx) — the two are intentionally
// different and not meant to be merged.
export interface PublicHeaderNavItem {
  label: string;
  href: string;
  active?: boolean;
}

export interface PublicHeaderProps {
  showTopbar?: boolean;
  /** Nav links in place of the search box (e.g. about_faq_page.html's
   * header, which has no search box at all). Takes priority over search. */
  nav?: PublicHeaderNavItem[];
  searchCategories?: string[];
  searchPlaceholder?: string;
  /** Initial value for an uncontrolled box (e.g. a product page prefilling
   * its own name). Ignored once searchValue/onSearchValueChange are used. */
  searchDefaultValue?: string;
  /** Controlled search value — pass together with onSearchValueChange to sync
   * the box with other UI (e.g. a "related searches" tag list). Omit both to
   * let the input manage its own value. */
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
  onSearch?: (query: string) => void;
  primaryButtonLabel?: string;
  primaryButtonHref?: string;
}

export function PublicHeader({
  showTopbar = true,
  nav,
  searchCategories,
  searchPlaceholder = 'Tìm sản phẩm, nhà cung cấp, làng nghề...',
  searchDefaultValue,
  searchValue,
  onSearchValueChange,
  onSearch,
  primaryButtonLabel = 'Mua sỉ ngay',
  primaryButtonHref,
}: PublicHeaderProps) {
  const [internalValue, setInternalValue] = useState(searchDefaultValue ?? '');
  const value = searchValue ?? internalValue;
  const setValue = onSearchValueChange ?? setInternalValue;

  return (
    <>
      {showTopbar && (
        <div className="flex items-center justify-between bg-[#333] px-4 py-1 text-[11px] text-[#ccc]">
          <span>LàngNghề.vn — Chợ sỉ thủ công mỹ nghệ Việt Nam</span>
          <div>
            <Link href="/login" className="ml-3 hover:text-white">
              Đăng nhập
            </Link>
            <Link href="/register" className="ml-3 hover:text-white">
              Đăng ký
            </Link>
            <a href="#" className="ml-3 hover:text-white">
              Hỗ trợ
            </a>
          </div>
        </div>
      )}

      <header className="bg-brand-red flex flex-wrap items-center gap-3.5 px-4 py-2.5 sm:flex-nowrap">
        <div className="font-tight shrink-0 text-xl font-bold whitespace-nowrap text-white">
          LàngNghề<span className="ml-[3px] text-[13px] font-normal text-white/65">.vn</span>
        </div>

        {nav ? (
          <nav className="mx-5 flex gap-4">
            {nav.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`text-[13px] ${
                  item.active
                    ? 'border-b-2 border-white/50 font-semibold text-white'
                    : 'text-white/80'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : (
          <form
            className="flex min-w-0 flex-1 basis-full sm:order-none sm:max-w-[680px] sm:basis-auto"
            onSubmit={(e) => {
              e.preventDefault();
              onSearch?.(value);
            }}
          >
            {searchCategories && (
              <select
                aria-label="Chọn ngành hàng để tìm kiếm"
                className="h-9 shrink-0 rounded-l border-none bg-black/15 px-2.5 text-xs text-white outline-none"
              >
                {searchCategories.map((c) => (
                  <option key={c} className="bg-white text-[#333]">
                    {c}
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={searchPlaceholder}
              className={`h-9 min-w-0 flex-1 border-none px-3 text-[13px] outline-none ${
                searchCategories ? '' : 'rounded-l'
              }`}
            />
            <button
              type="submit"
              className="bg-brand-orange h-9 shrink-0 rounded-r px-4.5 text-[13px] font-semibold whitespace-nowrap text-white"
            >
              🔍 Tìm kiếm
            </button>
          </form>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <UserMenu variant="solid" />
          <Link
            href={primaryButtonHref ?? '#'}
            className="text-brand-red rounded bg-white px-2.5 py-[5px] text-xs font-semibold whitespace-nowrap"
          >
            {primaryButtonLabel}
          </Link>
        </div>
      </header>
    </>
  );
}
