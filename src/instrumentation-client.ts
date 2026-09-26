import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry-options';

// Lỗi JavaScript trên trình duyệt của khách.
Sentry.init(sentryOptions);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
