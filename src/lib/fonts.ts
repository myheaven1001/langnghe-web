import { Inter, Inter_Tight } from 'next/font/google';

// Inter / Inter Tight are the typefaces used across the *_page.html
// prototypes (body copy + numeric/headline text respectively). Scoped here
// rather than in the root layout so the Geist-based scaffold pages are
// unaffected — same pattern already used by src/app/login/page.tsx.
export const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
});

export const interTight = Inter_Tight({
  subsets: ['latin', 'vietnamese'],
  weight: ['600', '700'],
  variable: '--font-inter-tight',
});
