// Shared layout for every authenticated page. The route-group folder
// `(authed)` doesn't appear in URLs — it's just a Next.js convention for
// grouping pages under a common layout. Login lives outside this group
// so it doesn't get the sidebar.

import { requireAuth, isAuthError } from '@/lib/api-auth';
import Sidebar from '@/components/Sidebar';

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const result = await requireAuth();
  // Middleware should have redirected unauth'd users to /login already.
  // This is defense-in-depth; we render nothing rather than crash.
  if (isAuthError(result)) return null;
  const { auth } = result;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar user={{ name: auth.name, role: auth.role }} />
      <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
