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

  // Mode detection: when the user clicks a recovery link, Supabase puts
  // `#access_token=...&type=recovery&refresh_token=...` in the URL hash and
  // the browser SDK auto-establishes a recovery session. We swap to the
  // "set new password" form when that happens.
  const [mode, setMode] = useState<'signin' | 'recovery' | 'detecting'>('detecting');

  useEffect(() => {
    // Subscribe to auth events. PASSWORD_RECOVERY fires after the SDK
    // processes a recovery hash on page load.
    const { data: sub } = supabase.auth.onAuthStateChange((event: string, session: unknown) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recovery');
        return;
      }
      if (event === 'SIGNED_IN' && session && mode !== 'recovery') {
        // Already signed in (cookie persisted) — bounce to home.
        router.push(redirect);
      }
    });

    // Initial check: hash includes type=recovery means recovery flow even
    // before the SDK fires its event.
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      setMode('recovery');
    } else {
      setMode('signin');
    }

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mode === 'detecting') {
    return <CenteredCard><p style={{ fontSize: 13, color: '#64748B' }}>Loading…</p></CenteredCard>;
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
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 8, padding: 32, width: 380,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #E2E6EB',
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>TKBS CRM</h1>
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
    if (authError) { setError(authError.message); return; }
    onSuccess();
  }

  return (
    <>
      <p style={subtitleStyle}>Sign in to continue.</p>
      {expired && <div style={errorStyle}>Your session expired. Please sign in again.</div>}
      {error && <div style={errorStyle}>{error}</div>}
      <form onSubmit={onSubmit}>
        <label style={labelStyle}>Email</label>
        <input
          type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <label style={labelStyle}>Password</label>
        <input
          type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={submitting || !email || !password}
          style={primaryBtn(submitting || !email || !password)}
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
    if (updErr) { setError(updErr.message); return; }
    onDone();
  }

  return (
    <>
      <p style={subtitleStyle}>Set a new password to finish signing in.</p>
      {error && <div style={errorStyle}>{error}</div>}
      <form onSubmit={onSubmit}>
        <label style={labelStyle}>New password</label>
        <input
          type="password" autoComplete="new-password" required minLength={8}
          value={password} onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        <label style={labelStyle}>Confirm new password</label>
        <input
          type="password" autoComplete="new-password" required minLength={8}
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={submitting || password.length < 8 || password !== confirm}
          style={primaryBtn(submitting || password.length < 8 || password !== confirm)}
        >
          {submitting ? 'Saving…' : 'Set password and continue'}
        </button>
      </form>
    </>
  );
}

const subtitleStyle: React.CSSProperties = { fontSize: 13, color: '#64748B', marginBottom: 20 };
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4, marginTop: 12,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
  borderRadius: 4, fontSize: 13,
};
const errorStyle: React.CSSProperties = {
  background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991b1b',
  padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 12,
};
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  width: '100%', marginTop: 16, padding: '10px 16px',
  background: '#00D4AA', color: '#1B2838', border: 'none',
  borderRadius: 4, fontSize: 14, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
});
