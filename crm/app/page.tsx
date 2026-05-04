// Placeholder home — gets replaced in Phase F by the real Home dashboard
// (KPI tiles, recent activity, today's calls). For now this just confirms
// the app boots and the protected-route middleware works.
import { requireAuth, isAuthError } from '@/lib/api-auth';

export default async function HomePage() {
  const result = await requireAuth();
  if (isAuthError(result)) {
    // Middleware should have already redirected. This is a defense-in-depth
    // for the rare race where middleware doesn't fire.
    return null;
  }
  const { auth } = result;
  return (
    <main style={{ padding: 40, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>TKBS CRM v1.0</h1>
      <p style={{ color: '#64748B', fontSize: 14, marginBottom: 24 }}>
        Logged in as <strong>{auth.name || auth.userId}</strong> ({auth.role}).
      </p>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>
        Phase A scaffolding is live. Pages will appear here as Phase F lands.
      </p>
    </main>
  );
}
