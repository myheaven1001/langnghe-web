import type { ButtonHTMLAttributes, ComponentProps } from 'react';
import Link from 'next/link';

// Nút dùng chung (kế hoạch 4.1). Cao tối thiểu 40px ở mọi cỡ màn hình, chữ
// 14px (không dưới 12px), một bộ màu thống nhất thay cho việc mỗi trang tự
// ghép class. Dùng cho các trang làm lại từ bước 4 trở đi.
export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'forest' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-red hover:bg-brand-red-dark text-white',
  secondary: 'border-brand-border hover:border-brand-ink text-brand-ink border-[1.5px] bg-white',
  success: 'bg-brand-green text-white hover:bg-[#008a44]',
  forest: 'bg-brand-forest hover:bg-brand-forest-dark text-white',
  danger: 'border-brand-red text-brand-red border-[1.5px] bg-white hover:bg-[#FFF0F0]',
  ghost: 'text-brand-sub hover:text-brand-ink hover:bg-brand-bg',
};

const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-10 px-4 text-sm',
  lg: 'min-h-12 px-5 text-[15px]',
};

export function buttonClass({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}) {
  return `inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`;
}

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Rộng hết khối chứa — hay dùng trên điện thoại. */
  block?: boolean;
}

export function Button({
  variant,
  size,
  block,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & StyleProps) {
  return (
    <button type={type} className={buttonClass({ variant, size, block, className })} {...props} />
  );
}

/** Link trông như nút (điều hướng), cùng bộ kiểu với Button. */
export function ButtonLink({
  variant,
  size,
  block,
  className,
  ...props
}: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={buttonClass({ variant, size, block, className })} {...props} />;
}
