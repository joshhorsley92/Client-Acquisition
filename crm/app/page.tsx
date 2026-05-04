// Placeholder home — gets replaced in Phase F by the real Home dashboard.
// For now this proves the auth wiring works end-to-end and surfaces any
// failure mode loudly instead of rendering blank.

import { requireAuth, isAuthError } from '@/lib/api-auth';

export default async function HomePage() {
  const result = await requireAuth();

  if (isAuthError(result)) {
    // Middleware should have redirected to /login already. If we land here
    // it usually means the user IS signed in (auth.users exists) but their
    // crm.profiles row is missing or unreadable — show what's wrong.
    let detail = 'Auth check returned an error';
    try {
      const body = await (result as Response).clone().json();
      detail = body.error || detail;
    } catch { /* not JSON */ }
    return (
      <main style={{ padding: 40, maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Auth issue</h1>
        <p style={{ color: '#dc2626', fontSize: 14, marginBottom: 16 }}>{detail}</p>
        <p style={{ color: '#64748B', fontSize: 13 }}>
          Most common cause: your auth.users row exists but crm.profiles is empty.
          Run <code style={{ background: '#F7F8FA', padding: '1px 5px' }}>node supabase/seed-users.mjs</code> from
          the crm/ directory, or insert the row manually:
        </p>
        <pre style={{ background: '#F7F8FA', padding: 12, borderRadius: 4, fontSize: 11, marginTop: 8 }}>{`INSERT INTO crm.profiles (id, name, email, role)
SELECT id, email, email, 'admin' FROM auth.users
WHERE email = 'your@email.com';`}</pre>
      </main>
    );
  }

  const { auth } = result;
  return (
    <main style={{ padding: 40, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>TKBS CRM v1.0</h1>
      <p style={{ color: '#64748B', fontSize: 14, marginBottom: 24 }}>
        Logged in as <strong>{auth.name || auth.userId}</strong> ({auth.role}).
      </p>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 24 }}>
        Phase F (UI pages) is next. Until then, here&apos;s what works right now:
      </p>
      <ul style={{ color: '#1B2838', fontSize: 13, lineHeight: 1.8, marginLeft: 20 }}>
        <li>Auth + middleware ✓ (you logged in successfully)</li>
        <li>51 API endpoints reachable via cookie auth</li>
        <li>13-table Postgres schema in <code style={codeStyle}>crm</code> namespace with RLS</li>
        <li>Supabase Storage bucket <code style={codeStyle}>crm-call-recordings</code></li>
      </ul>
      <p style={{ marginTop: 24 }}>
        <a href="/api/auth/logout" style={{ color: '#00D4AA', fontSize: 13 }}>
          Sign out
        </a>
      </p>
    </main>
  );
}

const codeStyle: React.CSSProperties = {
  background: '#F7F8FA',
  padding: '1px 5px',
  borderRadius: 3,
  fontSize: 12,
  fontFamily: 'monospace',
};
