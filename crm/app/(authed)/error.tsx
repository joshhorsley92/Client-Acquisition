'use client';

// Error boundary for any (authed) route segment. Next.js renders this
// when a Server Component throws or a client error bubbles up.

import { useEffect } from 'react';
import Link from 'next/link';
import { humanizeError } from '@/lib/humanize-error';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Forms';

export default function AuthedError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[authed-error]', error);
  }, [error]);

  return (
    <div className="max-w-[480px] mx-auto my-10 p-6">
      <h1 className="text-xl font-bold mb-2 text-ink">Something went wrong</h1>
      <p className="text-[13px] text-ink-muted mb-4">
        {humanizeError(error)}
        {error.digest && (
          <span className="block mt-2 text-[11px] text-ink-faint">
            Reference: {error.digest}
          </span>
        )}
      </p>
      <div className="flex gap-2">
        <PrimaryButton onClick={reset}>Try again</PrimaryButton>
        <Link href="/">
          <SecondaryButton type="button">Back to dashboard</SecondaryButton>
        </Link>
      </div>
    </div>
  );
}
