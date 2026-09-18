'use client';

import { useState } from 'react';
import { PublicHeader } from '@/components/ui';
import { TabBar } from './TabBar';
import { AboutSection } from './AboutSection';
import { FaqSection } from './FaqSection';

// Matches #about/#faq's tab switcher from the prototype — a single page
// that swaps between the two sections client-side.
export function AboutFaqPageClient() {
  const [tab, setTab] = useState<'about' | 'faq'>('about');

  return (
    <>
      <PublicHeader
        showTopbar={false}
        nav={[
          { label: 'Sản phẩm', href: '/search' },
          { label: 'Nhà cung cấp', href: '/register' },
          { label: 'Về chúng tôi', href: '/about', active: true },
        ]}
        primaryButtonLabel="Đăng ký"
        primaryButtonHref="/register"
      />
      <TabBar active={tab} onChange={setTab} />
      {tab === 'about' ? <AboutSection /> : <FaqSection />}
    </>
  );
}
