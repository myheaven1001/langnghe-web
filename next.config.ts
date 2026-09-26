import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

const nextConfig: NextConfig = {/* config options here */};

// Source map chỉ tải lên Sentry khi build có SENTRY_AUTH_TOKEN (đặt trên
// Vercel); build ở máy và CI bỏ qua bước này.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
});
