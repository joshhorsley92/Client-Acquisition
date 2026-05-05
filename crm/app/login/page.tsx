// Login + password recovery page.
//
// Three modes detected from the URL hash / search params:
//   1. Normal sign-in   — show email/password form
//   2. Password recovery — Supabase put `#access_token=...&type=recovery&...`
//      in the hash. The browser SDK auto-establishes a recovery session
//      on load. We show a "set new password" form instead of sign-in.
//   3. Already signed in — middleware should redirect, but defense-in-depth
//      pushes to / on render.

'use client';

import { Suspense, useEffect, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { humanizeError } from '@/lib/humanize-error';
import { ErrorBox } from '@/components/ui/Forms';
import { Spinner } from '@/components/Skeleton';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContents />
    </Suspense>
  );
}

function LoginContents() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect') || '/';
  const expired = params.get('expired') === '1';

  const supabase = createClient();
  const [mode, setMode] = useState<'signin' | 'recovery' | 'detecting'>('detecting');

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event: string, session: unknown) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recovery');
        return;
      }
      if (event === 'SIGNED_IN' && session && mode !== 'recovery') {
        router.push(redirect);
      }
    });

    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      setMode('recovery');
    } else {
      setMode('signin');
    }

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mode === 'detecting') {
    return (
      <CenteredCard>
        <div className="flex items-center gap-2 text-[13px] text-ink-muted">
          <Spinner /> Loading…
        </div>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard>
      {mode === 'recovery' ? (
        <SetPasswordForm onDone={() => router.push(redirect)} />
      ) : (
        <SignInForm
          supabase={supabase}
          expired={expired}
          onSuccess={() => { router.push(redirect); router.refresh(); }}
        />
      )}
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-surface rounded-lg p-8 w-[380px] shadow-card border border-edge">
        <h1 className="text-[22px] font-bold mb-1 text-ink">TKBS CRM</h1>
        {children}
      </div>
    </main>
  );
}

function SignInForm({
  supabase, expired, onSuccess,
}: { supabase: ReturnType<typeof createClient>; expired: boolean; onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(''); setSubmitting(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (authError) { setError(humanizeError(authError)); return; }
    onSuccess();
  }

  const labelClass = 'block text-xs text-ink-muted mb-1 mt-3';
  const inputClass = 'w-full px-2.5 py-2 border border-edge rounded text-[13px] bg-surface focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none';

  return (
    <>
      <p className="text-[13px] text-ink-muted mb-5">Sign in to continue.</p>
      {expired && <ErrorBox>Your session expired. Please sign in again.</ErrorBox>}
      {error && <ErrorBox>{error}</ErrorBox>}
      <form onSubmit={onSubmit}>
        <label className={labelClass}>Email</label>
        <input
          type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <label className={labelClass}>Password</label>
        <input
          type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={submitting || !email || !password}
          className="w-full mt-4 px-4 py-2.5 bg-brand-mint text-brand-charcoal border-none rounded text-sm font-semibold cursor-pointer hover:bg-brand-mint-dark disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-brand-mint"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </>
  );
}

function SetPasswordForm({ onDone }: { onDone: () => void }) {
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords don\'t match.'); return; }
    setError(''); setSubmitting(true);
    const { error: updErr } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updErr) { setError(humanizeError(updErr)); return; }
    onDone();
  }

  const labelClass = 'block text-xs text-ink-muted mb-1 mt-3';
  const inputClass = 'w-full px-2.5 py-2 border border-edge rounded text-[13px] bg-surface focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none';

  return (
    <>
      <p className="text-[13px] text-ink-muted mb-5">Set a new password to finish signing in.</p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <form onSubmit={onSubmit}>
        <label className={labelClass}>New password</label>
        <input
          type="password" autoComplete="new-password" required minLength={8}
          value={password} onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <label className={labelClass}>Confirm new password</label>
        <input
          type="password" autoComplete="new-password" required minLength={8}
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={submitting || password.length < 8 || password !== confirm}
          className="w-full mt-4 px-4 py-2.5 bg-brand-mint text-brand-charcoal border-none rounded text-sm font-semibold cursor-pointer hover:bg-brand-mint-dark disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-brand-mint"
        >
          {submitting ? 'Saving…' : 'Set password and continue'}
        </button>
      </form>
    </>
  );
}
