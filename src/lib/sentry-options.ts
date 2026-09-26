// Cấu hình Sentry dùng chung cho trình duyệt, server Node và edge (bước 0.8).
// Không có NEXT_PUBLIC_SENTRY_DSN (máy local, CI) thì Sentry tắt hẳn.
//
// Môi trường lấy từ Vercel: production | preview | development, để lỗi của
// Preview (staging) không lẫn với lỗi trang thật.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export const sentryOptions = {
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
  // Gói Sentry miễn phí có hạn mức: chỉ đo hiệu năng 10% request; lỗi thì
  // luôn gửi đủ.
  tracesSampleRate: 0.1,
  // Không gửi IP, cookie, header của người dùng.
  sendDefaultPii: false,
};
