import type { Config } from 'tailwindcss';

// Palette extracted from the 36 static prototypes (dashboard_buyer_page.html,
// login_page.html, rfq_list_page.html, and the rest of the *_page.html files
// at the repo root). Namespaced under `brand`/`status` instead of top-level
// keys (`red`, `green`, `blue`...) so we don't clobber Tailwind's own color
// scales of the same name.
//
// Note: langnghe_1688_style.html (the homepage) uses a different, more
// muted palette (--red:#B5482E etc.) — that page is an intentional outlier
// and is NOT reflected here; treat it as its own theme if/when it's ported.
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#E53333', // primary brand red — header, primary buttons, active nav
          'red-dark': '#C62828', // hover state for red buttons, red pill/alert text
          red2: '#FF4400', // rarely used accent (only in the 1688-style homepage nav)
          orange: '#FF6A00', // search button, quota bar fill
          ink: '#1F1F1F', // primary text
          sub: '#666666', // secondary text
          light: '#999999', // tertiary/placeholder text
          bg: '#F5F3EF', // page background
          border: '#E0DDD8', // card/input borders
          white: '#FFFFFF',
          green: '#00A650', // trust-score ring, success accents
          blue: '#1677FF', // links, informational accents
          forest: '#1A3A2A', // upgrade/membership CTA
          'forest-dark': '#123020', // hover state for forest buttons
          clay: '#C4622D', // eyebrow text, hover borders
        },
        // Status pill tones shared by rfq_status, order_status, product
        // status, user status, verification cases, etc. Each domain maps
        // its own status strings onto these six tones — see Pill.tsx.
        status: {
          blue: { DEFAULT: '#1677FF', soft: '#E8F1FF' },
          amber: { DEFAULT: '#BA5A17', soft: '#FFF0E0' },
          green: { DEFAULT: '#0F6E56', soft: '#E1F5EE' },
          gray: { DEFAULT: '#888780', soft: '#F0EFEC' },
          red: { DEFAULT: '#C62828', soft: '#FDECEC' },
          purple: { DEFAULT: '#5B4CDB', soft: '#F1EEFF' },
        },
      },
      fontFamily: {
        // Additive only — does not touch the default `sans`/Geist setup
        // used by the rest of the app. Pair with `inter`/`interTight` from
        // src/lib/fonts.ts, which load the actual font files + CSS vars.
        tight: ['var(--font-inter-tight)', 'Inter Tight', 'sans-serif'],
      },
    },
  },
};

export default config;
