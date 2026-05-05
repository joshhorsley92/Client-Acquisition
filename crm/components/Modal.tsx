'use client';

// Generic modal — backdrop click + × button close, body scroll lock,
// ESC key, focus trap, focus restoration on close, ARIA dialog semantics.
// Pass `onClose={undefined}` (or omit it) to suppress the close handlers
// while a long operation is running.

import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  open, onClose, title, width = 480, children,
}: {
  open: boolean;
  onClose?: () => void;
  title?: string;
  width?: number;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const raf = window.requestAnimationFrame(() => {
      const node = dialogRef.current;
      if (!node) return;
      const first = node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? node).focus();
    });

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const node = dialogRef.current;
      if (!node) return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((el) => !el.hasAttribute('aria-hidden'));
      if (focusables.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'bg-surface rounded-lg p-6 shadow-modal max-h-[85vh] overflow-auto',
          'animate-fade-in-up',
        )}
        style={{ width }}
      >
        {title && (
          <div className="flex justify-between items-center mb-4">
            <h2 id={titleId} className="text-lg font-semibold m-0">{title}</h2>
            {onClose && (
              <button
                onClick={onClose}
                className="bg-transparent border-none text-xl leading-none cursor-pointer text-ink-muted p-1 hover:text-ink"
                aria-label="Close"
              >
                ×
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
