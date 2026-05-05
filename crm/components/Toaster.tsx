'use client';

// Stacks toast notifications in the bottom-right. Subscribes to the
// module-level bus in lib/toast.ts so any client component can publish via
// `toast.success(...)` without a context provider.

import { useEffect, useState, useCallback } from 'react';
import { subscribeToToasts, type ToastEvent, type ToastTone } from '@/lib/toast';
import { cn } from '@/lib/cn';

type ActiveToast = ToastEvent;

const TONE_CLASSES: Record<ToastTone, string> = {
  success: 'bg-success-bg border-success-border border-l-4 border-l-success text-success',
  error: 'bg-danger-bg border-danger-border border-l-4 border-l-danger text-danger-strong',
  info: 'bg-surface border-edge border-l-4 border-l-ink-muted text-ink',
};

export default function Toaster() {
  const [items, setItems] = useState<ActiveToast[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const unsub = subscribeToToasts((event) => {
      setItems((prev) => [...prev, event]);
      window.setTimeout(() => dismiss(event.id), event.durationMs);
    });
    return unsub;
  }, [dismiss]);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          onClick={() => dismiss(t.id)}
          className={cn(
            'animate-fade-in-up pointer-events-auto cursor-pointer',
            'min-w-[240px] max-w-[380px] px-3.5 py-2.5',
            'border rounded-md shadow-card text-[13px] leading-snug',
            TONE_CLASSES[t.tone],
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
