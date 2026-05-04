// Bare-bones login page — full UX comes in Phase F. This is the minimum
// required so unauth'd users hitting any protected route have somewhere
// to land. Posts directly to Supabase Auth; on success middleware redirects
// them to wherever they were going (or '/').
'use client';

import { Suspense, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

export default function LoginPage() {
  // useSearchParams forces client-side bailout; wrapping in Suspense keeps
  // the build step happy on Next 16+ which requires it.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect') || '/';
  const expired = params.get('expired') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    router.push(redirect);
    router.refresh();
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form
        onSubmit={onSubmit}
        style={{
          background: '#fff', borderRadius: 8, padding: 32, width: 360,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #E2E6EB',
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>TKBS CRM</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>Sign in to continue.</p>

        {expired && (
          <div style={errorStyle}>Your session expired. Please sign in again.</div>
        )}
        {error && <div style={errorStyle}>{error}</div>}

        <label style={labelStyle}>Email</label>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />

        <label style={labelStyle}>Password</label>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

        <button
          type="submit"
          disabled={submitting || !email || !password}
          style={{
            width: '100%', marginTop: 16, padding: '10px 16px',
            background: '#00D4AA', color: '#1B2838', border: 'none',
            borderRadius: 4, fontSize: 14, fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

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
