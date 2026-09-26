import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry-options';

// Chạy một lần khi server Next.js (Node hoặc edge/proxy) khởi động.
export function register() {
  Sentry.init(sentryOptions);
}

// Lỗi trong Server Component, Server Action, route handler, proxy.
export const onRequestError = Sentry.captureRequestError;
