'use client';

// Root error boundary — catches errors that escape the layout (e.g. in
// the login flow, or before the (authed) tree mounts).

import { useEffect } from 'react';
import { humanizeError } from '@/lib/humanize-error';

export default function RootError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[root-error]', error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-surface border border-edge rounded-lg p-8 w-[420px] shadow-card">
        <h1 className="text-xl font-bold mb-2 text-ink">Something went wrong</h1>
        <p className="text-[13px] text-ink-muted mb-4">{humanizeError(error)}</p>
        <button
          onClick={reset}
          className="px-3.5 py-2 bg-brand-mint text-brand-charcoal border-none rounded text-[13px] font-semibold cursor-pointer hover:bg-brand-mint-dark"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
