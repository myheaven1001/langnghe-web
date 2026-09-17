'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';

// Matches the .overlay/.modal pattern reused across admin_user_management,
// admin_order_management, rfq_create, rfq_detail, supplier_order_list and
// supplier_rfq_inbox: dimmed backdrop (rgba(0,0,0,.45)), centered white
// card with a 12px radius, closed by default (display:none in the HTML).
export function Overlay({
  open,
  onClose,
  children,
  className = '',
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-5 ${className}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      {children}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  children,
  maxWidth = '420px',
  centered = false,
  className = '',
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  /** e.g. '380px' (confirmation modals) up to '440px' (form modals) in the prototypes. */
  maxWidth?: string;
  /** Confirmation-style modals (rfq_create, rfq_detail) center their content and use an icon + title + sub. */
  centered?: boolean;
  className?: string;
}) {
  return (
    <Overlay open={open} onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        style={{ maxWidth }}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white p-6 ${centered ? 'text-center' : ''} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </Overlay>
  );
}

export function ModalIcon({ children }: { children: ReactNode }) {
  return <div className="mb-3.5 text-[44px]">{children}</div>;
}

export function ModalTitle({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-base font-bold">{children}</div>;
}

export function ModalSub({ children }: { children: ReactNode }) {
  return <div className="text-brand-sub mb-4 text-[11.5px] leading-relaxed">{children}</div>;
}

export function ModalActions({
  children,
  vertical = false,
}: {
  children: ReactNode;
  vertical?: boolean;
}) {
  return <div className={`mt-1.5 flex gap-2 ${vertical ? 'flex-col' : ''}`}>{children}</div>;
}
