import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Matches .card / .card-hdr / .card-body(.pad) from the prototypes:
// 10px radius, brand-border, white bg, 18px horizontal padding in the header.
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`border-brand-border mb-4 overflow-hidden rounded-[10px] border bg-white ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="border-brand-border flex items-center justify-between border-b px-[18px] py-3.5">
      <div className="flex items-center gap-1.5 text-sm font-bold">{title}</div>
      {action}
    </div>
  );
}

export function CardLink({
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`text-brand-red cursor-pointer text-xs font-semibold hover:underline ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function CardBody({
  children,
  padded = false,
  className = '',
}: {
  children: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return <div className={`${padded ? 'p-[16px_18px]' : 'py-1.5'} ${className}`}>{children}</div>;
}
