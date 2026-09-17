import type { ReactNode } from 'react';
import { inter, interTight } from '@/lib/fonts';
import { Header, type HeaderProps } from './Header';
import { Sidebar, type SidebarNavGroup } from './Sidebar';

// The authenticated app shell: sticky red Header + left Sidebar + a
// max-width main column, matching .shell { grid-template-columns: 212px
// 1fr } and .main { padding: 22px 26px 40px; max-width: 1180px } from the
// dashboard/RFQ/order/etc. prototypes. Use for every logged-in page
// (buyer, supplier, admin) by passing role-specific header/nav props.
export function AppShell({
  header,
  navGroups,
  children,
}: {
  header: HeaderProps;
  navGroups: SidebarNavGroup[];
  children: ReactNode;
}) {
  return (
    <div
      className={`${inter.variable} ${interTight.variable} bg-brand-bg text-brand-ink min-h-screen font-[family-name:var(--font-inter)] text-[13px]`}
    >
      <Header {...header} />
      <div className="grid min-h-[calc(100vh-56px)] grid-cols-[212px_1fr]">
        <Sidebar groups={navGroups} />
        <main className="max-w-[1180px] px-[26px] pt-[22px] pb-10">{children}</main>
      </div>
    </div>
  );
}
