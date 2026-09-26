// Cờ bật/tắt tính năng làm dở (bước 0.7, xem docs/QUY_TRINH_DEPLOY.md).
// Bật bằng NEXT_PUBLIC_FEATURE_<TÊN>=1; biến được gắn lúc build nên đổi
// giá trị trên Vercel phải redeploy.
//
// Next.js chỉ thay biến NEXT_PUBLIC_* khi viết đầy đủ tên
// (process.env.NEXT_PUBLIC_X), nên mỗi cờ phải ghi tay ở đây.

function on(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export const features = {
  cart: on(process.env.NEXT_PUBLIC_FEATURE_CART),
  messaging: on(process.env.NEXT_PUBLIC_FEATURE_MESSAGING),
  disputes: on(process.env.NEXT_PUBLIC_FEATURE_DISPUTES),
} as const;

export type Feature = keyof typeof features;
