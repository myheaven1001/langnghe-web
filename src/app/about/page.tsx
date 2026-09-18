import type { Metadata } from 'next';
import { Playfair_Display } from 'next/font/google';
import { inter, interTight } from '@/lib/fonts';
import { AboutFaqPageClient } from './_components/AboutFaqPageClient';

// Playfair Display is only used on this page's headlines (matches the
// about_faq_page.html mockup) — scoped here rather than in src/lib/fonts.ts
// so it doesn't load on every page, same reasoning as src/app/login/page.tsx.
const playfair = Playfair_Display({
  subsets: ['latin', 'vietnamese'],
  weight: ['600'],
  variable: '--font-playfair',
});

export const metadata: Metadata = {
  title: 'Về chúng tôi & Câu hỏi thường gặp — LàngNghề.vn',
  description:
    'LàngNghề.vn kết nối 1.200+ xưởng làng nghề Việt Nam với người mua sỉ trong và ngoài nước.',
};

// Ported from about_faq_page.html. Layout, content and interactions (tab
// switch, FAQ accordion, category chips) are preserved; data is hardcoded.
export default function AboutPage() {
  return (
    <div
      className={`${inter.variable} ${interTight.variable} ${playfair.variable} min-h-screen bg-[#F5F5F5] font-[family-name:var(--font-inter)] text-[13px] text-[#1F1F1F]`}
    >
      <AboutFaqPageClient />
    </div>
  );
}
