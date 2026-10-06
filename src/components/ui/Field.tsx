import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

// Ô nhập dùng chung (kế hoạch 4.1): cao tối thiểu 40px, chữ 16px dưới `lg`
// (iOS không tự phóng to trang) và 14px từ `lg`, viền/focus thống nhất.
const CONTROL =
  'border-brand-border focus:border-brand-red text-brand-ink placeholder:text-brand-light w-full rounded-lg border-[1.5px] bg-white px-3 text-base outline-none disabled:bg-brand-bg disabled:text-brand-sub lg:text-sm';

/** Nhãn + ô nhập + gợi ý/lỗi. Bọc ô nhập trong <label> nên không cần id. */
export function Field({
  label,
  required,
  hint,
  error,
  className = '',
  children,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-brand-ink mb-1.5 block text-[13px] font-semibold">
        {label}
        {required && <span className="text-brand-red"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="text-brand-red mt-1 block text-xs">{error}</span>
      ) : (
        hint && <span className="text-brand-sub mt-1 block text-xs">{hint}</span>
      )}
    </label>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} min-h-10 ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${CONTROL} min-h-10 ${className}`} {...props} />;
}

export function Textarea({
  className = '',
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={`${CONTROL} resize-y py-2 ${className}`} {...props} />;
}
