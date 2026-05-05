'use client';

// Form layout primitives shared across modals/pages. Pair with
// react-hook-form: pass `error` from `formState.errors[name]?.message` and
// hook the input via `{...register(name)}`.

import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

const inputClasses =
  'w-full px-2.5 py-2 border border-edge rounded text-[13px] font-sans box-border bg-surface ' +
  'focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none ' +
  'disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(inputClasses, className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return <select ref={ref} className={cn(inputClasses, className)} {...rest}>{children}</select>;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(inputClasses, 'min-h-[60px] resize-y', className)}
        {...rest}
      />
    );
  },
);

export function Field({
  label, required, error, children, htmlFor,
}: {
  label: string;
  required?: boolean;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5">
      <label htmlFor={htmlFor} className="block text-xs text-ink-muted mb-1">
        {label}{required && <span className="text-danger"> *</span>}
      </label>
      {children}
      {error && <div className="text-[11px] text-danger mt-1">{error}</div>}
    </div>
  );
}

export function Row({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={cn('grid gap-2.5', cols === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
      {children}
    </div>
  );
}

export function Divider() {
  return <hr className="border-none border-t border-surface-alt my-3.5" />;
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-danger-bg border border-danger-border text-danger-strong px-3 py-2 rounded text-xs mb-3">
      {children}
    </div>
  );
}

export function PrimaryButton({
  className, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cn(
        'px-4 py-2 bg-brand-mint text-brand-charcoal border-none rounded text-[13px] font-semibold',
        'hover:bg-brand-mint-dark transition-colors',
        'disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-brand-mint',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  className, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cn(
        'px-4 py-2 bg-surface text-ink border border-edge rounded text-[13px] font-semibold',
        'hover:bg-surface-alt transition-colors',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DangerButton({
  className, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cn(
        'px-3 py-1.5 bg-danger-bg text-danger-strong border border-danger-border rounded text-xs font-semibold',
        'hover:bg-danger hover:text-white hover:border-danger transition-colors',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  );
}
